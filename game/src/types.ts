// ─── Vehicle Categories ───
export enum VehicleCategory {
  DailyTuner = "dailyTuner",
  JDMLegend = "jdmLegend",
  HeavyTruck = "heavyTruck",
  RaceCar = "raceCar",
}

// ─── Power-Up Types ───
export enum PowerUpType {
  Ghost = "ghost",
  EMP = "emp",
  Nitro = "nitro",
  CoinMagnet = "coinMagnet",
  FrontalBlast = "frontalBlast",
}

// ─── Biome Types ───
export enum BiomeType {
  ModernCity = "modernCity",
  DesertCanyon = "desertCanyon",
  CoastalHighway = "coastalHighway",
}

// ─── Game States ───
export enum GameState {
  Menu = "menu",
  ModeSelect = "modeSelect",
  BiomeSelect = "biomeSelect",
  Multiplayer = "multiplayer",
  MultiplayerLobby = "multiplayerLobby",
  MultiplayerCountdown = "multiplayerCountdown",
  Garage = "garage",
  Settings = "settings",
  Playing = "playing",
  Paused = "paused",
  GameOver = "gameOver",
}

// ─── Game Modes ───
export enum GameMode {
  FreeRoam = "freeRoam",
  TimeTrial = "timeTrial",
  TrafficMayhem = "trafficMayhem",
  DeliveryRush = "deliveryRush",
  BossChase = "bossChase",
  ConeSmash = "coneSmash",
}

// ─── Rival AI States ───
export enum RivalState {
  Chase = "chase",
  Block = "block",
  BrakeCheck = "brakeCheck",
  StealPowerUp = "stealPowerUp",
  Recover = "recover",
}

// ─── Upgrade Types ───
export enum UpgradeType {
  Engine = "engine",
  Tires = "tires",
  Chassis = "chassis",
  Nitro = "nitro",
}

// ─── Interfaces ───

export interface VehicleStats {
  topSpeed: number;
  acceleration: number;
  handling: number; // lane-switch lerp speed multiplier
  grip: number; // drift forgiveness
  health: number; // collisions that can be absorbed (trucks only)
  nitroCapacity: number; // seconds of nitro
  nearMissZoneScale: number; // multiplier on near-miss hitbox size
  driftMultiplier: number; // bonus score for drifting
}

export interface VehicleDefinition {
  id: string;
  name: string;
  category: VehicleCategory;
  modelName: string;
  baseStats: VehicleStats;
  unlockCost: number;
  meshScale: { x: number; y: number; z: number };
}

export interface UpgradeLevel {
  level: number;
  maxLevel: number;
}

export interface PlayerUpgrades {
  engine: UpgradeLevel;
  tires: UpgradeLevel;
  chassis: UpgradeLevel;
  nitro: UpgradeLevel;
}

export interface VisualCustomization {
  paintColor: string;
  underglowColor: string;
  underglowEnabled: boolean;
  exhaustFlamesEnabled: boolean;
}

export interface PlayerSaveData {
  coins: number;
  selectedVehicleId: string;
  unlockedVehicles: string[];
  upgrades: Record<string, PlayerUpgrades>;
  visuals: Record<string, VisualCustomization>;
  highScore: number;
}

export interface RunStats {
  score: number;
  coins: number;
  nearMisses: number;
  maxMultiplier: number;
  distance: number;
}

export interface PowerUpInstance {
  type: PowerUpType;
  laneIndex: number;
  zPosition: number;
  collected: boolean;
}
