import {
  Scene,
  ParticleSystem,
  Texture,
  Color4,
  Vector3,
  AbstractMesh,
  Mesh,
} from "@babylonjs/core";
import { AssetLoader } from "@engine/AssetLoader";

/**
 * Manages visual effects: nitro exhaust flames, EMP pulse particles,
 * collision debris, etc.
 */
export class EffectsManager {
  private _scene: Scene;
  private _nitroSystem: ParticleSystem | null = null;
  private _assets: AssetLoader | null = null;
  private _activeDebrisCount = 0;
  private static readonly MAX_DEBRIS = 8;

  constructor(scene: Scene) {
    this._scene = scene;
  }

  /** Set the asset loader for debris spawning. */
  setAssetLoader(assets: AssetLoader): void {
    this._assets = assets;
  }

  /** Spawn debris pieces flying outward from a collision position. */
  spawnCollisionDebris(x: number, z: number): void {
    if (!this._assets?.isLoaded) return;
    // Cap concurrent debris to prevent observer accumulation
    if (this._activeDebrisCount >= EffectsManager.MAX_DEBRIS) return;

    const count = Math.min(2, EffectsManager.MAX_DEBRIS - this._activeDebrisCount);
    for (let i = 0; i < count; i++) {
      const piece = this._assets.cloneDebris();
      if (!piece) continue;
      this._activeDebrisCount++;

      piece.position.set(x, 0.8, z);
      piece.scaling.setAll(0.5 + Math.random() * 0.5);

      // Random rotation
      piece.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI
      );

      // Animate debris flying outward
      const vx = (Math.random() - 0.5) * 12;
      const vy = 3 + Math.random() * 5;
      const vz = (Math.random() - 0.5) * 12;
      const spin = (Math.random() - 0.5) * 8;
      let elapsed = 0;

      const obs = this._scene.onBeforeRenderObservable.add(() => {
        const dt = this._scene.getEngine().getDeltaTime() / 1000;
        elapsed += dt;

        piece.position.x += vx * dt;
        piece.position.y += (vy - 9.8 * elapsed) * dt;
        piece.position.z += vz * dt;
        piece.rotation.x += spin * dt;
        piece.rotation.z += spin * 0.7 * dt;

        // Dispose after falling below road or after 1.5 seconds
        if (piece.position.y < -2 || elapsed > 1.5) {
          this._scene.onBeforeRenderObservable.remove(obs);
          piece.getChildMeshes().forEach((c) => c.dispose());
          piece.dispose();
          this._activeDebrisCount--;
        }
      });
    }
  }

  /** Create and start a nitro exhaust flame behind a mesh. */
  startNitroFlame(emitter: AbstractMesh): void {
    if (this._nitroSystem) this._nitroSystem.dispose();

    const ps = new ParticleSystem("nitro", 200, this._scene);
    ps.emitter = emitter;
    ps.minEmitBox = new Vector3(-0.3, 0, -2);
    ps.maxEmitBox = new Vector3(0.3, 0.2, -2.5);
    ps.direction1 = new Vector3(-0.1, 0, -1);
    ps.direction2 = new Vector3(0.1, 0.2, -1.5);
    ps.minLifeTime = 0.1;
    ps.maxLifeTime = 0.3;
    ps.emitRate = 150;
    ps.minSize = 0.1;
    ps.maxSize = 0.4;
    ps.color1 = new Color4(1, 0.5, 0, 1);
    ps.color2 = new Color4(1, 0.2, 0, 1);
    ps.colorDead = new Color4(0.3, 0.1, 0, 0);
    ps.minEmitPower = 3;
    ps.maxEmitPower = 6;
    ps.updateSpeed = 0.02;
    ps.start();

    this._nitroSystem = ps;
  }

  stopNitroFlame(): void {
    if (this._nitroSystem) {
      this._nitroSystem.stop();
      this._nitroSystem.dispose();
      this._nitroSystem = null;
    }
  }

  /** Brief EMP flash effect (screen-space or particle burst). */
  triggerEMPFlash(): void {
    // Simple approach: create a short-lived particle burst
    const ps = new ParticleSystem("emp", 100, this._scene);
    ps.emitter = Vector3.Zero();
    ps.minEmitBox = new Vector3(-15, 0, -5);
    ps.maxEmitBox = new Vector3(15, 3, 5);
    ps.minLifeTime = 0.2;
    ps.maxLifeTime = 0.5;
    ps.emitRate = 0; // burst mode
    ps.manualEmitCount = 80;
    ps.minSize = 0.3;
    ps.maxSize = 1.0;
    ps.color1 = new Color4(0.5, 0.5, 1, 1);
    ps.color2 = new Color4(1, 1, 1, 1);
    ps.colorDead = new Color4(0, 0, 1, 0);
    ps.gravity = new Vector3(0, -2, 0);
    ps.minEmitPower = 5;
    ps.maxEmitPower = 15;
    ps.start();

    // Auto-dispose after a short delay
    setTimeout(() => ps.dispose(), 1000);
  }

  /** Frontal Blast explosion — orange/yellow burst at a world position. */
  triggerBlastExplosion(x: number, z: number): void {
    const ps = new ParticleSystem("blast", 120, this._scene);
    ps.emitter = new Vector3(x, 1, z);
    ps.minEmitBox = new Vector3(-1, 0, -1);
    ps.maxEmitBox = new Vector3(1, 1, 1);
    ps.minLifeTime = 0.3;
    ps.maxLifeTime = 0.8;
    ps.emitRate = 0; // burst mode
    ps.manualEmitCount = 100;
    ps.minSize = 0.3;
    ps.maxSize = 1.2;
    ps.color1 = new Color4(1, 0.7, 0, 1);   // orange
    ps.color2 = new Color4(1, 1, 0, 1);     // yellow
    ps.colorDead = new Color4(1, 0.3, 0, 0); // fade to red
    ps.gravity = new Vector3(0, -3, 0);
    ps.minEmitPower = 6;
    ps.maxEmitPower = 14;
    ps.start();

    setTimeout(() => ps.dispose(), 1200);
  }

  dispose(): void {
    this._nitroSystem?.dispose();
  }
}
