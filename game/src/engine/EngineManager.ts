import { Engine, Scene } from "@babylonjs/core";

export class EngineManager {
  public engine: Engine;
  public scene!: Scene;
  private _deltaTime = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.engine = new Engine(canvas, true, {
      preserveDrawingBuffer: false,
      stencil: false,
      antialias: true,
      powerPreference: "high-performance",
      failIfMajorPerformanceCaveat: false,
    });

    this.createScene();
    this._setupResize();
  }

  private createScene(): void {
    this.scene = new Scene(this.engine, {
      useGeometryUniqueIdsMap: true,
      useMaterialMeshMap: true,
      useClonedMeshMap: true,
    });
    this.scene.collisionsEnabled = false;
    this.scene.physicsEnabled = false;
    this.scene.blockMaterialDirtyMechanism = true;
  }

  private _setupResize(): void {
    window.addEventListener("resize", () => this.engine.resize());
  }

  /** Start the render loop. `onUpdate` is called each frame with delta seconds. */
  startRenderLoop(onUpdate: (dt: number) => void): void {
    this.engine.runRenderLoop(() => {
      this._deltaTime = this.engine.getDeltaTime() / 1000;
      onUpdate(this._deltaTime);
      this.scene.render();
    });
  }

  stopRenderLoop(): void {
    this.engine.stopRenderLoop();
  }

  get deltaTime(): number {
    return this._deltaTime;
  }

  dispose(): void {
    this.scene.dispose();
    this.engine.dispose();
  }
}
