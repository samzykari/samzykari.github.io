import { Engine } from "@babylonjs/core";
import {
  TARGET_FPS,
  FPS_CHECK_INTERVAL,
  LOW_FPS_THRESHOLD,
  AUTO_SCALE_STEP,
  MAX_HARDWARE_SCALE,
} from "../constants";

/**
 * Monitors FPS and automatically reduces rendering quality
 * when performance drops below threshold on integrated GPUs.
 */
export class PerformanceMonitor {
  private _engine: Engine;
  private _fpsHistory: number[] = [];
  private _elapsed = 0;
  private _currentScale: number;
  private _onQualityChange?: (scale: number) => void;
  private _enabled = true;

  constructor(engine: Engine, onQualityChange?: (scale: number) => void) {
    this._engine = engine;
    this._currentScale = engine.getHardwareScalingLevel();
    this._onQualityChange = onQualityChange;
  }

  update(dt: number): void {
    if (!this._enabled) return;
    this._fpsHistory.push(this._engine.getFps());
    this._elapsed += dt;

    if (this._elapsed >= FPS_CHECK_INTERVAL) {
      this._evaluate();
      this._fpsHistory.length = 0;
      this._elapsed = 0;
    }
  }

  private _evaluate(): void {
    if (this._fpsHistory.length === 0) return;

    const avg =
      this._fpsHistory.reduce((sum, v) => sum + v, 0) /
      this._fpsHistory.length;

    if (avg < LOW_FPS_THRESHOLD && this._currentScale < MAX_HARDWARE_SCALE) {
      this._currentScale = Math.min(
        this._currentScale + AUTO_SCALE_STEP,
        MAX_HARDWARE_SCALE
      );
      this._engine.setHardwareScalingLevel(this._currentScale);
      this._onQualityChange?.(this._currentScale);
    }
  }

  get fps(): number {
    return this._engine.getFps();
  }

  get hardwareScale(): number {
    return this._currentScale;
  }

  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
    if (!enabled) {
      this._fpsHistory.length = 0;
      this._elapsed = 0;
    }
  }

  setFixedScale(scale: number): void {
    this._currentScale = scale;
    this._engine.setHardwareScalingLevel(scale);
  }

  reset(): void {
    this._currentScale = 1;
    this._engine.setHardwareScalingLevel(1);
    this._fpsHistory.length = 0;
    this._elapsed = 0;
    this._enabled = true;
  }
}
