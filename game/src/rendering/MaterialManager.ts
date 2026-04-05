import { Scene, StandardMaterial, Color3 } from "@babylonjs/core";

/**
 * Central material registry. All shared materials are created once
 * and reused across meshes to minimize draw calls and GPU state changes.
 */
export class MaterialManager {
  private _scene: Scene;
  private _materials: Map<string, StandardMaterial> = new Map();

  constructor(scene: Scene) {
    this._scene = scene;
    this._createDefaults();
  }

  get(name: string): StandardMaterial | undefined {
    return this._materials.get(name);
  }

  /** Create a named material if it doesn't already exist. */
  getOrCreate(name: string, diffuse: Color3, specular?: Color3): StandardMaterial {
    let mat = this._materials.get(name);
    if (!mat) {
      mat = new StandardMaterial(name, this._scene);
      mat.diffuseColor = diffuse;
      if (specular) mat.specularColor = specular;
      mat.freeze();
      this._materials.set(name, mat);
    }
    return mat;
  }

  dispose(): void {
    this._materials.forEach((m) => m.dispose());
    this._materials.clear();
  }

  private _createDefaults(): void {
    this.getOrCreate("road", new Color3(0.173, 0.243, 0.314), new Color3(0.1, 0.1, 0.1)); // #2C3E50
    this.getOrCreate("divider", new Color3(0.9, 0.9, 0.9));
    this.getOrCreate("shoulder", new Color3(1, 0.917, 0)); // #FFEA00
    this.getOrCreate("coin", new Color3(1, 0.85, 0), new Color3(1, 1, 0.5));
  }
}
