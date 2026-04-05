import {
  Scene,
  Mesh,
  MeshBuilder,
  Vector3,
} from "@babylonjs/core";
import { RivalState } from "../types";
import { AssetLoader } from "@engine/AssetLoader";
import {
  LANE_COUNT,
  LANE_WIDTH,
  LANE_SWITCH_BASE_LERP,
  RIVAL_BASE_SPEED_RATIO,
  RIVAL_CHASE_ACCEL,
  RIVAL_BLOCK_PREDICT_TIME,
  RIVAL_BRAKE_CHECK_DECEL,
  RIVAL_RUBBER_BAND_DISTANCE,
  PLAYER_Y,
  PLAYER_HITBOX_HALF_W,
  PLAYER_HITBOX_HALF_L,
} from "../constants";

/**
 * The Rival — a persistent AI opponent with a finite state machine.
 *
 * States:
 *  CHASE       — follows from behind, gradually closing the gap
 *  BLOCK       — moves to the player's target lane to cut them off
 *  BRAKE_CHECK — when ahead, decelerates suddenly
 *  STEAL_POWERUP — diverts to grab a nearby power-up
 *  RECOVER     — rubber-bands back into play after being too far behind
 */
export class RivalAI {
  public mesh: Mesh;
  public state: RivalState = RivalState.Chase;
  public laneIndex: number;

  /** Rival's Z offset relative to the player (positive = ahead). */
  public relativeZ = -30;

  private _scene: Scene;
  private _targetX: number;
  private _laneLerpSpeed: number;
  private _speedRatio: number; // rival's speed as fraction of player's scroll speed
  private _stateTimer = 0;
  private _stateDuration = 0;
  private _aggressionScale = 1.0;
  private _roadOffsetX = 0;

  // Reference to player lane for blocking
  private _playerLaneIndex = 2;

  constructor(scene: Scene) {
    this._scene = scene;
    this.laneIndex = Math.floor(LANE_COUNT / 2);
    this._targetX = this._laneToX(this.laneIndex);
    this._speedRatio = RIVAL_BASE_SPEED_RATIO;
    this._laneLerpSpeed = LANE_SWITCH_BASE_LERP * 1.2;

    // Create a tiny placeholder mesh (replaced by GLB via setAssetLoader)
    this.mesh = MeshBuilder.CreateBox(
      "rival_placeholder",
      { size: 0.01 },
      scene
    );
    this.mesh.isVisible = false;
    this.mesh.position.set(this._targetX, PLAYER_Y, this.relativeZ);
  }

  /** Replace the placeholder with a GLB model from the asset loader. */
  setAssetLoader(assets: AssetLoader): void {
    const clone = assets.cloneTrafficVehicle();
    if (!clone) return;

    const newMesh = clone.mesh;
    // Scale to roughly rival size
    const targetW = PLAYER_HITBOX_HALF_W * 2.2;
    const scaleRatio = targetW / (clone.halfW * 2);
    newMesh.scaling.setAll(scaleRatio);

    // Transfer position
    newMesh.position.copyFrom(this.mesh.position);

    // Dispose old placeholder
    this.mesh.dispose();
    this.mesh = newMesh;
  }

  /** Call every frame with delta time and current player info. */
  update(
    dt: number,
    playerScrollSpeed: number,
    playerLaneIndex: number,
    playerZ: number,
    nearbyPowerUpZ: number | null
  ): void {
    this._playerLaneIndex = playerLaneIndex;
    this._stateTimer += dt;

    // State transitions
    this._evaluateTransitions(nearbyPowerUpZ);

    // State behaviour
    switch (this.state) {
      case RivalState.Chase:
        this._updateChase(dt, playerScrollSpeed);
        break;
      case RivalState.Block:
        this._updateBlock(dt, playerScrollSpeed);
        break;
      case RivalState.BrakeCheck:
        this._updateBrakeCheck(dt, playerScrollSpeed);
        break;
      case RivalState.StealPowerUp:
        this._updateStealPowerUp(dt, playerScrollSpeed, nearbyPowerUpZ);
        break;
      case RivalState.Recover:
        this._updateRecover(dt, playerScrollSpeed);
        break;
    }

    // Smooth lane position
    this._updateLanePosition(dt);

    // Update mesh world position (Z relative to player who sits at ~0)
    this.mesh.position.z = playerZ + this.relativeZ;
  }

  /** Scale difficulty upward as player accumulates score. */
  setDifficulty(scoreNormalized: number): void {
    // scoreNormalized 0..1 maps to aggression 1..2
    this._aggressionScale = 1 + scoreNormalized;
  }

  reset(): void {
    this.state = RivalState.Chase;
    this.laneIndex = Math.floor(LANE_COUNT / 2);
    this._targetX = this._laneToX(this.laneIndex);
    this.relativeZ = -30;
    this._speedRatio = RIVAL_BASE_SPEED_RATIO;
    this._stateTimer = 0;
    this.mesh.position.set(this._targetX, PLAYER_Y, this.relativeZ);
  }

  setRoadOffset(offsetX: number): void {
    if (offsetX === this._roadOffsetX) return;
    this._roadOffsetX = offsetX;
    this._targetX = this._laneToX(this.laneIndex);
  }

  dispose(): void {
    this.mesh.dispose();
  }

  // ─────────────── State Machine ───────────────

  private _changeState(newState: RivalState, duration: number): void {
    this.state = newState;
    this._stateTimer = 0;
    this._stateDuration = duration;
  }

  private _evaluateTransitions(nearbyPowerUpZ: number | null): void {
    // Time-based state expiry
    if (this._stateTimer >= this._stateDuration && this.state !== RivalState.Chase) {
      this._changeState(RivalState.Chase, Infinity);
      return;
    }

    // Rubber-band recovery if too far behind
    if (this.relativeZ < -RIVAL_RUBBER_BAND_DISTANCE) {
      this._changeState(RivalState.Recover, 3);
      return;
    }

    // From CHASE, transition to aggressive states
    if (this.state === RivalState.Chase && this._stateTimer > 2 / this._aggressionScale) {
      // Steal power-up if one is nearby
      if (nearbyPowerUpZ !== null && Math.abs(nearbyPowerUpZ - this.relativeZ) < 60) {
        this._changeState(RivalState.StealPowerUp, 4);
        return;
      }

      const roll = Math.random();
      if (this.relativeZ > 5) {
        // Rival is ahead → can brake-check
        if (roll < 0.3 * this._aggressionScale) {
          this._changeState(RivalState.BrakeCheck, 1.5);
          return;
        }
      }
      if (roll < 0.6 * this._aggressionScale) {
        this._changeState(RivalState.Block, 3);
        return;
      }
    }
  }

  // ─── CHASE ───
  private _updateChase(dt: number, playerSpeed: number): void {
    this._speedRatio = RIVAL_BASE_SPEED_RATIO;
    // Gradually close gap
    const closingSpeed = RIVAL_CHASE_ACCEL * this._aggressionScale * dt;
    this.relativeZ += closingSpeed;

    // Wander lanes slightly
    if (Math.random() < 0.005) {
      const dir = Math.random() < 0.5 ? -1 : 1;
      this.laneIndex = Math.max(0, Math.min(LANE_COUNT - 1, this.laneIndex + dir));
      this._targetX = this._laneToX(this.laneIndex);
    }
  }

  // ─── BLOCK ───
  private _updateBlock(dt: number, playerSpeed: number): void {
    this._speedRatio = RIVAL_BASE_SPEED_RATIO;
    // Mirror the player's lane
    if (this.laneIndex !== this._playerLaneIndex) {
      this.laneIndex = this._playerLaneIndex;
      this._targetX = this._laneToX(this.laneIndex);
    }
    // Stay slightly ahead
    if (this.relativeZ < 10) {
      this.relativeZ += 0.5 * this._aggressionScale * dt;
    }
  }

  // ─── BRAKE CHECK ───
  private _updateBrakeCheck(dt: number, playerSpeed: number): void {
    // Decelerate suddenly
    this.relativeZ -= RIVAL_BRAKE_CHECK_DECEL * this._aggressionScale * dt;
    // Move to player's lane
    if (this.laneIndex !== this._playerLaneIndex) {
      this.laneIndex = this._playerLaneIndex;
      this._targetX = this._laneToX(this.laneIndex);
    }
  }

  // ─── STEAL POWER-UP ───
  private _updateStealPowerUp(
    dt: number,
    playerSpeed: number,
    powerUpZ: number | null
  ): void {
    if (powerUpZ === null) {
      this._changeState(RivalState.Chase, Infinity);
      return;
    }
    // Move toward the power-up's Z
    const dz = powerUpZ - this.relativeZ;
    this.relativeZ += Math.sign(dz) * Math.min(Math.abs(dz), 30 * dt);
  }

  // ─── RECOVER ───
  private _updateRecover(dt: number, playerSpeed: number): void {
    // Fast rubber-band back into play
    this.relativeZ += 20 * dt;
  }

  // ─────────────── Movement ───────────────

  private _updateLanePosition(dt: number): void {
    const currentX = this.mesh.position.x;
    const diff = this._targetX - currentX;
    if (Math.abs(diff) < 0.01) {
      this.mesh.position.x = this._targetX;
    } else {
      const t = 1 - Math.exp(-this._laneLerpSpeed * dt);
      this.mesh.position.x = currentX + diff * t;
    }
  }

  private _laneToX(lane: number): number {
    return (lane - (LANE_COUNT - 1) / 2) * LANE_WIDTH + this._roadOffsetX;
  }
}
