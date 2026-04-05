import { Scene, Mesh, SceneLoader, TransformNode, Vector3, Matrix } from "@babylonjs/core";
import "@babylonjs/loaders/glTF";

/** All vehicle model names available for players and traffic. */
const VEHICLE_MODELS = [
  "ambulance",
  "delivery",
  "delivery-flat",
  "firetruck",
  "garbage-truck",
  "hatchback-sports",
  "kart-oobi",
  "kart-oodi",
  "kart-ooli",
  "kart-oopi",
  "kart-oozi",
  "police",
  "race-future",
  "race",
  "sedan-sports",
  "sedan",
  "suv-luxury",
  "suv",
  "taxi",
  "tractor-police",
  "tractor-shovel",
  "tractor",
  "truck-flat",
  "truck",
  "van",
];

/** Model names used for traffic vehicles. */
const TRAFFIC_MODELS = [...VEHICLE_MODELS];

/** Debris model names for collision effects. */
const DEBRIS_MODELS = [
  "debris-bumper",
  "debris-door",
  "debris-tire",
  "debris-spoiler-a",
  "debris-plate-a",
  "debris-nut",
];

/** Road prop models. */
const PROP_MODELS = [
  "cone",
  "cone-flat",
];

interface LoadedModel {
  root: Mesh;
  halfW: number;
  halfL: number;
}

/**
 * Preloads all GLB models from public/models/ and provides
 * fast cloning for player vehicles, traffic, and debris.
 */
export class AssetLoader {
  private _scene: Scene;
  private _models = new Map<string, LoadedModel>();
  private _loaded = false;

  constructor(scene: Scene) {
    this._scene = scene;
  }

  get isLoaded(): boolean {
    return this._loaded;
  }

  /** Load all required models. Call once before gameplay starts. */
  async loadAll(onProgress?: (loaded: number, total: number) => void): Promise<void> {
    const allNames = new Set<string>();
    for (const name of VEHICLE_MODELS) allNames.add(name);
    for (const name of TRAFFIC_MODELS) allNames.add(name);
    for (const name of DEBRIS_MODELS) allNames.add(name);
    for (const name of PROP_MODELS) allNames.add(name);

    const entries = Array.from(allNames);
    let loaded = 0;
    const total = entries.length;
    const promises = entries.map(async (name) => {
      await this._loadModel(name);
      loaded += 1;
      onProgress?.(loaded, total);
    });
    await Promise.all(promises);
    this._loaded = true;
    console.log(`[AssetLoader] Loaded ${this._models.size} models`);
  }

  /** Clone a player vehicle mesh for the given model name. */
  clonePlayerVehicleByName(modelName: string): Mesh | null {
    return this._cloneModel(modelName, `player_${modelName}`);
  }

  /** Clone a random traffic vehicle mesh. Returns { mesh, halfW, halfL, modelName }. */
  cloneTrafficVehicle(): { mesh: Mesh; halfW: number; halfL: number; modelName: string } | null {
    const name = TRAFFIC_MODELS[Math.floor(Math.random() * TRAFFIC_MODELS.length)];
    return this.cloneTrafficVehicleByName(name);
  }

  /** Clone a specific traffic vehicle mesh by model name. */
  cloneTrafficVehicleByName(
    name: string
  ): { mesh: Mesh; halfW: number; halfL: number; modelName: string } | null {
    const model = this._models.get(name);
    if (!model) return null;
    const mesh = this._cloneModel(name, `traffic_${name}`);
    if (!mesh) return null;
    return { mesh, halfW: model.halfW, halfL: model.halfL, modelName: name };
  }

  /** Clone a random debris piece. */
  cloneDebris(): Mesh | null {
    const name = DEBRIS_MODELS[Math.floor(Math.random() * DEBRIS_MODELS.length)];
    return this._cloneModel(name, `debris_${name}`);
  }

  /** Get the collision dimensions for a traffic model. */
  getTrafficDimensions(name: string): { halfW: number; halfL: number } | null {
    const model = this._models.get(name);
    if (!model) return null;
    return { halfW: model.halfW, halfL: model.halfL };
  }

  // ── Private ──

  private async _loadModel(name: string): Promise<void> {
    try {
      const result = await SceneLoader.ImportMeshAsync(
        "",
        `${import.meta.env.BASE_URL}models/`,
        `${name}.glb`,
        this._scene
      );

      // GLB imports create a __root__ TransformNode. Find all meshes.
      const meshes = result.meshes.filter((m) => m.name !== "__root__") as Mesh[];
      if (meshes.length === 0) {
        console.warn(`[AssetLoader] No meshes in ${name}.glb`);
        return;
      }

      // Merge all meshes into one for efficient cloning.
      // First, get the root transform so we can reparent.
      const root = result.meshes[0] as Mesh; // __root__

      // Compute bounding info from all mesh children
      let minX = Infinity, maxX = -Infinity;
      let minZ = Infinity, maxZ = -Infinity;
      for (const m of meshes) {
        m.computeWorldMatrix(true);
        const bounds = m.getBoundingInfo().boundingBox;
        const worldMin = Vector3.TransformCoordinates(bounds.minimumWorld, m.getWorldMatrix());
        const worldMax = Vector3.TransformCoordinates(bounds.maximumWorld, m.getWorldMatrix());
        // For root-level bounding, just use the bounding box directly
        minX = Math.min(minX, bounds.minimumWorld.x);
        maxX = Math.max(maxX, bounds.maximumWorld.x);
        minZ = Math.min(minZ, bounds.minimumWorld.z);
        maxZ = Math.max(maxZ, bounds.maximumWorld.z);
      }

      const halfW = (maxX - minX) / 2;
      const halfL = (maxZ - minZ) / 2;

      // Bake a 180° Y rotation into every child mesh so clones
      // automatically face away from the camera (+Z forward).
      const flipMatrix = Matrix.RotationY(Math.PI);
      for (const m of meshes) {
        m.bakeTransformIntoVertices(flipMatrix);
      }

      // Hide the template — it's only used for cloning
      root.setEnabled(false);
      for (const m of meshes) m.setEnabled(false);

      // Store as root mesh (the __root__ which parents everything)
      this._models.set(name, { root: root as Mesh, halfW, halfL });
    } catch (err) {
      console.warn(`[AssetLoader] Failed to load ${name}.glb:`, err);
    }
  }

  private _cloneModel(name: string, cloneName: string): Mesh | null {
    const model = this._models.get(name);
    if (!model) return null;

    // Clone the entire hierarchy
    const clone = model.root.clone(cloneName, null);
    if (!clone) return null;

    clone.setEnabled(true);
    // Enable all children
    const children = clone.getChildMeshes(false);
    for (const c of children) c.setEnabled(true);

    // Store dimensions in metadata for collision
    clone.metadata = {
      halfW: model.halfW,
      halfL: model.halfL,
      modelName: name,
    };

    return clone as Mesh;
  }

  dispose(): void {
    for (const [, model] of this._models) {
      model.root.dispose(false, true);
    }
    this._models.clear();
  }
}
