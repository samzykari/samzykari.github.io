import {
  Scene,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Vector3,
} from "@babylonjs/core";
import { PowerUpType } from "../types";
import { ObjectPool } from "@utils/ObjectPool";
import {
  LANE_COUNT,
  LANE_WIDTH,
  POWERUP_SPAWN_INTERVAL,
  POWERUP_SPAWN_VARIANCE,
  GHOST_DURATION,
  EMP_RANGE,
  COIN_MAGNET_DURATION,
  COIN_MAGNET_RADIUS,
  COIN_SPAWN_INTERVAL,
  COIN_CLUSTER_SIZE,
  COIN_SPACING,
  TRAFFIC_SPAWN_AHEAD,
  PLAYER_HITBOX_HALF_W,
  PLAYER_HITBOX_HALF_L,
} from "../constants";
import { buildAABB, aabbOverlap, scratchA, scratchB } from "@physics/CollisionDetector";

interface ActivePowerUp {
  mesh: Mesh;
  type: PowerUpType;
  lane: number;
  collected: boolean;
}

const POWERUP_COLORS: Record<PowerUpType, Color3> = {
  [PowerUpType.Ghost]: new Color3(0.5, 0.5, 1),
  [PowerUpType.EMP]: new Color3(1, 1, 0),
  [PowerUpType.Nitro]: new Color3(1, 0.3, 0),
  [PowerUpType.CoinMagnet]: new Color3(0, 1, 0.5),
  [PowerUpType.FrontalBlast]: new Color3(1, 0.6, 0),
};

const POWERUP_TYPES = [
  PowerUpType.Ghost,
  PowerUpType.EMP,
  PowerUpType.Nitro,
  PowerUpType.CoinMagnet,
  PowerUpType.FrontalBlast,
];

interface ActiveCoin {
  mesh: Mesh;
}

export class PowerUpManager {
  private _scene: Scene;
  private _active: ActivePowerUp[] = [];
  private _coins: ActiveCoin[] = [];
  private _materials: Map<PowerUpType, StandardMaterial> = new Map();
  private _coinMat!: StandardMaterial;
  private _spawnTimer = 0;
  private _coinSpawnTimer = 0;
  private _nextSpawnTime: number;
  private _roadOffsetX = 0;
  private _spawnMultiplier = 1;
  private _coneMode = false;
  private _coneSpawnTimer = 0;
  private _coneSpawnInterval = 2.5;
  private _cones: Mesh[] = [];
  private _coneMat!: StandardMaterial;

  // Currently held power-ups (max 2)
  public heldPowerUps: PowerUpType[] = [];
  // Currently active effect
  public activeEffect: PowerUpType | null = null;
  public effectTimer = 0;

  public onCollect?: (type: PowerUpType) => void;
  public onActivate?: (type: PowerUpType) => void;
  public onExpire?: (type: PowerUpType) => void;
  public onCoinCollect?: () => void;
  public onConeHit?: () => void;

  constructor(scene: Scene) {
    this._scene = scene;
    this._nextSpawnTime = POWERUP_SPAWN_INTERVAL;
    this._createMaterials();
  }

  update(
    dt: number,
    playerX: number,
    playerZ: number,
    scrollSpeed: number
  ): void {
    // Scroll existing power-ups
    for (let i = this._active.length - 1; i >= 0; i--) {
      const pu = this._active[i];
      pu.mesh.position.z -= scrollSpeed * dt;
      // Rotate for visibility
      pu.mesh.rotation.y += 2 * dt;
      pu.mesh.position.y = 1.5 + Math.sin(this._spawnTimer * 3) * 0.3;

      // Despawn if behind
      if (pu.mesh.position.z < playerZ - 50) {
        pu.mesh.dispose();
        this._active[i] = this._active[this._active.length - 1];
        this._active.pop();
        continue;
      }

      // Collection check
      if (!pu.collected) {
        buildAABB(scratchA, playerX, playerZ, PLAYER_HITBOX_HALF_W + 1, PLAYER_HITBOX_HALF_L + 1);
        buildAABB(scratchB, pu.mesh.position.x, pu.mesh.position.z, 0.8, 0.8);
        if (aabbOverlap(scratchA, scratchB)) {
          this._collect(i);
        }
      }
    }

    // Spawn new power-ups
    this._spawnTimer += dt;
    if (this._spawnTimer >= this._nextSpawnTime) {
      this._spawn(playerZ);
      this._spawnTimer = 0;
      this._nextSpawnTime =
        (POWERUP_SPAWN_INTERVAL +
          (Math.random() * 2 - 1) * POWERUP_SPAWN_VARIANCE) / this._spawnMultiplier;
    }

    // Tick active effect
    if (this.activeEffect !== null) {
      this.effectTimer -= dt;
      if (this.effectTimer <= 0) {
        this.onExpire?.(this.activeEffect);
        this.activeEffect = null;
        this.effectTimer = 0;
      }
    }

    // ── Coins ──
    // Scroll and collect existing coins
    const magnetActive = this.activeEffect === PowerUpType.CoinMagnet;
    for (let i = this._coins.length - 1; i >= 0; i--) {
      const coin = this._coins[i];
      coin.mesh.position.z -= scrollSpeed * dt;
      coin.mesh.rotation.y += 3 * dt;

      // Despawn if behind
      if (coin.mesh.position.z < playerZ - 30) {
        coin.mesh.dispose();
        this._coins[i] = this._coins[this._coins.length - 1];
        this._coins.pop();
        continue;
      }

      // Magnet pull
      if (magnetActive) {
        const dx = playerX - coin.mesh.position.x;
        const dz = playerZ - coin.mesh.position.z;
        const distSq = dx * dx + dz * dz;
        if (distSq < COIN_MAGNET_RADIUS * COIN_MAGNET_RADIUS && distSq > 0.25) {
          const pull = 15 * dt / Math.sqrt(distSq);
          coin.mesh.position.x += dx * pull;
          coin.mesh.position.z += dz * pull;
        }
      }

      // Collection check
      buildAABB(scratchA, playerX, playerZ, PLAYER_HITBOX_HALF_W + 0.8, PLAYER_HITBOX_HALF_L + 0.8);
      buildAABB(scratchB, coin.mesh.position.x, coin.mesh.position.z, 0.5, 0.5);
      if (aabbOverlap(scratchA, scratchB)) {
        this.onCoinCollect?.();
        coin.mesh.dispose();
        this._coins[i] = this._coins[this._coins.length - 1];
        this._coins.pop();
      }
    }

    // Spawn coin clusters
    this._coinSpawnTimer += dt;
    if (this._coinSpawnTimer >= COIN_SPAWN_INTERVAL) {
      this._coinSpawnTimer = 0;
      this._spawnCoinCluster(playerZ);
    }

    // ── Cones (Cone Smash mode) ──
    if (this._coneMode) {
      this._coneSpawnTimer += dt;
      if (this._coneSpawnTimer >= this._coneSpawnInterval) {
        this._coneSpawnTimer = 0;
        this._spawnCone(playerZ);
      }

      for (let i = this._cones.length - 1; i >= 0; i--) {
        const cone = this._cones[i];
        cone.position.z -= scrollSpeed * dt;
        if (cone.position.z < playerZ - 30) {
          cone.dispose();
          this._cones[i] = this._cones[this._cones.length - 1];
          this._cones.pop();
          continue;
        }

        buildAABB(scratchA, playerX, playerZ, PLAYER_HITBOX_HALF_W + 0.6, PLAYER_HITBOX_HALF_L + 0.6);
        buildAABB(scratchB, cone.position.x, cone.position.z, 0.6, 0.6);
        if (aabbOverlap(scratchA, scratchB)) {
          this.onConeHit?.();
          cone.dispose();
          this._cones[i] = this._cones[this._cones.length - 1];
          this._cones.pop();
        }
      }
    }
  }

  /** Player presses power-up activation key. */
  activateHeld(): PowerUpType | null {
    if (this.heldPowerUps.length === 0 || this.activeEffect !== null) return null;
    const type = this.heldPowerUps.shift()!;

    this.activeEffect = type;
    switch (type) {
      case PowerUpType.Ghost:
        this.effectTimer = GHOST_DURATION;
        break;
      case PowerUpType.EMP:
        this.effectTimer = 0.5; // brief flash
        break;
      case PowerUpType.Nitro:
        this.effectTimer = 0; // instant
        break;
      case PowerUpType.CoinMagnet:
        this.effectTimer = COIN_MAGNET_DURATION;
        break;
      case PowerUpType.FrontalBlast:
        this.effectTimer = 0; // instant
        break;
    }

    this.onActivate?.(type);
    return type;
  }

  /** Get the nearest uncollected power-up Z relative to a Z position. */
  getNearestPowerUpZ(z: number): number | null {
    let closest: number | null = null;
    let minDist = Infinity;
    for (const pu of this._active) {
      if (pu.collected) continue;
      const dist = Math.abs(pu.mesh.position.z - z);
      if (dist < minDist) {
        minDist = dist;
        closest = pu.mesh.position.z;
      }
    }
    return closest;
  }

  /** Rival steals the nearest power-up if within range. */
  tryRivalSteal(rivalX: number, rivalZ: number): boolean {
    for (let i = 0; i < this._active.length; i++) {
      const pu = this._active[i];
      if (pu.collected) continue;
      const dx = Math.abs(pu.mesh.position.x - rivalX);
      const dz = Math.abs(pu.mesh.position.z - rivalZ);
      if (dx < 2 && dz < 2) {
        pu.collected = true;
        pu.mesh.dispose();
        this._active[i] = this._active[this._active.length - 1];
        this._active.pop();
        return true;
      }
    }
    return false;
  }

  reset(): void {
    for (const pu of this._active) pu.mesh.dispose();
    this._active.length = 0;
    for (const coin of this._coins) coin.mesh.dispose();
    this._coins.length = 0;
    this.heldPowerUps = [];
    this.activeEffect = null;
    this.effectTimer = 0;
    this._spawnTimer = 0;
    this._coinSpawnTimer = 0;
    this._coneSpawnTimer = 0;
    for (const cone of this._cones) cone.dispose();
    this._cones.length = 0;
  }

  getHeldPowerUps(): PowerUpType[] {
    return [...this.heldPowerUps];
  }

  setSpawnMultiplier(multiplier: number): void {
    this._spawnMultiplier = Math.max(0.5, Math.min(3, multiplier));
  }

  setConeMode(enabled: boolean): void {
    this._coneMode = enabled;
    if (!enabled) {
      for (const cone of this._cones) cone.dispose();
      this._cones.length = 0;
    }
  }

  setRoadOffset(offsetX: number): void {
    if (offsetX === this._roadOffsetX) return;
    const delta = offsetX - this._roadOffsetX;
    this._roadOffsetX = offsetX;
    for (const pu of this._active) {
      pu.mesh.position.x += delta;
    }
    for (const coin of this._coins) {
      coin.mesh.position.x += delta;
    }
  }

  dispose(): void {
    this.reset();
    this._materials.forEach((m) => m.dispose());
    this._coinMat?.dispose();
  }

  // ─────────────── Private ───────────────

  private _createMaterials(): void {
    for (const type of POWERUP_TYPES) {
      const mat = new StandardMaterial(`pu_${type}`, this._scene);
      mat.diffuseColor = POWERUP_COLORS[type];
      mat.emissiveColor = POWERUP_COLORS[type].scale(0.5);
      mat.alpha = 0.85;
      mat.freeze();
      this._materials.set(type, mat);
    }

    // Coin material
    this._coinMat = new StandardMaterial("coinMat", this._scene);
    this._coinMat.diffuseColor = new Color3(1, 0.85, 0);
    this._coinMat.emissiveColor = new Color3(0.4, 0.34, 0);
    this._coinMat.specularColor = new Color3(1, 1, 0.5);
    this._coinMat.specularPower = 32;
    this._coinMat.freeze();

    this._coneMat = new StandardMaterial("coneMat", this._scene);
    this._coneMat.diffuseColor = new Color3(1, 0.4, 0.1);
    this._coneMat.emissiveColor = new Color3(0.2, 0.08, 0.03);
    this._coneMat.specularColor = new Color3(0.1, 0.1, 0.1);
    this._coneMat.freeze();
  }

  private _spawnCone(playerZ: number): void {
    const lane = Math.floor(Math.random() * LANE_COUNT);
    const x = (lane - (LANE_COUNT - 1) / 2) * LANE_WIDTH + this._roadOffsetX;
    const z = playerZ + TRAFFIC_SPAWN_AHEAD * 0.7;
    const cone = MeshBuilder.CreateCylinder(
      "cone",
      { diameterTop: 0.4, diameterBottom: 1.0, height: 1.0, tessellation: 8 },
      this._scene
    );
    cone.position.set(x, 0.6, z);
    cone.material = this._coneMat;
    this._cones.push(cone);
  }

  private _spawn(playerZ: number): void {
    const type = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
    const lane = Math.floor(Math.random() * LANE_COUNT);
    const x = (lane - (LANE_COUNT - 1) / 2) * LANE_WIDTH + this._roadOffsetX;
    const z = playerZ + TRAFFIC_SPAWN_AHEAD * 0.8;

    const mesh = MeshBuilder.CreateBox(
      "powerup",
      { width: 1.2, height: 1.2, depth: 1.2 },
      this._scene
    );
    mesh.position.set(x, 1.5, z);
    mesh.material = this._materials.get(type)!;

    this._active.push({ mesh, type, lane, collected: false });
  }

  private _collect(index: number): void {
    const pu = this._active[index];
    pu.collected = true;
    pu.mesh.dispose();
    this._active[index] = this._active[this._active.length - 1];
    this._active.pop();

    // Add to held queue (max 2)
    if (this.heldPowerUps.length >= 2) {
      this.heldPowerUps.shift();
    }
    this.heldPowerUps.push(pu.type);
    this.onCollect?.(pu.type);
  }

  private _spawnCoinCluster(playerZ: number): void {
    const lane = Math.floor(Math.random() * LANE_COUNT);
    const x = (lane - (LANE_COUNT - 1) / 2) * LANE_WIDTH + this._roadOffsetX;
    const baseZ = playerZ + TRAFFIC_SPAWN_AHEAD * 0.7;

    for (let i = 0; i < COIN_CLUSTER_SIZE; i++) {
      const mesh = MeshBuilder.CreateCylinder(
        "coin",
        { diameter: 0.8, height: 0.15, tessellation: 8 },
        this._scene
      );
      mesh.position.set(x, 1.0, baseZ + i * COIN_SPACING);
      mesh.rotation.x = Math.PI / 2;
      mesh.material = this._coinMat;
      this._coins.push({ mesh });
    }
  }
}
