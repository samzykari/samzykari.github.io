import {
  Scene,
  Mesh,
  StandardMaterial,
  Color3,
} from "@babylonjs/core";
import { SpatialGrid } from "@physics/SpatialGrid";
import { AssetLoader } from "@engine/AssetLoader";
import {
  LANE_COUNT,
  LANE_WIDTH,
  TRAFFIC_SPAWN_AHEAD,
  TRAFFIC_DESPAWN_BEHIND,
  TRAFFIC_MIN_SPEED_RATIO,
  TRAFFIC_MAX_SPEED_RATIO,
  TRAFFIC_MIN_GAP,
  TRAFFIC_BASE_DENSITY,
  TRAFFIC_MAX_DENSITY,
  TRAFFIC_DENSITY_INCREASE,
  TRAFFIC_MIN_OPEN_LANES,
  TRAFFIC_LANE_CHANGE_CHANCE,
  TRAFFIC_LANE_CHANGE_SPEED,
  TRAFFIC_LANE_CHANGE_COOLDOWN,
  TRAFFIC_SPEED_WOBBLE,
  TRAFFIC_FORMATION_CHANCE,
  TRAFFIC_FORMATION_MIN_Z_GAP,
  DifficultyPreset,
} from "../constants";

interface TrafficCar {
  mesh: Mesh;
  lane: number;
  speed: number;
  halfW: number;
  halfL: number;
  id: number;
  targetLane: number;
  targetX: number;
  laneChangeCooldown: number;
  speedPhase: number;
  baseSpeed: number;
}

export interface TrafficSpawnPayload {
  lane: number;
  zOffset: number;
  speed: number;
  color: string;
  modelName: string;
  scale: number;
}

enum FormationType { Corridor, Diagonal, Staggered }

/**
 * Manages the pool of traffic cars, spawning them ahead and
 * recycling them once behind the player.
 *
 * Features:
 * - Guaranteed passable gap (always ≥ TRAFFIC_MIN_OPEN_LANES clear)
 * - Lane-changing AI (cars drift between lanes, sometimes toward player)
 * - Speed wobble (sinusoidal variation creates breathing gaps)
 * - Formation spawning (corridor / diagonal / staggered patterns)
 */
export class TrafficManager {
  private _scene: Scene;
  private _cars: TrafficCar[] = [];
  private _grid: SpatialGrid<TrafficCar>;
  private _nextId = 0;
  private _elapsed = 0;
  private _spawnZ = 0;
  private _spawnAccumulator = 0;
  private _lastFormationZ = -Infinity;
  private _playerLane = 2; // updated each frame from Game
  private _playerZ = 0;
  private _playerX = 0;
  private _assets: AssetLoader | null = null;
  private _passabilityTimer = 0;
  private _spawnEnabled = true;
  private _roadOffsetX = 0;

  // Reusable Set to avoid per-frame allocations
  private _reusableOccupied = new Set<number>();

  // Difficulty-adjustable parameters (default to constants)
  private _baseDensity = TRAFFIC_BASE_DENSITY;
  private _maxDensity = TRAFFIC_MAX_DENSITY;
  private _densityIncrease = TRAFFIC_DENSITY_INCREASE;
  private _minSpeedRatio = TRAFFIC_MIN_SPEED_RATIO;
  private _maxSpeedRatio = TRAFFIC_MAX_SPEED_RATIO;
  private _minOpenLanes = TRAFFIC_MIN_OPEN_LANES;
  private _formationChance = TRAFFIC_FORMATION_CHANCE;
  private _laneChangeChance = TRAFFIC_LANE_CHANGE_CHANCE;

  // Network hook
  public onSpawn?: (payload: TrafficSpawnPayload) => void;

  // Lane occupancy tracking for minimum gap enforcement
  private _laneFurthestZ: number[] = [];
  // Reusable arrays for _pickSafeLane to avoid per-call allocations
  private _candidates: number[] = [];
  private _weights: number[] = [];

  constructor(scene: Scene) {
    this._scene = scene;
    this._grid = new SpatialGrid<TrafficCar>();

    this._laneFurthestZ = new Array(LANE_COUNT).fill(-Infinity);
  }

  /** Apply a difficulty preset to traffic parameters. */
  setDifficulty(preset: DifficultyPreset): void {
    this._baseDensity = preset.trafficBaseDensity;
    this._maxDensity = preset.trafficMaxDensity;
    this._densityIncrease = preset.trafficDensityIncrease;
    this._minSpeedRatio = preset.trafficMinSpeedRatio;
    this._maxSpeedRatio = preset.trafficMaxSpeedRatio;
    this._minOpenLanes = preset.trafficMinOpenLanes;
    this._formationChance = preset.trafficFormationChance;
    this._laneChangeChance = preset.trafficLaneChangeChance;
  }

  /** Set the asset loader for GLB-based traffic models. */
  setAssetLoader(assets: AssetLoader): void {
    this._assets = assets;
  }

  /** Enable or disable local random spawning (disable for clients). */
  setSpawnEnabled(enabled: boolean): void {
    this._spawnEnabled = enabled;
  }

  /** Update road curve offset to keep traffic aligned with lanes. */
  setRoadOffset(offsetX: number): void {
    if (offsetX === this._roadOffsetX) return;
    const delta = offsetX - this._roadOffsetX;
    this._roadOffsetX = offsetX;
    for (const car of this._cars) {
      car.mesh.position.x += delta;
      car.targetX = this._laneToX(car.targetLane);
    }
  }

  /** Spawn a traffic car from a network payload (client-side). */
  spawnFromNetwork(payload: TrafficSpawnPayload, playerZ: number): void {
    if (!this._assets?.isLoaded) return;

    const result = this._assets.cloneTrafficVehicleByName(payload.modelName);
    if (!result) return;

    const mesh = result.mesh;
    let halfW = result.halfW;
    let halfL = result.halfL;

    mesh.scaling.setAll(payload.scale);
    halfW *= payload.scale;
    halfL *= payload.scale;

    const x = this._laneToX(payload.lane);
    const z = playerZ + payload.zOffset;
    mesh.position.set(x, 0.5, z);
    this._applyTrafficColor(mesh, payload.color);

    const car: TrafficCar = {
      mesh,
      lane: payload.lane,
      speed: payload.speed,
      halfW,
      halfL,
      id: this._nextId++,
      targetLane: payload.lane,
      targetX: x,
      laneChangeCooldown: TRAFFIC_LANE_CHANGE_COOLDOWN * (0.5 + Math.random()),
      speedPhase: Math.random() * Math.PI * 2,
      baseSpeed: payload.speed,
    };

    this._cars.push(car);
  }

  /** Per-frame update. Scrolls traffic, spawns new cars, despawns old ones. */
  update(
    dt: number,
    playerScrollSpeed: number,
    playerX: number,
    playerZ: number,
    playerLane: number
  ): void {
    this._elapsed += dt;
    this._playerLane = playerLane;
    this._playerZ = playerZ;
    this._playerX = playerX;

    const density = Math.min(
      this._baseDensity + this._densityIncrease * this._elapsed,
      this._maxDensity
    );

    // Move existing cars and apply lane-change + speed wobble
    for (let i = this._cars.length - 1; i >= 0; i--) {
      const car = this._cars[i];

      // Speed wobble
      car.speed = car.baseSpeed +
        Math.sin(this._elapsed * 1.5 + car.speedPhase) * TRAFFIC_SPEED_WOBBLE;
      car.speed = Math.max(this._minSpeedRatio, Math.min(this._maxSpeedRatio, car.speed));

      // Forward movement (relative to player)
      const relativeSpeed = playerScrollSpeed - car.speed * playerScrollSpeed;
      car.mesh.position.z -= relativeSpeed * dt;

      // Lane-change lateral movement
      this._updateLaneChange(car, dt);

      // Despawn behind
      if (car.mesh.position.z < playerZ - TRAFFIC_DESPAWN_BEHIND) {
        this._despawn(i);
        continue;
      }

      // Lane-change decision
      this._tryInitiateLaneChange(car, dt);
    }

    // Recalculate lane occupancy from *current* positions
    this._laneFurthestZ.fill(-Infinity);
    for (const car of this._cars) {
      if (car.mesh.position.z > this._laneFurthestZ[car.lane]) {
        this._laneFurthestZ[car.lane] = car.mesh.position.z;
      }
    }

    // Enforce passability every 0.25s (not every frame)
    this._passabilityTimer += dt;
    if (this._passabilityTimer >= 0.25) {
      this._passabilityTimer = 0;
      this._enforcePassability(playerZ);
    }

    if (this._spawnEnabled) {
      // Spawn using fractional accumulator
      const spawnLine = playerZ + TRAFFIC_SPAWN_AHEAD;
      this._spawnAccumulator += density * playerScrollSpeed * dt;
      while (this._spawnAccumulator >= 1) {
        this._spawnAccumulator -= 1;

        // Occasionally spawn a formation instead of a single car
        if (Math.random() < this._formationChance &&
            spawnLine - this._lastFormationZ > TRAFFIC_FORMATION_MIN_Z_GAP) {
          this._trySpawnFormation(spawnLine, playerScrollSpeed);
        } else {
          this._trySpawnCar(spawnLine, playerScrollSpeed);
        }
      }
    }

    // Rebuild spatial grid
    this._rebuildGrid();
  }

  /** Query the spatial grid for cars near a world position. */
  queryCarsNear(x: number, z: number): readonly TrafficCar[] {
    return this._grid.query(x, z);
  }

  /** Get all active cars (for iteration). */
  get activeCars(): readonly TrafficCar[] {
    return this._cars;
  }

  /** Destroy a specific car by ID. Returns its world position or null. */
  destroyCar(carId: number): { x: number; z: number } | null {
    for (let i = 0; i < this._cars.length; i++) {
      if (this._cars[i].id === carId) {
        const pos = {
          x: this._cars[i].mesh.position.x,
          z: this._cars[i].mesh.position.z,
        };
        this._despawn(i);
        return pos;
      }
    }
    return null;
  }

  reset(): void {
    for (let i = this._cars.length - 1; i >= 0; i--) {
      const car = this._cars[i];
      car.mesh.getChildMeshes().forEach((c) => c.dispose());
      car.mesh.dispose();
    }
    this._cars.length = 0;
    this._elapsed = 0;
    this._spawnZ = 0;
    this._spawnAccumulator = 0;
    this._lastFormationZ = -Infinity;
    this._laneFurthestZ.fill(-Infinity);
    this._grid.clear();
    this._playerZ = 0;
    this._roadOffsetX = 0;
  }

  dispose(): void {
    this.reset();
  }

  // ────────────── Lane-Change AI ──────────────

  /** Decide whether a car should start changing lanes. */
  private _tryInitiateLaneChange(car: TrafficCar, dt: number): void {
    car.laneChangeCooldown -= dt;
    if (car.laneChangeCooldown > 0) return;
    // Already mid-change
    if (car.lane !== car.targetLane) return;

    if (Math.abs(car.mesh.position.z - this._playerZ) < 20) return;

    if (Math.random() > this._laneChangeChance * dt) return;

    // Pick a random direction (no player bias)
    let newLane = car.lane + (Math.random() < 0.5 ? -1 : 1);
    newLane = Math.max(0, Math.min(LANE_COUNT - 1, newLane));
    if (newLane === car.lane) return;

    // Safety: don't lane-change into a car that's right next to us
    if (this._isLaneBlockedNear(newLane, car.mesh.position.z, car.halfL * 2.5, car.id)) return;

    // Safety: don't lane-change into the player's lane when close
    if (newLane === this._playerLane && Math.abs(car.mesh.position.z - this._playerZ) < 25) return;

    // Safety: don't violate minimum open lanes at this Z-depth
    const occupied = this._getOccupiedLanesAt(car.mesh.position.z, TRAFFIC_MIN_GAP);
    occupied.delete(car.lane); // car is leaving its lane
    occupied.add(newLane);     // car is entering new lane
    if (LANE_COUNT - occupied.size < this._minOpenLanes) return;

    car.targetLane = newLane;
    car.targetX = this._laneToX(newLane);
    car.laneChangeCooldown = TRAFFIC_LANE_CHANGE_COOLDOWN;
  }

  /** Move a car laterally toward its target lane. */
  private _updateLaneChange(car: TrafficCar, dt: number): void {
    const dx = car.targetX - car.mesh.position.x;
    if (Math.abs(dx) < 0.1) {
      car.mesh.position.x = car.targetX;
      car.lane = car.targetLane;
      return;
    }
    const step = TRAFFIC_LANE_CHANGE_SPEED * dt * Math.sign(dx);
    if (Math.abs(step) >= Math.abs(dx)) {
      car.mesh.position.x = car.targetX;
      car.lane = car.targetLane;
    } else {
      car.mesh.position.x += step;
    }
  }

  /** Check if a lane has a car within ±range Z of a given Z position. */
  private _isLaneBlockedNear(lane: number, z: number, range: number, excludeId: number): boolean {
    for (const car of this._cars) {
      if (car.id === excludeId) continue;
      if (car.lane !== lane && car.targetLane !== lane) continue;
      if (Math.abs(car.mesh.position.z - z) < range) return true;
    }
    return false;
  }

  // ────────────── Passability Enforcement ──────────────

  /**
   * Scan ahead of the player in Z slices. If any slice has fewer than
   * _minOpenLanes free, despawn the most recently spawned car in that
   * slice to open a gap.
   */
  private _enforcePassability(playerZ: number): void {
    const scanAhead = TRAFFIC_SPAWN_AHEAD;
    const sliceDepth = TRAFFIC_MIN_GAP;
    const safeDistance = 50;

    for (let z = playerZ + safeDistance; z < playerZ + scanAhead; z += sliceDepth) {
      const occupied = this._getOccupiedLanesAt(z, sliceDepth);
      if (LANE_COUNT - occupied.size >= this._minOpenLanes) continue;

      // Find the car in this slice with the highest ID (most recent) and remove it
      let bestIdx = -1;
      let bestId = -1;
      for (let i = 0; i < this._cars.length; i++) {
        const car = this._cars[i];
        if (Math.abs(car.mesh.position.z - z) < sliceDepth && car.id > bestId) {
          bestId = car.id;
          bestIdx = i;
        }
      }
      if (bestIdx >= 0) {
        this._despawn(bestIdx);
      }
    }
  }

  // ────────────── Gap Guarantee ──────────────

  /** Get the set of lane indices that have a car within [z-range, z+range]. Reuses internal Set. */
  private _getOccupiedLanesAt(z: number, range: number): Set<number> {
    this._reusableOccupied.clear();
    for (const car of this._cars) {
      if (Math.abs(car.mesh.position.z - z) < range) {
        this._reusableOccupied.add(car.lane);
        if (car.targetLane !== car.lane) this._reusableOccupied.add(car.targetLane);
      }
    }
    return this._reusableOccupied;
  }

  /** Pick a lane for spawning that respects the open-lane guarantee. */
  private _pickSafeLane(spawnZ: number): number | null {
    const occupied = this._getOccupiedLanesAt(spawnZ, TRAFFIC_MIN_GAP);

    const tooCloseToPlayer = spawnZ - this._playerZ < 40;

    // Already at max allowed occupancy
    if (LANE_COUNT - occupied.size <= this._minOpenLanes) return null;

    // Build weighted candidates: prefer lanes with fewer nearby cars
    this._candidates.length = 0;
    for (let l = 0; l < LANE_COUNT; l++) {
      if (occupied.has(l)) continue;
      if (tooCloseToPlayer && l === this._playerLane) continue;
      if (spawnZ - this._laneFurthestZ[l] < TRAFFIC_MIN_GAP) continue;
      this._candidates.push(l);
    }

    if (this._candidates.length === 0) return null;

    // Weighted: lanes further from recent spawns get higher weight
    let totalW = 0;
    this._weights.length = 0;
    for (const l of this._candidates) {
      const gap = spawnZ - this._laneFurthestZ[l];
      const w = Math.min(gap, 200); // cap influence
      this._weights.push(w);
      totalW += w;
    }

    let r = Math.random() * totalW;
    for (let i = 0; i < this._candidates.length; i++) {
      r -= this._weights[i];
      if (r <= 0) return this._candidates[i];
    }
    return this._candidates[this._candidates.length - 1];
  }

  // ────────────── Formation Spawning ──────────────

  private _trySpawnFormation(spawnZ: number, playerSpeed: number): void {
    const type = Math.floor(Math.random() * 3) as 0 | 1 | 2;
    const formationTypes = [FormationType.Corridor, FormationType.Diagonal, FormationType.Staggered];
    const formation = formationTypes[type];

    switch (formation) {
      case FormationType.Corridor:
        this._spawnCorridor(spawnZ, playerSpeed);
        break;
      case FormationType.Diagonal:
        this._spawnDiagonal(spawnZ, playerSpeed);
        break;
      case FormationType.Staggered:
        this._spawnStaggered(spawnZ, playerSpeed);
        break;
    }
  }

  /** Block 2-3 adjacent lanes, leaving the rest open. */
  private _spawnCorridor(spawnZ: number, playerSpeed: number): void {
    const blockCount = Math.random() < 0.5 ? 2 : 3;
    const maxStart = LANE_COUNT - blockCount;
    const startLane = Math.floor(Math.random() * (maxStart + 1));

    // Verify open lanes remain
    const wouldOccupy = this._getOccupiedLanesAt(spawnZ, TRAFFIC_MIN_GAP);
    for (let l = startLane; l < startLane + blockCount; l++) wouldOccupy.add(l);
    if (LANE_COUNT - wouldOccupy.size < this._minOpenLanes) return;

    const zJitter = Math.random() * 15;
    for (let l = startLane; l < startLane + blockCount; l++) {
      if (spawnZ + zJitter - this._laneFurthestZ[l] < TRAFFIC_MIN_GAP) continue;
      this._spawnSingleCar(l, spawnZ + zJitter, playerSpeed * 0.8);
    }
    this._lastFormationZ = spawnZ;
  }

  /** Cars in 3 consecutive lanes staggered diagonally by ~18Z. */
  private _spawnDiagonal(spawnZ: number, playerSpeed: number): void {
    const startLane = Math.floor(Math.random() * Math.max(1, LANE_COUNT - 2));
    const zStep = 18;
    const direction = Math.random() < 0.5 ? 1 : -1; // left-to-right or right-to-left

    for (let i = 0; i < 3; i++) {
      const lane = startLane + (direction > 0 ? i : (2 - i));
      if (lane < 0 || lane >= LANE_COUNT) continue;

      const z = spawnZ + i * zStep;
      const occupied = this._getOccupiedLanesAt(z, TRAFFIC_MIN_GAP);
      occupied.add(lane);
      if (LANE_COUNT - occupied.size < this._minOpenLanes) continue;
      if (z - this._laneFurthestZ[lane] < TRAFFIC_MIN_GAP) continue;

      this._spawnSingleCar(lane, z, playerSpeed * 0.85);
    }
    this._lastFormationZ = spawnZ;
  }

  /** Alternating lanes (0,2,4) at same Z — creates slalom. */
  private _spawnStaggered(spawnZ: number, playerSpeed: number): void {
    const offset = Math.random() < 0.5 ? 0 : 1; // even or odd lanes
    const zJitter = Math.random() * 10;
    const z = spawnZ + zJitter;

    const lanesToFill: number[] = [];
    for (let l = offset; l < LANE_COUNT; l += 2) lanesToFill.push(l);

    // Verify open lanes remain
    const wouldOccupy = this._getOccupiedLanesAt(z, TRAFFIC_MIN_GAP);
    for (const l of lanesToFill) wouldOccupy.add(l);
    if (LANE_COUNT - wouldOccupy.size < this._minOpenLanes) return;

    for (const l of lanesToFill) {
      if (z - this._laneFurthestZ[l] < TRAFFIC_MIN_GAP) continue;
      this._spawnSingleCar(l, z, playerSpeed * 0.8);
    }
    this._lastFormationZ = spawnZ;
  }

  // ────────────── Spawning ──────────────

  private _trySpawnCar(spawnZ: number, playerSpeed: number): void {
    if (spawnZ - this._playerZ < 30 && this._playerLane >= 0) {
      // Avoid sudden spawns too close in the player's lane
      const candidate = this._pickSafeLane(spawnZ + 10);
      if (candidate === null) return;
      this._spawnSingleCar(candidate, spawnZ + 10, playerSpeed);
      this._laneFurthestZ[candidate] = spawnZ + 10;
      return;
    }
    const lane = this._pickSafeLane(spawnZ);
    if (lane === null) return;

    const zJitter = Math.random() * 30;
    this._spawnSingleCar(lane, spawnZ + zJitter, playerSpeed);
    this._laneFurthestZ[lane] = spawnZ + zJitter;
  }

  /** Core spawn: place one car in a specific lane at a specific Z. */
  private _spawnSingleCar(lane: number, z: number, _playerSpeed: number): void {
    // Only spawn GLB models
    if (!this._assets?.isLoaded) return;

    const result = this._assets.cloneTrafficVehicle();
    if (!result) return;

    const mesh = result.mesh;
    let halfW = result.halfW;
    let halfL = result.halfL;
    const modelName = result.modelName;

    // Scale GLB to fit within lane width (~2 units wide target)
    const targetW = 1.8 + Math.random() * 0.4; // 1.8-2.2 units wide
    const scaleRatio = targetW / (halfW * 2);
    mesh.scaling.setAll(scaleRatio);
    halfW = targetW / 2;
    halfL = halfL * scaleRatio;

    const baseSpeed =
      this._minSpeedRatio +
      Math.random() * (this._maxSpeedRatio - this._minSpeedRatio);

    const x = this._laneToX(lane);
    const color = this._randomTrafficColor();
    this._applyTrafficColor(mesh, color);
    mesh.position.set(x, 0.5, z);

    const car: TrafficCar = {
      mesh,
      lane,
      speed: baseSpeed,
      halfW,
      halfL,
      id: this._nextId++,
      targetLane: lane,
      targetX: x,
      laneChangeCooldown: TRAFFIC_LANE_CHANGE_COOLDOWN * (0.5 + Math.random()),
      speedPhase: Math.random() * Math.PI * 2,
      baseSpeed,
    };

    this._cars.push(car);
    this._laneFurthestZ[lane] = Math.max(this._laneFurthestZ[lane], z);

    this.onSpawn?.({
      lane,
      zOffset: z - this._playerZ,
      speed: baseSpeed,
      color,
      modelName,
      scale: scaleRatio,
    });
  }

  private _despawn(index: number): void {
    const car = this._cars[index];
    car.mesh.getChildMeshes().forEach((c) => c.dispose());
    car.mesh.dispose();
    // Swap-remove for O(1)
    this._cars[index] = this._cars[this._cars.length - 1];
    this._cars.pop();
  }

  private _rebuildGrid(): void {
    this._grid.clear();
    for (const car of this._cars) {
      this._grid.insert(car, car.mesh.position.x, car.mesh.position.z);
    }
  }

  private _laneToX(lane: number): number {
    return (lane - (LANE_COUNT - 1) / 2) * LANE_WIDTH + this._roadOffsetX;
  }

  private _randomTrafficColor(): string {
    const palette = ["#ff007f", "#00e5ff", "#ffd700", "#ff6b00", "#7bff00"];
    return palette[Math.floor(Math.random() * palette.length)];
  }

  private _applyTrafficColor(mesh: Mesh, hexColor: string): void {
    const tint = Color3.FromHexString(hexColor);
    const children = mesh.getChildMeshes(false);
    for (const child of children) {
      if (!child.material) continue;
      const cloned = child.material.clone(`traffic_tint_${child.name}`) as StandardMaterial;
      if (!cloned) continue;
      if ("diffuseColor" in cloned) {
        (cloned as StandardMaterial).diffuseColor = Color3.Lerp(
          (cloned as StandardMaterial).diffuseColor,
          tint,
          0.2
        );
        (cloned as StandardMaterial).emissiveColor = tint.scale(0.02);
      }
      if ("albedoColor" in cloned) {
        (cloned as any).albedoColor = Color3.Lerp(
          (cloned as any).albedoColor,
          tint,
          0.2
        );
        (cloned as any).emissiveColor = tint.scale(0.02);
      }
      child.material = cloned;
    }
  }
}
