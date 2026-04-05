import {
  Scene,
  Light,
  HemisphericLight,
  DirectionalLight,
  PointLight,
  Color3,
  Vector3,
} from "@babylonjs/core";
import { BiomeType } from "../types";

/**
 * Manages biome-specific lighting presets.
 * Used by SceneFactory — this module handles the runtime light
 * following (neon lights tracking the player) each frame.
 */
export class LightingManager {
  private _scene: Scene;
  private _movingLights: PointLight[] = [];
  private _currentBiome: BiomeType | null = null;

  constructor(scene: Scene) {
    this._scene = scene;
  }

  /** Register dynamic lights that should follow the player (neon city). */
  registerMovingLights(lights: PointLight[]): void {
    this._movingLights = lights;
  }

  /** Per-frame: move neon lights to follow the player for consistent lighting. */
  update(playerX: number, playerZ: number): void {
    for (const light of this._movingLights) {
      light.position.z = playerZ;
    }
  }

  set currentBiome(biome: BiomeType) {
    this._currentBiome = biome;
    // Collect point lights that should track the player
    // All biomes have accent point lights that track the player
    this._movingLights = this._scene.lights.filter(
      (l) => l instanceof PointLight && l.name.startsWith("accent_")
    ) as PointLight[];
  }

  get currentBiome(): BiomeType | null {
    return this._currentBiome;
  }
}
