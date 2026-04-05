import {
  Scene,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Vector3,
  PointLight,
  ShadowGenerator,
} from "@babylonjs/core";
import { AssetLoader } from "@engine/AssetLoader";
import { VehicleDefinition, VisualCustomization } from "../types";

/**
 * Creates player vehicle meshes using preloaded GLB models from AssetLoader.
 */
export class VehicleFactory {
  private _scene: Scene;
  private _assets: AssetLoader | null = null;

  constructor(scene: Scene) {
    this._scene = scene;
  }

  /** Set the asset loader (call after preloading completes). */
  setAssetLoader(assets: AssetLoader): void {
    this._assets = assets;
  }

  /** Create a composite vehicle mesh for the given definition and customization. */
  createPlayerVehicle(
    def: VehicleDefinition,
    visuals: VisualCustomization,
    shadowGenerator?: ShadowGenerator | null
  ): Mesh {
    // Try GLB model first
    if (this._assets?.isLoaded) {
      const glbMesh = this._assets.clonePlayerVehicleByName(def.modelName);
      if (glbMesh) {
        // Scale to match the vehicle definition dimensions
        const targetW = def.meshScale.x;
        const targetD = def.meshScale.z;
        const dims = glbMesh.metadata as { halfW: number; halfL: number };
        const scaleX = targetW / (dims.halfW * 2);
        const scaleZ = targetD / (dims.halfL * 2);
        const uniformScale = Math.min(scaleX, scaleZ);
        glbMesh.scaling.setAll(uniformScale);

        // Apply paint color to all child meshes that have a material
        this._applyPaintToGLB(glbMesh, visuals.paintColor);

        // Underglow
        if (visuals.underglowEnabled) {
          const glow = new PointLight(
            `underglow_${def.id}`,
            new Vector3(0, -0.3, 0),
            this._scene
          );
          glow.diffuse = Color3.FromHexString(visuals.underglowColor);
          glow.range = 8;
          glow.intensity = 0.6;
          glow.parent = glbMesh;
        }

        // Shadow caster
        if (shadowGenerator) {
          shadowGenerator.addShadowCaster(glbMesh);
          for (const child of glbMesh.getChildMeshes()) {
            shadowGenerator.addShadowCaster(child as Mesh);
          }
        }

        return glbMesh;
      }
    }

    // No GLB model available — create a minimal placeholder
    const placeholder = MeshBuilder.CreateBox(`placeholder_${def.id}`, { size: 1 }, this._scene);
    console.warn(`[VehicleFactory] No GLB model for category "${def.category}"`);
    return placeholder;
  }

  /** Apply paint color tint to a GLB model's materials. */
  private _applyPaintToGLB(mesh: Mesh, hexColor: string): void {
    const normalized = hexColor.toLowerCase();
    if (normalized === "#ffffff" || normalized === "#fff") return;
    const paintColor = Color3.FromHexString(hexColor);
    const children = mesh.getChildMeshes(false);
    for (const child of children) {
      if (child.material) {
        // Clone the material so we don't modify the shared template
        const clonedMat = child.material.clone(`paint_${child.name}`) as StandardMaterial;
        if (!clonedMat) continue;
        if ("diffuseColor" in clonedMat) {
          const orig = (clonedMat as StandardMaterial).diffuseColor;
          (clonedMat as StandardMaterial).diffuseColor = Color3.Lerp(orig, paintColor, 0.25);
          (clonedMat as StandardMaterial).emissiveColor = paintColor.scale(0.02);
          (clonedMat as StandardMaterial).specularColor = new Color3(0.4, 0.4, 0.4);
          (clonedMat as StandardMaterial).specularPower = 48;
        }
        if ("albedoColor" in clonedMat) {
          const pbr = clonedMat as any;
          pbr.albedoColor = Color3.Lerp(pbr.albedoColor, paintColor, 0.25);
          pbr.emissiveColor = paintColor.scale(0.02);
        }
        child.material = clonedMat;
      }
    }
  }

  /** Update paint color on an existing vehicle mesh. */
  setPaintColor(mesh: Mesh, hexColor: string): void {
    const paintColor = Color3.FromHexString(hexColor);
    for (const child of mesh.getChildMeshes(false)) {
      if (!child.material) continue;
      const clonedMat = child.material.clone(`paint_live_${child.name}`) as StandardMaterial;
      if (!clonedMat) continue;
      if ("diffuseColor" in clonedMat) {
        (clonedMat as StandardMaterial).diffuseColor = Color3.Lerp(
          (clonedMat as StandardMaterial).diffuseColor,
          paintColor,
          0.25
        );
        (clonedMat as StandardMaterial).emissiveColor = paintColor.scale(0.02);
      }
      if ("albedoColor" in clonedMat) {
        const pbr = clonedMat as any;
        pbr.albedoColor = Color3.Lerp(pbr.albedoColor, paintColor, 0.25);
        pbr.emissiveColor = paintColor.scale(0.02);
      }
      child.material = clonedMat;
    }
  }
}

/** Default visual customization. */
export function defaultVisuals(): VisualCustomization {
  return {
    paintColor: "#ffffff",
    underglowColor: "#00ffff",
    underglowEnabled: false,
    exhaustFlamesEnabled: false,
  };
}

export function loadVisuals(vehicleId: string): VisualCustomization {
  try {
    const raw = localStorage.getItem("nolaws_save");
    if (!raw) return defaultVisuals();
    const data = JSON.parse(raw);
    const v = data.visuals?.[vehicleId];
    if (v) return v as VisualCustomization;
  } catch {
    // ignore
  }
  return defaultVisuals();
}

export function saveVisuals(vehicleId: string, visuals: VisualCustomization): void {
  try {
    const raw = localStorage.getItem("nolaws_save");
    const data = raw ? JSON.parse(raw) : {};
    if (!data.visuals) data.visuals = {};
    data.visuals[vehicleId] = visuals;
    localStorage.setItem("nolaws_save", JSON.stringify(data));
  } catch {
    // ignore
  }
}
