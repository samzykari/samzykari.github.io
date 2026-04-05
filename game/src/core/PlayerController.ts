import { Scene, Mesh, MeshBuilder, Vector3, Quaternion } from "@babylonjs/core";
import { InputManager } from "@utils/InputManager";
import { VehicleStats, PowerUpType } from "../types";
import {
  LANE_COUNT,
  LANE_WIDTH,
  LANE_SWITCH_BASE_LERP,
  BRAKE_RATE,
  NITRO_SPEED_MULTIPLIER,
  NITRO_DRAIN_RATE,
  PLAYER_HITBOX_HALF_W,
  PLAYER_HITBOX_HALF_L,
  NEAR_MISS_EXPAND_W,
  NEAR_MISS_EXPAND_L,
  PLAYER_Y,
  DRAFT_CONE_HALF_ANGLE,
  DRAFT_MAX_DISTANCE,
  DRAFT_MIN_TIME,
} from "../constants";
import {
  AABB,
  buildAABB,
  aabbOverlap,
  scratchA,
  scratchB,
  scratchC,
} from "@physics/CollisionDetector";

export interface NearMissEvent {
  carId: number;
  time: number;
}

/**
 * PlayerController handles:
 *  - Discrete lane positioning with smooth interpolation
 *  - Acceleration / braking / nitro boost
 *  - Collision hitbox and expanded near-miss hitbox
 *  - Drafting detection behind traffic
 *
 * The player does NOT physically move forward in Z. Instead `scrollSpeed`
 * drives the world toward the player (RoadGenerator & TrafficManager use it).
 */
export class PlayerController {
  public mesh: Mesh;
  public laneIndex: number;
  public scrollSpeed: number;
  public health: number;
  public nitroRemaining: number;
  public isGhostMode = false;
  public isDead = false;

  // Remote opponent visuals
  private _remoteMesh: Mesh | null = null;
  private _remoteTargetPos = new Vector3(0, 0, 0);
  private _remoteTargetRot = new Quaternion(0, 0, 0, 1);
  private _remoteSpeed = 0;
  private _remoteLerpSpeed = 10;

  // Near-miss tracking (per-traffic-car cooldowns)
  private _nearMissCooldowns: Map<number, number> = new Map();

  // Drafting tracking
  private _draftTimer = 0;
  public isDrafting = false;

  // Nitro state
  private _nitroActive = false;
  private _nitroTopSpeedOverride = 0;

  // Stats (set per vehicle)
  private _stats: VehicleStats;
  private _effectiveTopSpeed: number;
  private _laneLerpSpeed: number;

  // Current lane target X
  private _targetX: number;
  private _roadOffsetX = 0;

  // Scene ref
  private _scene: Scene;
  private _input: InputManager;

  // Events
  public onNearMiss?: (evt: NearMissEvent) => void;
  public onCollision?: () => void;
  public onDraftTick?: (dt: number) => void;

  constructor(scene: Scene, input: InputManager, stats: VehicleStats) {
    this._scene = scene;
    this._input = input;
    this._stats = stats;

    this.laneIndex = Math.floor(LANE_COUNT / 2); // centre lane
    this._targetX = this._laneToX(this.laneIndex);
    this.scrollSpeed = 0;
    this.health = stats.health;
    this.nitroRemaining = stats.nitroCapacity;
    this._effectiveTopSpeed = stats.topSpeed;
    this._laneLerpSpeed = LANE_SWITCH_BASE_LERP * stats.handling;

    // ── Create a minimal placeholder mesh (replaced by GLB via rebuildMesh) ──
    this.mesh = MeshBuilder.CreateBox(
      "player_placeholder",
      { size: 0.01 },
      scene
    );
    this.mesh.isVisible = false;
    this.mesh.position.set(this._targetX, PLAYER_Y, 0);
  }

  // ─────────────── Public API ───────────────

  /** Apply upgraded stats (called from garage / game init). */
  setStats(stats: VehicleStats): void {
    this._stats = stats;
    this._effectiveTopSpeed = stats.topSpeed;
    this._laneLerpSpeed = LANE_SWITCH_BASE_LERP * stats.handling;
    this.health = stats.health;
    this.nitroRemaining = stats.nitroCapacity;
  }

  /** Main per-frame update. */
  update(dt: number): void {
    if (this.isDead) return;

    this._handleLaneInput();
    this._updateLanePosition(dt);
    this._updateSpeed(dt);
    this._updateNitro(dt);
    this._decayNearMissCooldowns(dt);
  }

  /**
   * Check a traffic car against the player's collision and near-miss zones.
   * Returns: 'collision' | 'nearMiss' | null
   */
  checkTrafficCar(
    carX: number,
    carZ: number,
    carHalfW: number,
    carHalfL: number,
    carId: number,
    currentTime: number
  ): "collision" | "nearMiss" | null {
    const px = this.mesh.position.x;
    const pz = this.mesh.position.z;

    // Build player collision AABB
    buildAABB(scratchA, px, pz, PLAYER_HITBOX_HALF_W, PLAYER_HITBOX_HALF_L);
    // Build traffic car AABB
    buildAABB(scratchB, carX, carZ, carHalfW, carHalfL);

    // 1) Hard collision
    if (!this.isGhostMode && aabbOverlap(scratchA, scratchB)) {
      return "collision";
    }

    // 2) Near-miss zone (expanded hitbox)
    const nmScale = this._stats.nearMissZoneScale;
    buildAABB(
      scratchC,
      px,
      pz,
      PLAYER_HITBOX_HALF_W + NEAR_MISS_EXPAND_W * nmScale,
      PLAYER_HITBOX_HALF_L + NEAR_MISS_EXPAND_L * nmScale
    );

    if (aabbOverlap(scratchC, scratchB)) {
      // Check cooldown for this specific car
      const lastTrigger = this._nearMissCooldowns.get(carId) ?? 0;
      if (currentTime - lastTrigger > 0.15) {
        this._nearMissCooldowns.set(carId, currentTime);
        return "nearMiss";
      }
    }

    return null;
  }

  /**
   * Check if the player is drafting behind a traffic car.
   * Call for each nearby car ahead of the player.
   */
  checkDrafting(carX: number, carZ: number, dt: number): void {
    const px = this.mesh.position.x;
    const pz = this.mesh.position.z;

    // Car must be ahead (higher Z in world, but since world scrolls toward us,
    // "ahead" means carZ > pz)
    const dz = carZ - pz;
    if (dz <= 0 || dz > DRAFT_MAX_DISTANCE) return;

    const dx = carX - px;
    const angle = Math.abs(Math.atan2(dx, dz));
    if (angle > DRAFT_CONE_HALF_ANGLE) return;

    // In drafting cone
    this._draftTimer += dt;
    if (this._draftTimer >= DRAFT_MIN_TIME) {
      this.isDrafting = true;
      this.onDraftTick?.(dt);
    }
  }

  /** Reset drafting state (call once per frame before checking cars). */
  resetDraftCheck(): void {
    if (this._draftTimer === 0) {
      this.isDrafting = false;
    }
    this._draftTimer = 0;
  }

  /** Handle a collision — reduce health or die. */
  handleCollision(): void {
    if (this.health > 0) {
      this.health--;
      // Brief slow-down on hit
      this.scrollSpeed *= 0.6;
    } else {
      this.isDead = true;
      this.onCollision?.();
    }
  }

  activateNitro(): void {
    if (this.nitroRemaining <= 0 || this._nitroActive) return;
    this._nitroActive = true;
    this._nitroTopSpeedOverride = this._stats.topSpeed * NITRO_SPEED_MULTIPLIER;
  }

  activateGhost(): void {
    this.isGhostMode = true;
    this.mesh.visibility = 0.4;
  }

  deactivateGhost(): void {
    this.isGhostMode = false;
    this.mesh.visibility = 1.0;
  }

  reset(stats: VehicleStats): void {
    this.setStats(stats);
    this.scrollSpeed = 0;
    this.isDead = false;
    this.isGhostMode = false;
    this.mesh.visibility = 1.0;
    this._nitroActive = false;
    this._draftTimer = 0;
    this.isDrafting = false;
    this.laneIndex = Math.floor(LANE_COUNT / 2);
    this._targetX = this._laneToX(this.laneIndex);
    this.mesh.position.set(this._targetX, PLAYER_Y, 0);
    this._nearMissCooldowns.clear();
  }

  setLaneIndex(laneIndex: number, snap = true): void {
    this.laneIndex = Math.max(0, Math.min(LANE_COUNT - 1, laneIndex));
    this._targetX = this._laneToX(this.laneIndex);
    if (snap) this.mesh.position.set(this._targetX, PLAYER_Y, this.mesh.position.z);
  }

  reviveInLane(laneIndex: number, keepSpeed = true): void {
    this.isDead = false;
    this.isGhostMode = false;
    this.mesh.visibility = 1.0;
    this.health = this._stats.health;
    if (!keepSpeed) this.scrollSpeed = 0;
    this.setLaneIndex(laneIndex, true);
  }

  setRoadOffset(offsetX: number): void {
    if (offsetX === this._roadOffsetX) return;
    this._roadOffsetX = offsetX;
    this._targetX = this._laneToX(this.laneIndex);
  }

  /** Replace the player's visual mesh with a new one (e.g. from VehicleFactory). */
  rebuildMesh(newMesh: Mesh): void {
    // Dispose old mesh and all its children
    this.mesh.getChildMeshes().forEach((c) => c.dispose());
    this.mesh.dispose();

    this.mesh = newMesh;
    this.mesh.position.set(this._targetX, PLAYER_Y, 0);
  }

  /** Attach a remote opponent mesh for multiplayer visuals. */
  attachRemoteMesh(mesh: Mesh): void {
    if (this._remoteMesh) {
      this._remoteMesh.getChildMeshes().forEach((c) => c.dispose());
      this._remoteMesh.dispose();
    }
    this._remoteMesh = mesh;
    if (!this._remoteMesh.rotationQuaternion) {
      this._remoteMesh.rotationQuaternion = Quaternion.Identity();
    }
    this._remoteMesh.position.copyFrom(this._remoteTargetPos);
  }

  detachRemoteMesh(): void {
    if (!this._remoteMesh) return;
    this._remoteMesh.getChildMeshes().forEach((c) => c.dispose());
    this._remoteMesh.dispose();
    this._remoteMesh = null;
  }

  /** Update remote target state from network. */
  setRemoteState(
    position: { x: number; y: number; z: number },
    rotation: { x: number; y: number; z: number; w?: number },
    speed: number
  ): void {
    this._remoteTargetPos.set(position.x, position.y, position.z);
    if (rotation.w !== undefined) {
      this._remoteTargetRot.set(rotation.x, rotation.y, rotation.z, rotation.w);
    } else {
      this._remoteTargetRot = Quaternion.FromEulerAngles(rotation.x, rotation.y, rotation.z);
    }
    this._remoteSpeed = speed;
  }

  /** Smoothly move the remote mesh toward the latest network target. */
  updateRemote(dt: number): void {
    if (!this._remoteMesh) return;
    const t = 1 - Math.exp(-this._remoteLerpSpeed * dt);
    this._remoteMesh.position = Vector3.Lerp(this._remoteMesh.position, this._remoteTargetPos, t);
    if (!this._remoteMesh.rotationQuaternion) {
      this._remoteMesh.rotationQuaternion = Quaternion.Identity();
    }
    this._remoteMesh.rotationQuaternion = Quaternion.Slerp(
      this._remoteMesh.rotationQuaternion,
      this._remoteTargetRot,
      t
    );
  }

  get remoteMesh(): Mesh | null {
    return this._remoteMesh;
  }

  get remoteSpeed(): number {
    return this._remoteSpeed;
  }

  get topSpeed(): number {
    return this._stats.topSpeed;
  }

  // ─────────────── Private ───────────────

  private _handleLaneInput(): void {
    if (this._input.isJustPressed("laneLeft")) {
      this.laneIndex = Math.max(0, this.laneIndex - 1);
      this._targetX = this._laneToX(this.laneIndex);
    }
    if (this._input.isJustPressed("laneRight")) {
      this.laneIndex = Math.min(LANE_COUNT - 1, this.laneIndex + 1);
      this._targetX = this._laneToX(this.laneIndex);
    }
  }

  private _updateLanePosition(dt: number): void {
    const currentX = this.mesh.position.x;
    const diff = this._targetX - currentX;

    if (Math.abs(diff) < 0.01) {
      this.mesh.position.x = this._targetX;
    } else {
      // Smooth exponential lerp — framerate independent
      const t = 1 - Math.exp(-this._laneLerpSpeed * dt);
      this.mesh.position.x = currentX + diff * t;
    }
  }

  private _updateSpeed(dt: number): void {
    const topSpeed = this._nitroActive
      ? this._nitroTopSpeedOverride
      : this._effectiveTopSpeed;

    if (this._input.isHeld("brake")) {
      this.scrollSpeed = Math.max(0, this.scrollSpeed - BRAKE_RATE * dt);
    } else {
      // Auto-accelerate toward top speed (endless-runner style)
      this.scrollSpeed +=
        this._stats.acceleration * dt * (1 - this.scrollSpeed / topSpeed);
    }

    // Clamp
    this.scrollSpeed = Math.min(this.scrollSpeed, topSpeed);
    this.scrollSpeed = Math.max(this.scrollSpeed, 0);
  }

  private _updateNitro(dt: number): void {
    if (this._input.isJustPressed("nitro")) {
      this.activateNitro();
    }

    if (this._nitroActive) {
      this.nitroRemaining -= NITRO_DRAIN_RATE * dt;
      if (this.nitroRemaining <= 0) {
        this.nitroRemaining = 0;
        this._nitroActive = false;
      }
    }
  }

  private _decayNearMissCooldowns(dt: number): void {
    // Periodically clean up old entries to avoid map growing unbounded
    if (this._nearMissCooldowns.size > 200) {
      this._nearMissCooldowns.clear();
    }
  }

  /** Convert lane index to world X position. Lane 0 is leftmost. */
  private _laneToX(lane: number): number {
    // Centre the lanes around X=0
    // lane 0 → -(LANE_COUNT/2 - 0.5) * LANE_WIDTH
    // lane 2 (center of 5) → 0
    return (lane - (LANE_COUNT - 1) / 2) * LANE_WIDTH + this._roadOffsetX;
  }
}
