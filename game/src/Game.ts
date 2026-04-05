import {
  ShadowGenerator,
  PointLight,
  FollowCamera,
  ArcRotateCamera,
  MeshBuilder,
  Mesh,
  StandardMaterial,
  Color3,
  Vector3,
  HemisphericLight,
  Viewport,
} from "@babylonjs/core";
import { EngineManager } from "@engine/EngineManager";
import { SceneFactory } from "@engine/SceneFactory";
import { AssetLoader } from "@engine/AssetLoader";
import { InputManager } from "@utils/InputManager";
import { PerformanceMonitor } from "@utils/PerformanceMonitor";
import { PlayerController } from "@core/PlayerController";
import { RoadGenerator } from "@core/RoadGenerator";
import { TrafficManager } from "@core/TrafficManager";
import { RivalAI } from "@core/RivalAI";
import { PowerUpManager } from "@core/PowerUpManager";
import { ScoreManager } from "@core/ScoreManager";
import { LightingManager } from "@rendering/LightingManager";
import { EffectsManager } from "@rendering/EffectsManager";
import { VehicleFactory, loadVisuals } from "@vehicles/VehicleFactory";
import { getVehicleById, VEHICLE_ROSTER } from "@vehicles/VehicleStats";
import { applyUpgrades, loadUpgrades } from "@vehicles/VehicleUpgrades";
import { UIManager } from "@ui/UIManager";
import { HUD } from "@ui/HUD";
import { GarageUI } from "@ui/GarageUI";
import { GameOverUI } from "@ui/GameOverUI";
import { MainMenuUI } from "@ui/MainMenuUI";
import { NetworkManager, RemotePlayerInfo, TrafficSpawnPayload, StartPayload } from "./network/NetworkManager";
import { MatchmakingService } from "./network/MatchmakingService";
import { AudioManager, EngineType } from "@audio/AudioManager";
import {
  GameState,
  BiomeType,
  PowerUpType,
  GameMode,
  VehicleDefinition,
  VehicleCategory,
  VehicleStats,
  VisualCustomization,
} from "./types";
import { RIVAL_RUBBER_BAND_DISTANCE, EMP_RANGE, FRONTAL_BLAST_RANGE, FRONTAL_BLAST_SCORE_BONUS, LANE_WIDTH, LANE_COUNT, DIFFICULTY_PRESETS, DifficultyPreset } from "./constants";

/**
 * Top-level game class. Owns all managers, drives the state machine,
 * and runs the per-frame update loop.
 */
export class Game {
  private static readonly GRAPHICS_STORAGE_KEY = "nolaws_graphics_preset";

  // Engine
  private _engine: EngineManager;
  private _input: InputManager;
  private _perfMon: PerformanceMonitor;
  private _graphicsPreset = "high";

  // State
  private _state: GameState = GameState.Menu;
  private _selectedBiome: BiomeType = BiomeType.ModernCity;
  private _selectedVehicleId = "sedan";
  private _shadowGenerator: ShadowGenerator | null = null;
  private _difficulty = "normal";
  private _mode: GameMode = GameMode.FreeRoam;
  private _modeTimer = 0;
  private _modeTarget = 0;
  private _modeCheckpointZ = 0;
  private _modeLabel = "Free Roam";
  private _modeStatus = "";

  // Core gameplay
  private _player!: PlayerController;
  private _road!: RoadGenerator;
  private _traffic!: TrafficManager;
  private _rival!: RivalAI;
  private _powerUps!: PowerUpManager;
  private _score!: ScoreManager;

  // Rendering
  private _lighting!: LightingManager;
  private _effects!: EffectsManager;
  private _vehicleFactory!: VehicleFactory;
  private _assets!: AssetLoader;
  private _followCamera!: FollowCamera;

  // Garage preview
  private _garageCamera: ArcRotateCamera | null = null;
  private _garagePreviewMesh: Mesh | null = null;
  private _garageStage: Mesh | null = null;
  private _garageLight: PointLight | null = null;
  private _garageFillLight: HemisphericLight | null = null;
  private _garageBackdrop: Mesh | null = null;
  private _garagePreviewOffsetX = 0;
  private _garagePrevFogMode: number | null = null;
  private _garagePrevFogDensity = 0;
  private _garagePrevClearColor: { r: number; g: number; b: number; a: number } | null = null;

  // UI
  private _ui: UIManager;
  private _hud: HUD;
  private _garageUI: GarageUI;
  private _gameOverUI: GameOverUI;
  private _mainMenuUI: MainMenuUI;
  private _audio: AudioManager;
  private _celebrationTimer = 0;

  // Multiplayer
  private _network: NetworkManager;
  private _matchmaking: MatchmakingService;
  private _isMultiplayer = false;
  private _isHost = false;
  private _pendingRoomCreation = false;
  private _mpRoomCode: string | null = null;
  private _remoteInfo: RemotePlayerInfo | null = null;
  private _mpMode = "classicRace";
  private _mpLobbyReadyLocal = false;
  private _mpLobbyReadyRemote = false;
  private _mpCrashLimit = 10;
  private _mpLocalCrashes = 0;
  private _mpRemoteCrashes = 0;
  private _mpCountdown = 0;
  private _mpMatchEnded = false;
  private _mpLocalLane = 0;
  private _mpRemoteLane = 0;
  private _collisionGraceTimer = 0;
  private _crashCooldownTimer = 0;
  private _gameOverResultText = "";

  // Time tracking
  private _gameTime = 0;

  constructor(engine: EngineManager) {
    console.log("[Game] constructor start");
    this._engine = engine;
    this._input = new InputManager();
    this._perfMon = new PerformanceMonitor(engine.engine);

    this._graphicsPreset = this._loadGraphicsPreset();
    this._applyGraphicsPreset(this._graphicsPreset, true);

    // Load persisted vehicle selection
    this._selectedVehicleId = this._loadSelectedVehicleId();
    this._difficulty = this._loadDifficulty();

    // Rendering helpers
    this._lighting = new LightingManager(engine.scene);
    this._effects = new EffectsManager(engine.scene);
    this._vehicleFactory = new VehicleFactory(engine.scene);
    this._assets = new AssetLoader(engine.scene);
    console.log("[Game] rendering helpers OK");

    // Core gameplay managers
    this._road = new RoadGenerator(engine.scene);
    console.log("[Game] road OK");
    this._traffic = new TrafficManager(engine.scene);
    console.log("[Game] traffic OK");
    this._rival = new RivalAI(engine.scene);
    this._powerUps = new PowerUpManager(engine.scene);
    this._score = new ScoreManager();
    console.log("[Game] core managers OK");

    // Build the player with selected vehicle
    const defaultDef = getVehicleById(this._selectedVehicleId) ?? VEHICLE_ROSTER[0];
    const upgrades = loadUpgrades(defaultDef.id);
    const effectiveStats = applyUpgrades(defaultDef.baseStats, upgrades);
    this._player = new PlayerController(engine.scene, this._input, effectiveStats);
    console.log("[Game] player OK");

    // Camera targeting the player mesh
    this._followCamera = SceneFactory.setupCamera(engine.scene, this._player.mesh);

    // UI
    this._ui = new UIManager();
    this._hud = new HUD();
    this._garageUI = new GarageUI();
    this._gameOverUI = new GameOverUI();
    this._mainMenuUI = new MainMenuUI();
    this._network = new NetworkManager();
    this._matchmaking = new MatchmakingService();
    this._audio = new AudioManager(engine.scene);
    console.log("[Game] UI OK");

    this._wireUI();
    this._wireGameplayEvents();
    this._wireNetwork();
    console.log("[Game] wiring OK");

    // Show initial state
    this._changeState(GameState.Menu);
    console.log("[Game] initial state OK");

    // Start render loop
    this._engine.startRenderLoop((dt) => this._update(dt));
    console.log("[Game] constructor done");

    // Kick off async asset loading (non-blocking — game is playable with procedural fallback)
    this._loadAssets();

    window.addEventListener(
      "pointerdown",
      () => {
        this._audio.unlock();
      },
      { once: true }
    );

    document.addEventListener(
      "click",
      () => {
        this._audio.unlock();
      },
      { once: true, capture: true }
    );

    window.addEventListener(
      "touchstart",
      () => {
        this._audio.unlock();
      },
      { once: true }
    );

    window.addEventListener(
      "keydown",
      () => {
        this._audio.unlock();
      },
      { once: true }
    );
  }

  /** Async: preload GLB models, then wire them into factories. */
  private async _loadAssets(): Promise<void> {
    this._setLoadingVisible(true);
    this._setLoadingProgress(0, 1);
    try {
      console.log("[Game] Loading 3D models...");
      await this._assets.loadAll((loaded, total) => {
        this._setLoadingProgress(loaded, total);
      });
      this._vehicleFactory.setAssetLoader(this._assets);
      this._traffic.setAssetLoader(this._assets);
      this._effects.setAssetLoader(this._assets);
      this._rival.setAssetLoader(this._assets);
      console.log("[Game] 3D models loaded — GLB vehicles active");
    } catch (err) {
      console.warn("[Game] Asset loading failed, using procedural fallback:", err);
    }
    this._setLoadingVisible(false);
  }

  private _setLoadingVisible(visible: boolean): void {
    const screen = document.getElementById("loading-screen");
    if (!screen) return;
    if (visible) {
      screen.classList.remove("hidden");
    } else {
      screen.classList.add("hidden");
    }
  }

  private _setLoadingProgress(loaded: number, total: number): void {
    const label = document.getElementById("loading-status");
    const bar = document.getElementById("loading-bar-fill") as HTMLDivElement | null;
    const safeTotal = Math.max(1, total);
    const progress = Math.min(1, Math.max(0, loaded / safeTotal));
    if (label) label.textContent = `Loading assets ${loaded}/${safeTotal}`;
    if (bar) bar.style.width = `${Math.round(progress * 100)}%`;
  }

  // ──────────────── State Machine ────────────────

  private _changeState(newState: GameState): void {
    console.log("[Game] state:", newState);
    this._state = newState;
    this._ui.showState(newState);

    document.body.classList.toggle("in-game", newState === GameState.Playing);

    if (newState !== GameState.Playing) {
      this._audio.stopEngine();
    }

    switch (newState) {
      case GameState.Menu:
        this._mainMenuUI.setCoins(this._score.coins);
        break;
      case GameState.Multiplayer:
        this._setMultiplayerStatus("Idle");
        break;
      case GameState.MultiplayerLobby:
        this._syncLobbyUI();
        break;
      case GameState.MultiplayerCountdown:
        this._updateCountdownUI();
        break;
      case GameState.Garage:
        this._garageUI.refresh(this._score.coins);
        break;
      case GameState.Playing:
        this._audio.startEngine();
        break;
      case GameState.GameOver: {
        const stats = this._score.endRun();
        this._gameOverUI.show(stats, this._gameOverResultText);
        break;
      }
    }

    this._setGaragePreviewActive(newState === GameState.Garage);
  }

  // ──────────────── Per-Frame Update ────────────────

  private _update(dt: number): void {
    // Cap delta to prevent spiral on tab-out
    const clampedDt = Math.min(dt, 0.1);

    switch (this._state) {
      case GameState.Playing:
        this._updatePlaying(clampedDt);
        break;
      case GameState.MultiplayerCountdown:
        this._updateCountdown(clampedDt);
        break;
      case GameState.Paused:
        // Check for unpause
        if (this._input.isJustPressed("pause")) {
          this._changeState(GameState.Playing);
        }
        break;
    }

    this._input.endFrame();
  }

  private _updatePlaying(dt: number): void {
    this._gameTime += dt;
    if (this._collisionGraceTimer > 0) this._collisionGraceTimer = Math.max(0, this._collisionGraceTimer - dt);
    if (this._crashCooldownTimer > 0) this._crashCooldownTimer = Math.max(0, this._crashCooldownTimer - dt);

    // Check pause
    if (this._input.isJustPressed("pause")) {
      this._changeState(GameState.Paused);
      return;
    }

    // Check power-up activation
    if (this._input.isJustPressed("powerup")) {
      const activated = this._powerUps.activateHeld();
      if (activated) this._handlePowerUpActivation(activated);
    }

    if (this._input.isJustPressed("brake")) {
      this._audio.playScreech();
    }

    // Update core systems
    this._player.update(dt);
    this._road.update(dt, this._player.scrollSpeed);
    const roadOffset = this._road.roadOffsetX;
    this._player.setRoadOffset(roadOffset);
    this._traffic.setRoadOffset(roadOffset);
    this._rival.setRoadOffset(roadOffset);
    this._powerUps.setRoadOffset(roadOffset);
    this._traffic.update(
      dt,
      this._player.scrollSpeed,
      this._player.mesh.position.x,
      this._player.mesh.position.z,
      this._player.laneIndex
    );

    if (!this._isMultiplayer) {
      if (this._mode === GameMode.BossChase) {
        const nearestPuZ = this._powerUps.getNearestPowerUpZ(this._rival.relativeZ);
        this._rival.update(
          dt,
          this._player.scrollSpeed,
          this._player.laneIndex,
          this._player.mesh.position.z,
          nearestPuZ
        );
        this._rival.setDifficulty(Math.min(this._score.score / 50000, 1));
        this._powerUps.tryRivalSteal(this._rival.mesh.position.x, this._rival.mesh.position.z);
      }
    } else {
      this._player.updateRemote(dt);
    }

    // Power-ups
    this._powerUps.update(
      dt,
      this._player.mesh.position.x,
      this._player.mesh.position.z,
      this._player.scrollSpeed
    );

    // Score
    this._score.update(dt, this._player.scrollSpeed);

    // Collision checks
    this._checkCollisions();

    // Drafting checks
    this._checkDrafting();

    // Lighting
    this._lighting.update(this._player.mesh.position.x, this._player.mesh.position.z);

    // Performance
    this._perfMon.update(dt);

    // Mode logic
    this._updateMode(dt);

    // HUD
    this._updateHUD();

    // Engine audio
    this._audio.updateEngineSound(this._player.scrollSpeed, this._player.topSpeed);
    // Celebration after survival time
    this._celebrationTimer += dt;
    if (this._celebrationTimer >= 60) {
      this._audio.playCelebration();
    }

    // Check death
    if (this._player.isDead) {
      this._effects.stopNitroFlame();
      if (!this._isMultiplayer) {
        this._changeState(GameState.GameOver);
      }
    }
  }

  private _applyGraphicsPreset(preset: string, isInitial: boolean): void {
    const presets: Record<string, { scale: number; shadowMap: number; shadowBlur: number }> = {
      low: { scale: 2.0, shadowMap: 1024, shadowBlur: 16 },
      medium: { scale: 1.5, shadowMap: 1024, shadowBlur: 24 },
      high: { scale: 1.0, shadowMap: 2048, shadowBlur: 32 },
      ultra: { scale: 0.75, shadowMap: 4096, shadowBlur: 48 },
    };

    const config = presets[preset] ?? presets.high;
    this._engine.engine.setHardwareScalingLevel(config.scale);
    this._perfMon.setEnabled(false);
    this._perfMon.setFixedScale(config.scale);

    if (this._shadowGenerator) {
      this._shadowGenerator.mapSize = config.shadowMap;
      this._shadowGenerator.blurKernel = config.shadowBlur;
    }

    if (isInitial) {
      this._updateGraphicsDescription(preset);
    }
  }

  private _syncGraphicsUI(): void {
    const active = document.querySelector(`.quality-btn[data-quality="${this._graphicsPreset}"]`);
    document.querySelectorAll(".quality-btn").forEach((btn) => btn.classList.remove("active"));
    if (active) active.classList.add("active");
    this._updateGraphicsDescription(this._graphicsPreset);
  }

  private _updateGraphicsDescription(preset: string): void {
    const descriptions: Record<string, string> = {
      low: "Lowest load, reduced resolution and shadows.",
      medium: "Balanced visuals and performance.",
      high: "High detail with sharp shadows.",
      ultra: "Maximum clarity and shadows at higher cost.",
    };
    const el = document.getElementById("graphics-description");
    if (el) el.textContent = descriptions[preset] ?? descriptions.high;
  }

  private _loadGraphicsPreset(): string {
    const isAndroid = /Android/i.test(navigator.userAgent);
    const stored = window.localStorage.getItem(Game.GRAPHICS_STORAGE_KEY);
    if (stored) return stored;
    return isAndroid ? "high" : "medium";
  }

  private _saveGraphicsPreset(preset: string): void {
    window.localStorage.setItem(Game.GRAPHICS_STORAGE_KEY, preset);
  }

  // ──────────────── Collision Handling ────────────────

  private _checkCollisions(): void {
    if (this._collisionGraceTimer > 0) return;
    if (this._crashCooldownTimer > 0) return;
    const activeCars = this._traffic.activeCars;
    for (const car of activeCars) {
      const result = this._player.checkTrafficCar(
        car.mesh.position.x,
        car.mesh.position.z,
        car.halfW,
        car.halfL,
        car.id,
        this._gameTime
      );
      if (result === "collision") {
        if (this._isMultiplayer && this._mpMode === "crashLimit") {
          this._handleCrashLimitCollision(car.id, car.mesh.position.x, car.mesh.position.z);
        } else {
          const wasAlive = !this._player.isDead;
          this._player.handleCollision();
          this._score.onCollision();
          // Spawn debris at collision point
          this._effects.spawnCollisionDebris(car.mesh.position.x, car.mesh.position.z);
          if (wasAlive && this._player.isDead) {
            this._audio.playCrashLose();
          } else {
            this._audio.playNick();
          }
          if (this._isMultiplayer && this._player.isDead) {
            this._endMultiplayerMatch("loss", "You crashed");
            this._network.sendMatchEnd({ result: "loss", reason: "Crash" });
          }
        }
      } else if (result === "nearMiss") {
        this._score.registerNearMiss();
        this._audio.playNick();
      }
    }
  }

  private _checkDrafting(): void {
    this._player.resetDraftCheck();
    const activeCars = this._traffic.activeCars;
    for (const car of activeCars) {
      this._player.checkDrafting(car.mesh.position.x, car.mesh.position.z, 0);
    }
    if (this._player.isDrafting) {
      this._score.registerDrafting(this._engine.deltaTime);
    }
  }

  // ──────────────── Power-Up Effects ────────────────

  private _handlePowerUpActivation(type: PowerUpType): void {
    switch (type) {
      case PowerUpType.Ghost:
        this._player.activateGhost();
        this._audio.playGhost();
        break;
      case PowerUpType.EMP:
        this._effects.triggerEMPFlash();
        // Scatter traffic within range
        for (const car of this._traffic.activeCars) {
          const dz = Math.abs(car.mesh.position.z - this._player.mesh.position.z);
          if (dz < EMP_RANGE) {
            // Push them sideways
            car.mesh.position.x += (Math.random() - 0.5) * 8;
          }
        }
        break;
      case PowerUpType.Nitro:
        this._player.activateNitro();
        this._effects.startNitroFlame(this._player.mesh);
        this._audio.playNitro();
        break;
      case PowerUpType.CoinMagnet:
        // Effect handled in PowerUpManager tick
        break;
      case PowerUpType.FrontalBlast: {
        // Find nearest traffic car in the player's lane, ahead within range
        const playerX = this._player.mesh.position.x;
        const playerZ = this._player.mesh.position.z;
        let bestCar: { id: number; dist: number } | null = null;
        for (const car of this._traffic.activeCars) {
          const dz = car.mesh.position.z - playerZ;
          if (dz <= 0 || dz > FRONTAL_BLAST_RANGE) continue;
          const dx = Math.abs(car.mesh.position.x - playerX);
          if (dx > LANE_WIDTH) continue;
          if (!bestCar || dz < bestCar.dist) {
            bestCar = { id: car.id, dist: dz };
          }
        }
        if (bestCar) {
          const pos = this._traffic.destroyCar(bestCar.id);
          if (pos) {
            this._effects.triggerBlastExplosion(pos.x, pos.z);
          }
          this._score.addBonus(FRONTAL_BLAST_SCORE_BONUS);
        }
        break;
      }
    }
  }

  // ──────────────── HUD ────────────────

  private _updateHUD(): void {
    // Speed in KM/H (units/sec × 3.6 simulated factor)
    this._hud.updateSpeed(this._player.scrollSpeed * 3.6);
    this._hud.updateScore(this._score.score);
    this._hud.updateMultiplier(this._score.multiplier);
    this._hud.updateCoins(this._score.coins + this._score.runCoins);

    // Nitro
    const nitroFrac = this._player.nitroRemaining / (this._player["_stats"] as VehicleStats).nitroCapacity;
    this._hud.updateNitro(nitroFrac);

    // Power-up
    const held = this._powerUps.getHeldPowerUps();
    const active = this._powerUps.activeEffect;
    this._hud.updatePowerUps(held, active, this._powerUps.effectTimer);

    // Rival indicator removed for all modes
    this._hud.setRivalVisible(false);

    // Health (for truck category)
    this._hud.updateHealth(this._player.health, (this._player["_stats"] as VehicleStats).health);

    // Mode status
    this._hud.updateMode(this._modeLabel, this._modeStatus);
  }

  private _updateMode(dt: number): void {
    if (this._isMultiplayer) {
      switch (this._mpMode) {
        case "classicRace":
          this._modeTimer -= dt;
          this._modeStatus = `Time: ${Math.max(0, this._modeTimer).toFixed(1)}s`;
          if (this._modeTimer <= 0) this._changeState(GameState.GameOver);
          return;
        case "duel":
          this._modeStatus = `Near Misses: ${this._score.nearMissCount}/${this._modeTarget}`;
          if (this._score.nearMissCount >= this._modeTarget) this._changeState(GameState.GameOver);
          return;
        case "powerUpDuel":
          this._modeTimer -= dt;
          this._modeStatus = `Near Misses: ${this._score.nearMissCount}/${this._modeTarget} | ${Math.max(0, this._modeTimer).toFixed(1)}s`;
          if (this._score.nearMissCount >= this._modeTarget || this._modeTimer <= 0) {
            this._changeState(GameState.GameOver);
          }
          return;
        case "crashLimit":
          this._modeStatus = `Crashes: ${this._mpLocalCrashes}/${this._mpCrashLimit} | Opponent: ${this._mpRemoteCrashes}/${this._mpCrashLimit}`;
          return;
      }
    }

    switch (this._mode) {
      case GameMode.FreeRoam:
        this._modeStatus = "Relaxed traffic";
        break;
      case GameMode.TimeTrial: {
        this._modeTimer -= dt;
        this._modeStatus = `Time: ${Math.max(0, this._modeTimer).toFixed(1)}s`;
        if (this._modeTimer <= 0) {
          this._changeState(GameState.GameOver);
        }
        break;
      }
      case GameMode.TrafficMayhem:
        this._modeStatus = `Near Misses: ${this._score.nearMissCount}`;
        break;
      case GameMode.DeliveryRush: {
        this._modeTimer -= dt;
        const distance = this._road.totalScrolled;
        if (distance >= this._modeCheckpointZ) {
          this._modeCheckpointZ += 260;
          this._modeTimer += 12;
          this._score.addBonus(500);
        }
        this._modeStatus = `Next Drop: ${Math.max(0, this._modeCheckpointZ - distance).toFixed(0)}m | ${Math.max(0, this._modeTimer).toFixed(1)}s`;
        if (this._modeTimer <= 0) {
          this._changeState(GameState.GameOver);
        }
        break;
      }
      case GameMode.BossChase: {
        if (this._rival.relativeZ < 15) this._rival.relativeZ = 15;
        const dz = this._rival.relativeZ;
        this._modeStatus = `Gap: ${dz.toFixed(0)}m`;
        if (this._gameTime < 1.5) break;
        if (dz <= this._modeTarget) {
          this._score.addBonus(2000);
          this._changeState(GameState.GameOver);
        } else if (dz > 120) {
          this._changeState(GameState.GameOver);
        }
        break;
      }
      case GameMode.ConeSmash: {
        this._modeTimer -= dt;
        this._modeStatus = `Time: ${Math.max(0, this._modeTimer).toFixed(1)}s`;
        if (this._modeTimer <= 0) {
          this._changeState(GameState.GameOver);
        }
        break;
      }
    }
  }

  // ──────────────── Start / Restart Run ────────────────

  private _startRun(): void {
    console.log("[Game] _startRun called, biome:", this._selectedBiome);
    // Get the selected vehicle and apply upgrades
    const def = getVehicleById(this._selectedVehicleId) ?? VEHICLE_ROSTER[0];
    const upgrades = loadUpgrades(def.id);
    const stats = applyUpgrades(def.baseStats, upgrades);
    const visuals = loadVisuals(def.id);

    // Reset all systems
    this._player.reset(stats);
    this._road.reset();
    this._traffic.reset();
    this._rival.reset();
    this._powerUps.reset();
    this._score.reset();
    this._gameTime = 0;
    this._celebrationTimer = 0;
    this._audio.setCelebrationPlayed(false);
    this._gameOverResultText = "";
    this._collisionGraceTimer = 1.5;
    this._crashCooldownTimer = 0;

    // Apply difficulty + mode modifiers
    const preset = DIFFICULTY_PRESETS[this._difficulty] ?? DIFFICULTY_PRESETS.normal;
    const modePreset = this._applyModeSettings(preset);
    this._traffic.setDifficulty(modePreset.preset);
    this._powerUps.setSpawnMultiplier(modePreset.powerUpMultiplier);
    this._powerUps.setConeMode(modePreset.coneMode);

    // Setup biome
    this._shadowGenerator = SceneFactory.setupBiome(this._engine.scene, this._selectedBiome);
    this._applyGraphicsPreset(this._graphicsPreset, false);
    this._lighting.currentBiome = this._selectedBiome;
    this._road.setBiome(this._selectedBiome);

    // Build proper vehicle mesh via VehicleFactory and assign to player
    const newMesh = this._vehicleFactory.createPlayerVehicle(def, visuals, this._shadowGenerator);
    this._player.rebuildMesh(newMesh);
    this._audio.setEngineType(this._getEngineTypeForVehicle(def));

    // Rival is disabled visually across all modes
    this._rival.mesh.isVisible = false;

    // Re-target camera to new mesh
    if (this._followCamera) this._followCamera.lockedTarget = this._player.mesh;

    // Shadow caster for player
    if (this._shadowGenerator) {
      this._shadowGenerator.addShadowCaster(this._player.mesh);
    }

    if (this._mode === GameMode.BossChase) {
      this._rival.relativeZ = 45;
      this._rival.mesh.position.z = this._player.mesh.position.z + this._rival.relativeZ;
    }

    this._changeState(GameState.Playing);
  }

  private _applyModeSettings(preset: DifficultyPreset): {
    preset: DifficultyPreset;
    powerUpMultiplier: number;
    coneMode: boolean;
  } {
    let powerUpMultiplier = 1;
    let coneMode = false;
    const tuned: DifficultyPreset = { ...preset };

    this._modeTimer = 0;
    this._modeTarget = 0;
    this._modeCheckpointZ = 0;

    switch (this._mode) {
      case GameMode.FreeRoam:
        this._modeLabel = "Free Roam";
        tuned.trafficBaseDensity *= 0.6;
        tuned.trafficMaxDensity *= 0.7;
        tuned.trafficFormationChance *= 0.7;
        tuned.trafficLaneChangeChance *= 0.6;
        break;
      case GameMode.TimeTrial:
        this._modeLabel = "Time Trial";
        this._modeTimer = 90;
        break;
      case GameMode.TrafficMayhem:
        this._modeLabel = "Traffic Mayhem";
        tuned.trafficBaseDensity *= 1.5;
        tuned.trafficMaxDensity *= 1.7;
        tuned.trafficFormationChance *= 1.4;
        tuned.trafficLaneChangeChance *= 1.2;
        tuned.trafficMinOpenLanes = Math.max(1, tuned.trafficMinOpenLanes - 1);
        break;
      case GameMode.DeliveryRush:
        this._modeLabel = "Delivery Rush";
        this._modeTimer = 25;
        this._modeCheckpointZ = 260;
        break;
      case GameMode.BossChase:
        this._modeLabel = "Boss Chase";
        this._modeTarget = 10; // catch distance
        break;
      case GameMode.ConeSmash:
        this._modeLabel = "Cone Smash";
        coneMode = true;
        this._modeTimer = 75;
        break;
    }

    return { preset: tuned, powerUpMultiplier, coneMode };
  }

  private _startMultiplayerRun(): void {
    this._startRun();
    this._rival.mesh.isVisible = false;
    this._mpMatchEnded = false;
    this._mpLocalCrashes = 0;
    this._mpRemoteCrashes = 0;
    this._mpLobbyReadyLocal = false;
    this._mpLobbyReadyRemote = false;
    this._applyMultiplayerModeSettings();
    this._assignMultiplayerLanes();
  }

  private _applyMultiplayerModeSettings(): void {
    this._powerUps.setSpawnMultiplier(1);
    switch (this._mpMode) {
      case "classicRace":
        this._modeLabel = "MP: Classic Race";
        this._modeTimer = 90;
        break;
      case "duel":
        this._modeLabel = "MP: Duel";
        this._modeTarget = 8; // near-miss target
        break;
      case "powerUpDuel":
        this._modeLabel = "MP: Power-Up Duel";
        this._modeTarget = 6;
        this._modeTimer = 90;
        this._powerUps.setSpawnMultiplier(1.6);
        break;
      case "crashLimit":
        this._modeLabel = "MP: Crash Limit";
        break;
      default:
        this._modeLabel = "MP: Classic Race";
        this._modeTimer = 90;
        break;
    }
  }

  // ──────────────── UI Wiring ────────────────

  private _wireUI(): void {
    // Main menu
    this._ui.onPlay = () => {
      this._ensureAudioUnlocked();
      if (this._network.isConnected) {
        this._changeState(GameState.MultiplayerLobby);
      } else {
        this._changeState(GameState.ModeSelect);
      }
    };
    this._ui.onMultiplayer = () => {
      this._ensureAudioUnlocked();
      if (this._network.isConnected) {
        this._changeState(GameState.MultiplayerLobby);
      } else {
        this._changeState(GameState.Multiplayer);
      }
    };
    this._ui.onGarage = () => {
      this._ensureAudioUnlocked();
      this._changeState(GameState.Garage);
    };

    this._ui.onSettings = () => {
      this._ensureAudioUnlocked();
      this._syncDifficultyUI();
      this._syncGraphicsUI();
      const volumes = this._audio.volumes;
      const master = document.getElementById("volume-master") as HTMLInputElement | null;
      const music = document.getElementById("volume-music") as HTMLInputElement | null;
      const sfx = document.getElementById("volume-sfx") as HTMLInputElement | null;
      const engine = document.getElementById("volume-engine") as HTMLInputElement | null;
      if (master) master.value = `${volumes.master}`;
      if (music) music.value = `${volumes.music}`;
      if (sfx) sfx.value = `${volumes.sfx}`;
      if (engine) engine.value = `${volumes.engine}`;
      this._changeState(GameState.Settings);
    };

    // Settings
    this._ui.onSettingsBack = () => this._changeState(GameState.Menu);
    this._ui.onDifficultyChange = (diff: string) => {
      this._difficulty = diff;
      this._saveDifficulty(diff);
      this._updateDifficultyDescription(diff);
    };

    this._ui.onGraphicsQualityChange = (quality: string) => {
      this._graphicsPreset = quality;
      this._saveGraphicsPreset(quality);
      this._applyGraphicsPreset(quality, false);
      this._updateGraphicsDescription(quality);
    };

    this._ui.onMasterVolumeChange = (value) => this._audio.setVolumes({ master: value });
    this._ui.onMusicVolumeChange = (value) => this._audio.setVolumes({ music: value });
    this._ui.onSfxVolumeChange = (value) => this._audio.setVolumes({ sfx: value });
    this._ui.onEngineVolumeChange = (value) => this._audio.setVolumes({ engine: value });

    // Biome select
    this._ui.onBiomeSelect = (biome: string) => {
      this._ensureAudioUnlocked();
      this._selectedBiome = biome as BiomeType;
      this._startRun();
    };
    this._ui.onBiomeBack = () => this._changeState(GameState.Menu);

    // Mode select
    this._ui.onModeBack = () => this._changeState(GameState.Menu);
    this._ui.onModeSelect = (mode: string) => {
      this._ensureAudioUnlocked();
      this._mode = mode as GameMode;
      this._changeState(GameState.BiomeSelect);
    };

    // Multiplayer
    this._ui.onMultiplayerBack = () => {
      this._changeState(GameState.Menu);
    };
    this._ui.onHostGame = () => this._hostMultiplayer();
    this._ui.onJoinGame = () => {
      void this._joinMultiplayer();
    };
    this._ui.onQuickMatch = () => {
      void this._quickMatchMultiplayer();
    };
    this._ui.onLobbyBack = () => this._changeState(GameState.Menu);
    this._ui.onLobbyReady = () => {
      this._ensureAudioUnlocked();
      this._toggleLobbyReady();
    };
    this._ui.onLobbyDisconnect = () => {
      this._stopMultiplayer();
      this._changeState(GameState.Menu);
    };
    this._ui.onLobbyModeChange = (mode) => this._setLobbyMode(mode);
    this._ui.onLobbyCrashLimitChange = (limit) => this._setLobbyCrashLimit(limit);

    // Garage
    this._ui.onGarageBack = () => this._changeState(GameState.Menu);
    this._ui.onSelectVehicle = () => {
      this._ensureAudioUnlocked();
      this._selectedVehicleId = this._garageUI.selectedVehicle.id;
      this._saveSelectedVehicleId(this._selectedVehicleId);
      if (this._network.isConnected) {
        this._network.sendPlayerInfo(this._buildLocalPlayerInfo());
        this._syncLobbyUI();
      }
      this._changeState(GameState.Menu);
    };
    this._garageUI.onVehicleChange = (def) => {
      if (this._state === GameState.Garage) {
        this._updateGaragePreview(def, this._garageUI.currentVisuals);
      }
    };
    this._garageUI.onVisualsChange = (visuals) => {
      if (this._state === GameState.Garage) {
        this._updateGaragePreview(this._garageUI.selectedVehicle, visuals);
      }
    };

    // Pause
    this._ui.onResume = () => this._changeState(GameState.Playing);
    this._ui.onRestart = () => this._startRun();
    this._ui.onQuit = () => {
      this._effects.stopNitroFlame();
      this._changeState(GameState.Menu);
    };

    // Game over
    this._ui.onRetry = () => {
      this._ensureAudioUnlocked();
      if (this._isMultiplayer && this._network.isConnected) {
        this._resetLobbyReadiness();
        this._changeState(GameState.MultiplayerLobby);
      } else {
        this._startRun();
      }
    };
    this._ui.onToMenu = () => {
      this._changeState(GameState.Menu);
    };
  }

  private _wireGameplayEvents(): void {
    // Player near-miss event
    this._player.onNearMiss = () => {
      this._score.registerNearMiss();
      this._audio.playNick();
    };

    // Player collision event (death)
    this._player.onCollision = () => {
      // Already handled in handleCollision → isDead → GameOver
    };

    // Player drafting event
    this._player.onDraftTick = (dt: number) => {
      this._score.registerDrafting(dt);
    };

    // Power-up events
    this._powerUps.onCollect = (type) => {
      // Visual/audio feedback could go here
    };

    this._powerUps.onCoinCollect = () => {
      this._score.collectCoin();
    };

    this._powerUps.onConeHit = () => {
      this._score.addBonus(150);
    };

    this._powerUps.onExpire = (type) => {
      if (type === PowerUpType.Ghost) {
        this._player.deactivateGhost();
      }
      if (type === PowerUpType.Nitro) {
        this._effects.stopNitroFlame();
      }
    };
  }

  // ──────────────── Garage Preview ────────────────

  private _setGaragePreviewActive(active: boolean): void {
    if (active) {
      this._applyGarageLighting();
      this._ensureGarageCamera();
      this._ensureGarageStage();
      this._engine.scene.activeCamera = this._garageCamera;
      this._updateGaragePreview(this._garageUI.selectedVehicle, this._garageUI.currentVisuals);
      this._road.setVisible(false);
    } else {
      if (this._garageCamera) this._garageCamera.detachControl();
      this._engine.scene.activeCamera = this._followCamera;
      this._garagePreviewMesh?.setEnabled(false);
      this._garageStage?.setEnabled(false);
      this._garageBackdrop?.setEnabled(false);
      if (this._garageLight) this._garageLight.setEnabled(false);
      if (this._garageFillLight) this._garageFillLight.setEnabled(false);
      this._restoreGarageLighting();
      this._road.setVisible(true);
      this._player.mesh.setEnabled(true);
      this._rival.mesh.setEnabled(true);
    }
  }

  private _applyGarageLighting(): void {
    const scene = this._engine.scene;
    if (this._garagePrevFogMode === null) {
      this._garagePrevFogMode = scene.fogMode;
      this._garagePrevFogDensity = scene.fogDensity;
      this._garagePrevClearColor = {
        r: scene.clearColor.r,
        g: scene.clearColor.g,
        b: scene.clearColor.b,
        a: scene.clearColor.a,
      };
    }
    scene.fogMode = 0;
    scene.fogDensity = 0;
    scene.clearColor.set(0.98, 0.99, 1.0, 1.0);
    scene.ambientColor.set(1, 1, 1);
  }

  private _restoreGarageLighting(): void {
    const scene = this._engine.scene;
    if (this._garagePrevFogMode !== null) {
      scene.fogMode = this._garagePrevFogMode;
      scene.fogDensity = this._garagePrevFogDensity;
      if (this._garagePrevClearColor) {
        scene.clearColor.set(
          this._garagePrevClearColor.r,
          this._garagePrevClearColor.g,
          this._garagePrevClearColor.b,
          this._garagePrevClearColor.a
        );
      }
      this._garagePrevFogMode = null;
    }
  }

  private _ensureGarageCamera(): void {
    if (this._garageCamera) return;
    this._garageCamera = new ArcRotateCamera(
      "garageCamera",
      -Math.PI / 2,
      Math.PI / 2.1,
      8,
      new Vector3(this._garagePreviewOffsetX, 1.2, 0),
      this._engine.scene
    );
    this._garageCamera.minZ = 0.1;
    this._garageCamera.lowerRadiusLimit = 6;
    this._garageCamera.upperRadiusLimit = 12;
    this._garageCamera.wheelPrecision = 80;
    this._garageCamera.panningSensibility = 0;
    this._garageCamera.viewport = new Viewport(0.52, 0, 0.48, 1);
  }

  private _ensureGarageStage(): void {
    if (!this._garageStage) {
      this._garageStage = MeshBuilder.CreateCylinder(
        "garageStage",
        { diameter: 8, height: 0.2, tessellation: 48 },
        this._engine.scene
      );
      this._garageStage.position.set(this._garagePreviewOffsetX, 0.1, 0);
      const mat = new StandardMaterial("garageStageMat", this._engine.scene);
      mat.diffuseColor = new Color3(0.98, 0.98, 0.99);
      mat.emissiveColor = new Color3(0.08, 0.08, 0.1);
      mat.specularColor = new Color3(0.25, 0.25, 0.3);
      this._garageStage.material = mat;
    }

    if (!this._garageBackdrop) {
      this._garageBackdrop = MeshBuilder.CreatePlane(
        "garageBackdrop",
        { width: 20, height: 10 },
        this._engine.scene
      );
      this._garageBackdrop.position.set(this._garagePreviewOffsetX, 5, 6);
      const backMat = new StandardMaterial("garageBackdropMat", this._engine.scene);
      backMat.diffuseColor = new Color3(1, 1, 1);
      backMat.emissiveColor = new Color3(0.9, 0.92, 0.98);
      backMat.specularColor = new Color3(0, 0, 0);
      this._garageBackdrop.material = backMat;
    }

    if (!this._garageFillLight) {
      this._garageFillLight = new HemisphericLight(
        "garageFill",
        new Vector3(0, 1, 0),
        this._engine.scene
      );
      this._garageFillLight.diffuse = new Color3(1, 1, 1);
      this._garageFillLight.groundColor = new Color3(0.75, 0.78, 0.82);
      this._garageFillLight.intensity = 2.0;
    }

    if (!this._garageLight) {
      this._garageLight = new PointLight(
        "garageLight",
        new Vector3(this._garagePreviewOffsetX + 2, 5, -2),
        this._engine.scene
      );
      this._garageLight.diffuse = new Color3(1, 1, 0.98);
      this._garageLight.intensity = 2.2;
      this._garageLight.range = 25;
    }

    this._garageStage.setEnabled(true);
    this._garageBackdrop.setEnabled(true);
    this._garageLight.setEnabled(true);
    this._garageFillLight.setEnabled(true);
  }

  private _updateGaragePreview(def: VehicleDefinition, visuals: VisualCustomization): void {
    if (!this._garageCamera) return;
    this._garageStage?.setEnabled(true);
    this._garageLight?.setEnabled(true);

    if (this._garagePreviewMesh) {
      this._garagePreviewMesh.getChildMeshes().forEach((c) => c.dispose());
      this._garagePreviewMesh.dispose();
      this._garagePreviewMesh = null;
    }

    if (this._garageStage) {
      this._garageStage.position.set(this._garagePreviewOffsetX, 0.1, 0);
    }
    if (this._garageLight) {
      this._garageLight.position.set(this._garagePreviewOffsetX + 2, 5, -2);
    }

    const mesh = this._vehicleFactory.createPlayerVehicle(def, visuals, null);
    mesh.position.set(this._garagePreviewOffsetX, 0.8, 0);
    this._garagePreviewMesh = mesh;

    this._garageCamera.setTarget(new Vector3(this._garagePreviewOffsetX, 1.0, 0));
    this._player.mesh.setEnabled(false);
    this._rival.mesh.setEnabled(false);
  }

  // ──────────────── Multiplayer Networking ────────────────

  private _wireNetwork(): void {
    this._network.onHostId = (id) => {
      void this._createRoomForHost(id);
    };
    this._network.onStatus = (text) => this._setMultiplayerStatus(text);
    this._network.onError = (text) => this._setMultiplayerStatus(`Error: ${text}`);

    this._network.onConnected = (role) => {
      this._isMultiplayer = true;
      this._isHost = role === "host";
      this._configureMultiplayerTraffic();
      this._network.setLocalStateProvider(() => {
        if (this._state !== GameState.Playing) return null;
        return this._buildLocalState();
      });
      this._network.sendPlayerInfo(this._buildLocalPlayerInfo());

      this._mpMatchEnded = false;
      this._mpLobbyReadyLocal = false;
      this._mpLobbyReadyRemote = false;
      this._mpLocalCrashes = 0;
      this._mpRemoteCrashes = 0;
      this._mpMode = this._getLobbyMode();
      this._mpCrashLimit = this._getLobbyCrashLimit();
      this._syncLobbyUI();

      if (this._isHost) {
        this._network.sendLobbyUpdate({ mode: this._mpMode, crashLimit: this._mpCrashLimit });
      }

      this._changeState(GameState.MultiplayerLobby);
    };

    this._network.onStart = (payload: StartPayload) => {
      if (this._isHost) return;
      this._selectedBiome = payload.biome;
      this._mpMode = payload.mode;
      this._startMultiplayerRun();
    };

    this._network.onRemoteInfo = (info) => {
      this._remoteInfo = info;
      this._spawnRemoteOpponent(info);
      this._syncLobbyUI();
    };

    this._network.onRemoteState = (state) => {
      if (this._state !== GameState.Playing) return;
      this._player.setRemoteState(state.position, state.rotation, state.speed);
      this._applyRemotePowerUpVisuals(state.powerUp.active);
    };

    this._network.onTrafficSpawn = (payload: TrafficSpawnPayload) => {
      if (this._isHost) return;
      this._traffic.spawnFromNetwork(payload, this._player.mesh.position.z);
    };

    this._network.onLobbyUpdate = (payload) => {
      this._mpMode = payload.mode;
      this._mpCrashLimit = payload.crashLimit;
      this._syncLobbyUI();
    };

    this._network.onReadyUpdate = (payload) => {
      this._mpLobbyReadyRemote = payload.ready;
      this._syncLobbyUI();
      if (this._isHost) this._tryStartCountdown();
    };

    this._network.onCountdown = (payload) => {
      this._beginCountdown(payload.seconds);
    };

    this._network.onCrash = (payload) => {
      this._mpRemoteCrashes = payload.crashes;
      this._syncLobbyUI();
      if (this._mpMode === "crashLimit" && this._mpRemoteCrashes >= this._mpCrashLimit) {
        this._endMultiplayerMatch("win", "Opponent crashed out");
      }
    };

    this._network.onMatchEnd = (payload) => {
      if (this._mpMatchEnded) return;
      const result = payload.result === "loss" ? "win" : payload.result === "win" ? "loss" : "draw";
      const reason = payload.reason || "Match ended";
      this._endMultiplayerMatch(result, reason);
    };

    this._network.onDisconnected = () => {
      if (!this._isMultiplayer) return;
      this._setMultiplayerStatus("Disconnected");
      this._stopMultiplayer(true);
      this._changeState(GameState.Menu);
    };
  }

  private _hostMultiplayer(): void {
    this._setMultiplayerStatus("Creating lobby...");
    this._setMultiplayerHostId("—");
    this._pendingRoomCreation = true;
    this._network.host();
  }

  private async _createRoomForHost(peerId: string): Promise<void> {
    if (!this._pendingRoomCreation) {
      this._setMultiplayerHostId(peerId);
      return;
    }

    this._pendingRoomCreation = false;

    try {
      const roomCode = await this._matchmaking.createRoom(peerId);
      this._mpRoomCode = roomCode;
      this._setMultiplayerHostId(roomCode);
      this._setMultiplayerStatus(`Room code ${roomCode} ready`);
    } catch (err) {
      console.warn("[Matchmaking] Room creation failed:", err);
      this._setMultiplayerHostId(peerId);
      this._setMultiplayerStatus("Room ready. Share host ID");
    }
  }

  private async _joinMultiplayer(): Promise<void> {
    const id = this._getJoinId();
    if (!id) {
      this._setMultiplayerStatus("Enter a host ID first");
      return;
    }
    this._setMultiplayerStatus("Looking up room...");

    try {
      const hostId = await this._matchmaking.joinRoom(id);
      if (hostId) {
        this._setMultiplayerStatus(`Joining ${id}...`);
        this._mpRoomCode = id;
        this._network.join(hostId);
        return;
      }
    } catch (err) {
      console.warn("[Matchmaking] Room lookup failed:", err);
    }

    this._setMultiplayerStatus(`Joining ${id} (direct ID)...`);
    this._network.join(id);
  }

  private async _quickMatchMultiplayer(): Promise<void> {
    this._setMultiplayerStatus("Finding a match...");

    try {
      const match = await this._matchmaking.quickMatch();
      if (match) {
        this._setMultiplayerStatus(`Joining ${match.code}...`);
        this._mpRoomCode = match.code;
        this._network.join(match.hostPeerId);
        return;
      }
    } catch (err) {
      console.warn("[Matchmaking] Quick match failed:", err);
    }

    this._setMultiplayerStatus("No rooms found. Creating lobby...");
    this._hostMultiplayer();
  }

  private _stopMultiplayer(skipNetworkDisconnect = false): void {
    if (this._isHost && this._mpRoomCode) {
      void this._matchmaking.closeRoom(this._mpRoomCode);
    }
    this._mpRoomCode = null;
    this._pendingRoomCreation = false;
    this._isMultiplayer = false;
    this._isHost = false;
    this._remoteInfo = null;
    this._mpLobbyReadyLocal = false;
    this._mpLobbyReadyRemote = false;
    this._mpMatchEnded = false;
    this._mpLocalCrashes = 0;
    this._mpRemoteCrashes = 0;
    this._player.detachRemoteMesh();
    this._traffic.setSpawnEnabled(true);
    this._traffic.onSpawn = undefined;
    if (!skipNetworkDisconnect) this._network.disconnect();
    this._setMultiplayerStatus("Idle");
    this._setMultiplayerHostId("—");
  }

  private _configureMultiplayerTraffic(): void {
    if (this._isHost) {
      this._traffic.setSpawnEnabled(true);
      this._traffic.onSpawn = (payload) => {
        if (this._network.isConnected) this._network.sendTrafficSpawn(payload);
      };
    } else {
      this._traffic.setSpawnEnabled(false);
      this._traffic.onSpawn = undefined;
    }
  }

  private _buildLocalState() {
    const pos = this._player.mesh.position;
    const rotQ = this._player.mesh.rotationQuaternion;
    const rotation = rotQ
      ? { x: rotQ.x, y: rotQ.y, z: rotQ.z, w: rotQ.w }
      : {
        x: this._player.mesh.rotation.x,
        y: this._player.mesh.rotation.y,
        z: this._player.mesh.rotation.z,
      };

    return {
      position: { x: pos.x, y: pos.y, z: pos.z },
      rotation,
      speed: this._player.scrollSpeed,
      powerUp: { active: this._powerUps.activeEffect ?? null },
    };
  }

  private _buildLocalPlayerInfo(): RemotePlayerInfo {
    const def = getVehicleById(this._selectedVehicleId) ?? VEHICLE_ROSTER[0];
    const visuals = loadVisuals(def.id);
    return {
      vehicleId: def.id,
      visuals,
    };
  }

  private _spawnRemoteOpponent(info: RemotePlayerInfo): void {
    const def = getVehicleById(info.vehicleId) ?? VEHICLE_ROSTER[0];
    const mesh = this._vehicleFactory.createPlayerVehicle(def, info.visuals, null);
    this._player.attachRemoteMesh(mesh);
  }

  private _applyRemotePowerUpVisuals(active: PowerUpType | null): void {
    const mesh = this._player.remoteMesh;
    if (!mesh) return;
    mesh.visibility = active === PowerUpType.Ghost ? 0.4 : 1.0;
  }

  private _ensureAudioUnlocked(): void {
    if (!this._audio.unlocked) this._audio.unlock();
  }

  private _getEngineTypeForVehicle(def: VehicleDefinition): EngineType {
    switch (def.category) {
      case VehicleCategory.RaceCar:
      case VehicleCategory.JDMLegend:
        return "aggressive";
      case VehicleCategory.DailyTuner:
      case VehicleCategory.HeavyTruck:
      default:
        return "standard";
    }
  }

  private _setMultiplayerStatus(text: string): void {
    const el = document.getElementById("mp-status");
    if (el) el.textContent = text;
  }

  private _setMultiplayerHostId(id: string): void {
    const el = document.getElementById("mp-host-id");
    if (el) el.textContent = id;
  }

  private _getJoinId(): string {
    const input = document.getElementById("mp-join-id") as HTMLInputElement | null;
    return input?.value.trim() ?? "";
  }

  private _getLobbyMode(): string {
    const select = document.getElementById("mp-lobby-mode") as HTMLSelectElement | null;
    return select?.value ?? "classicRace";
  }

  private _getLobbyCrashLimit(): number {
    const input = document.getElementById("mp-crash-limit") as HTMLInputElement | null;
    const value = parseInt(input?.value ?? "10", 10);
    if (Number.isNaN(value)) return 10;
    return Math.max(3, Math.min(50, value));
  }

  private _setLobbyMode(mode: string): void {
    if (this._mpMode === mode) return;
    this._mpMode = mode;
    this._resetLobbyReadiness();
    this._syncLobbyUI();
    if (this._network.isConnected) this._network.sendLobbyUpdate({ mode: this._mpMode, crashLimit: this._mpCrashLimit });
  }

  private _setLobbyCrashLimit(limit: number): void {
    if (!this._isHost) return;
    const clamped = Math.max(3, Math.min(50, Math.floor(limit)));
    if (this._mpCrashLimit === clamped) return;
    this._mpCrashLimit = clamped;
    this._resetLobbyReadiness();
    this._syncLobbyUI();
    if (this._network.isConnected) this._network.sendLobbyUpdate({ mode: this._mpMode, crashLimit: this._mpCrashLimit });
  }

  private _toggleLobbyReady(): void {
    this._mpLobbyReadyLocal = !this._mpLobbyReadyLocal;
    this._syncLobbyUI();
    if (this._network.isConnected) this._network.sendReady({ ready: this._mpLobbyReadyLocal });
    if (this._isHost) this._tryStartCountdown();
  }

  private _resetLobbyReadiness(): void {
    this._mpLobbyReadyLocal = false;
    this._mpLobbyReadyRemote = false;
    if (this._network.isConnected) this._network.sendReady({ ready: false });
  }

  private _syncLobbyUI(): void {
    const statusEl = document.getElementById("mp-lobby-status");
    if (statusEl) {
      const role = this._isHost ? "Host" : "Guest";
      statusEl.textContent = this._network.isConnected ? `${role} connected` : "Waiting for player...";
    }

    const localName = document.getElementById("mp-local-car-name");
    const localMeta = document.getElementById("mp-local-car-meta");
    const localColor = document.getElementById("mp-local-car-color");
    const localDef = getVehicleById(this._selectedVehicleId) ?? VEHICLE_ROSTER[0];
    const localVisuals = loadVisuals(localDef.id);
    if (localName) localName.textContent = localDef.name;
    if (localMeta) localMeta.textContent = localDef.category.toString();
    if (localColor) localColor.setAttribute("style", `background:${localVisuals.paintColor}`);

    const remoteName = document.getElementById("mp-remote-car-name");
    const remoteMeta = document.getElementById("mp-remote-car-meta");
    const remoteColor = document.getElementById("mp-remote-car-color");
    if (this._remoteInfo) {
      const def = getVehicleById(this._remoteInfo.vehicleId) ?? VEHICLE_ROSTER[0];
      if (remoteName) remoteName.textContent = def.name;
      if (remoteMeta) remoteMeta.textContent = def.category.toString();
      if (remoteColor) remoteColor.setAttribute("style", `background:${this._remoteInfo.visuals.paintColor}`);
    } else {
      if (remoteName) remoteName.textContent = "Waiting...";
      if (remoteMeta) remoteMeta.textContent = "";
      if (remoteColor) remoteColor.setAttribute("style", "background:#ddd");
    }

    const lobbyMode = document.getElementById("mp-lobby-mode") as HTMLSelectElement | null;
    if (lobbyMode && lobbyMode.value !== this._mpMode) lobbyMode.value = this._mpMode;

    const crashLimit = document.getElementById("mp-crash-limit") as HTMLInputElement | null;
    if (crashLimit) {
      crashLimit.value = `${this._mpCrashLimit}`;
      crashLimit.disabled = !this._isHost;
    }

    const crashLimitWrap = document.getElementById("mp-crash-limit-wrap");
    if (crashLimitWrap) {
      crashLimitWrap.classList.toggle("hidden", this._mpMode !== "crashLimit");
    }

    const localReadyEl = document.getElementById("mp-local-ready");
    if (localReadyEl) {
      localReadyEl.textContent = this._mpLobbyReadyLocal ? "Ready" : "Not Ready";
      localReadyEl.classList.toggle("active", this._mpLobbyReadyLocal);
    }

    const remoteReadyEl = document.getElementById("mp-remote-ready");
    if (remoteReadyEl) {
      remoteReadyEl.textContent = this._mpLobbyReadyRemote ? "Ready" : "Not Ready";
      remoteReadyEl.classList.toggle("active", this._mpLobbyReadyRemote);
    }

    const readyBtn = document.getElementById("btn-mp-ready");
    if (readyBtn) readyBtn.textContent = this._mpLobbyReadyLocal ? "READY!" : "READY";

    const countdownLabel = document.getElementById("mp-countdown-label");
    if (countdownLabel) {
      countdownLabel.textContent = this._mpLobbyReadyLocal && this._mpLobbyReadyRemote
        ? "Starting soon..."
        : "Waiting for both players...";
    }
  }

  private _tryStartCountdown(): void {
    if (!this._isHost) return;
    if (this._state === GameState.MultiplayerCountdown) return;
    if (!this._mpLobbyReadyLocal || !this._mpLobbyReadyRemote) return;
    this._beginCountdown(3);
    this._network.sendCountdown({ seconds: 3 });
  }

  private _beginCountdown(seconds: number): void {
    this._mpCountdown = seconds;
    this._changeState(GameState.MultiplayerCountdown);
  }

  private _updateCountdown(dt: number): void {
    this._mpCountdown = Math.max(0, this._mpCountdown - dt);
    this._updateCountdownUI();
    if (this._mpCountdown > 0) return;
    if (this._isHost) {
      this._network.sendStart({ biome: this._selectedBiome, mode: this._mpMode });
      this._startMultiplayerRun();
    }
  }

  private _updateCountdownUI(): void {
    const el = document.getElementById("mp-countdown-value");
    if (el) el.textContent = Math.max(0, Math.ceil(this._mpCountdown)).toString();
  }

  private _assignMultiplayerLanes(): void {
    const center = Math.floor(LANE_COUNT / 2);
    const leftLane = Math.max(0, Math.min(LANE_COUNT - 1, center - 1));
    const rightLane = Math.max(0, Math.min(LANE_COUNT - 1, center + 1));
    if (this._isHost) {
      this._mpLocalLane = leftLane;
      this._mpRemoteLane = rightLane;
    } else {
      this._mpLocalLane = rightLane;
      this._mpRemoteLane = leftLane;
    }

    this._player.setLaneIndex(this._mpLocalLane, true);
    if (this._player.remoteMesh) {
      const x = this._laneToX(this._mpRemoteLane);
      this._player.remoteMesh.position.x = x;
      this._player.remoteMesh.position.z = 0;
    }
  }

  private _laneToX(lane: number): number {
    const roadOffset = this._road.roadOffsetX;
    return (lane - (LANE_COUNT - 1) / 2) * LANE_WIDTH + roadOffset;
  }

  private _handleCrashLimitCollision(carId: number, x: number, z: number): void {
    if (this._mpMatchEnded) return;
    const wasAlive = !this._player.isDead;
    this._player.handleCollision();
    this._score.onCollision();
    this._effects.spawnCollisionDebris(x, z);
    this._crashCooldownTimer = 0.6;

    if (wasAlive && this._player.isDead && this._mpLocalCrashes + 1 >= this._mpCrashLimit) {
      this._audio.playCrashLose();
    } else {
      this._audio.playNick();
    }

    this._mpLocalCrashes += 1;
    this._traffic.destroyCar(carId);
    this._syncLobbyUI();
    if (this._network.isConnected) {
      this._network.sendCrash({ crashes: this._mpLocalCrashes });
    }

    if (this._mpLocalCrashes >= this._mpCrashLimit) {
      this._endMultiplayerMatch("loss", "Crash limit reached");
      this._network.sendMatchEnd({ result: "loss", reason: "Crash limit" });
      return;
    }

    if (this._player.isDead) {
      this._player.reviveInLane(this._mpLocalLane, true);
    }
  }

  private _endMultiplayerMatch(result: "win" | "loss" | "draw", reason: string): void {
    if (this._mpMatchEnded) return;
    this._mpMatchEnded = true;
    this._effects.stopNitroFlame();
    this._gameOverResultText = result === "win" ? `YOU WON - ${reason}` : result === "loss" ? `YOU LOST - ${reason}` : "DRAW";
    this._changeState(GameState.GameOver);
  }

  // ──────────────── Vehicle Persistence ────────────────

  private _loadSelectedVehicleId(): string {
    try {
      const raw = localStorage.getItem("nolaws_save");
      if (raw) {
        const data = JSON.parse(raw);
        if (data.selectedVehicleId) return data.selectedVehicleId;
      }
    } catch { /* ignore */ }
    return "sedan";
  }

  private _saveSelectedVehicleId(vehicleId: string): void {
    try {
      const raw = localStorage.getItem("nolaws_save");
      const data = raw ? JSON.parse(raw) : {};
      data.selectedVehicleId = vehicleId;
      localStorage.setItem("nolaws_save", JSON.stringify(data));
    } catch { /* ignore */ }
  }

  // ──────────────── Difficulty Persistence ────────────────

  private _loadDifficulty(): string {
    try {
      const raw = localStorage.getItem("nolaws_save");
      if (raw) {
        const data = JSON.parse(raw);
        if (data.difficulty && DIFFICULTY_PRESETS[data.difficulty]) return data.difficulty;
      }
    } catch { /* ignore */ }
    return "normal";
  }

  private _saveDifficulty(difficulty: string): void {
    try {
      const raw = localStorage.getItem("nolaws_save");
      const data = raw ? JSON.parse(raw) : {};
      data.difficulty = difficulty;
      localStorage.setItem("nolaws_save", JSON.stringify(data));
    } catch { /* ignore */ }
  }

  private _syncDifficultyUI(): void {
    document.querySelectorAll(".diff-btn").forEach((btn) => {
      const diff = (btn as HTMLElement).dataset.difficulty;
      btn.classList.toggle("active", diff === this._difficulty);
    });
    this._updateDifficultyDescription(this._difficulty);
  }

  private _updateDifficultyDescription(diff: string): void {
    const desc = document.getElementById("diff-description");
    if (!desc) return;
    const descriptions: Record<string, string> = {
      easy: "Chill vibes \u2014 less traffic, more room to breathe.",
      normal: "Balanced traffic and challenge.",
      hard: "Chaos mode \u2014 packed roads, aggressive drivers.",
    };
    desc.textContent = descriptions[diff] ?? descriptions.normal;
  }
}
