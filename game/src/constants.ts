// ─── Road / Lane Geometry ───
export const LANE_COUNT = 5;
export const LANE_WIDTH = 4;
export const ROAD_WIDTH = LANE_COUNT * LANE_WIDTH; // 20 units
export const CHUNK_LENGTH = 200;
export const VISIBLE_CHUNKS = 10;
export const ROAD_Y = 0;

// ─── Player Physics ───
export const BASE_SCROLL_SPEED = 40; // units/sec at start
export const SPEED_INCREASE_RATE = 0.15; // units/sec² passive acceleration
export const BRAKE_RATE = 60; // units/sec² deceleration
export const MIN_SPEED = 15;
export const NITRO_SPEED_MULTIPLIER = 1.5;
export const NITRO_DRAIN_RATE = 1; // seconds of capacity per second
export const LANE_SWITCH_BASE_LERP = 8; // base lane-switch speed
export const PLAYER_Y = 0.6; // player mesh center Y

// ─── Near Miss / Collision ───
export const PLAYER_HITBOX_HALF_W = 1.0;
export const PLAYER_HITBOX_HALF_L = 2.0;
export const NEAR_MISS_EXPAND_W = 1.2; // extra width each side for near-miss zone
export const NEAR_MISS_EXPAND_L = 1.0; // extra length each end for near-miss zone
export const NEAR_MISS_COOLDOWN = 0.15; // seconds between near-miss triggers on same car
export const MULTIPLIER_DECAY_TIME = 3.0; // seconds without near-miss to reset multiplier
export const MAX_MULTIPLIER = 10;

// ─── Drafting ───
export const DRAFT_CONE_HALF_ANGLE = 0.25; // radians
export const DRAFT_MAX_DISTANCE = 15;
export const DRAFT_MIN_TIME = 0.5; // seconds to start gaining bonus
export const DRAFT_BONUS_PER_SEC = 50;

// ─── Traffic ───
export const TRAFFIC_SPAWN_AHEAD = 150; // spawn distance ahead of player (near camera far plane)
export const TRAFFIC_DESPAWN_BEHIND = 20; // despawn distance behind player
export const TRAFFIC_BASE_DENSITY = 0.12; // cars per unit of road at start
export const TRAFFIC_MAX_DENSITY = 0.3;
export const TRAFFIC_DENSITY_INCREASE = 0.001; // per second of gameplay
export const TRAFFIC_MIN_SPEED_RATIO = 0.1; // min speed as fraction of player speed
export const TRAFFIC_MAX_SPEED_RATIO = 0.45; // max speed as fraction of player speed
export const TRAFFIC_MIN_GAP = 15; // minimum Z gap between cars in same lane
export const TRAFFIC_MIN_OPEN_LANES = 2; // lanes that must remain clear at any spawn Z-slice
export const TRAFFIC_LANE_CHANGE_CHANCE = 0.15; // probability per second a car starts lane change
export const TRAFFIC_LANE_CHANGE_SPEED = 2.5; // X units/sec during lane change
export const TRAFFIC_LANE_CHANGE_COOLDOWN = 3.0; // seconds between lane changes per car
export const TRAFFIC_SPEED_WOBBLE = 0.08; // ± speed ratio sinusoidal variation
export const TRAFFIC_FORMATION_CHANCE = 0.3; // chance to spawn formation instead of single car
export const TRAFFIC_FORMATION_MIN_Z_GAP = 30; // min Z between formations

// ─── Spatial Grid ───
export const GRID_CELL_SIZE = 20;

// ─── Power-Ups ───
export const POWERUP_SPAWN_INTERVAL = 8; // seconds between spawns
export const POWERUP_SPAWN_VARIANCE = 4; // ± random seconds
export const GHOST_DURATION = 5;
export const EMP_RANGE = 50; // units in Z each direction
export const COIN_MAGNET_DURATION = 8;
export const COIN_MAGNET_RADIUS = 20;
export const FRONTAL_BLAST_RANGE = 30; // Z units ahead to detect target
export const FRONTAL_BLAST_SCORE_BONUS = 500;

// ─── Coins ───
export const COIN_SPAWN_INTERVAL = 3; // average seconds between coin clusters
export const COIN_CLUSTER_SIZE = 5;
export const COIN_SPACING = 3; // Z spacing between coins in cluster
export const COIN_VALUE = 10;

// ─── Score ───
export const NEAR_MISS_SCORE = 100;
export const DISTANCE_SCORE_RATE = 10; // points per unit traveled

// ─── Rival AI ───
export const RIVAL_BASE_SPEED_RATIO = 0.95; // fraction of player speed
export const RIVAL_CHASE_ACCEL = 0.3;
export const RIVAL_BLOCK_PREDICT_TIME = 0.8; // seconds ahead to predict player lane
export const RIVAL_BRAKE_CHECK_DECEL = 40;
export const RIVAL_RUBBER_BAND_DISTANCE = 80; // max distance before rubber-banding

// ─── Upgrades ───
export const UPGRADE_MAX_LEVEL = 5;
export const UPGRADE_BASE_COST = 500;
export const UPGRADE_COST_EXPONENT = 1.8;
export const ENGINE_UPGRADE_PERCENT = 0.05; // +5% per level
export const TIRES_UPGRADE_PERCENT = 0.08; // +8% per level
export const CHASSIS_HEALTH_LEVELS = [3, 5]; // levels that grant +1 health
export const NITRO_UPGRADE_PERCENT = 0.15; // +15% per level

// ─── Camera ───
export const CAMERA_RADIUS = 12;
export const CAMERA_HEIGHT_OFFSET = 6;
export const CAMERA_ROTATION_OFFSET = 0; // degrees, behind player

// ─── Difficulty Presets ───
export interface DifficultyPreset {
  trafficBaseDensity: number;
  trafficMaxDensity: number;
  trafficDensityIncrease: number;
  trafficMinSpeedRatio: number;
  trafficMaxSpeedRatio: number;
  trafficMinOpenLanes: number;
  trafficFormationChance: number;
  trafficLaneChangeChance: number;
}

export const DIFFICULTY_PRESETS: Record<string, DifficultyPreset> = {
  easy: {
    trafficBaseDensity: 0.08,
    trafficMaxDensity: 0.2,
    trafficDensityIncrease: 0.0005,
    trafficMinSpeedRatio: 0.05,
    trafficMaxSpeedRatio: 0.3,
    trafficMinOpenLanes: 3,
    trafficFormationChance: 0.15,
    trafficLaneChangeChance: 0.08,
  },
  normal: {
    trafficBaseDensity: 0.12,
    trafficMaxDensity: 0.3,
    trafficDensityIncrease: 0.001,
    trafficMinSpeedRatio: 0.1,
    trafficMaxSpeedRatio: 0.45,
    trafficMinOpenLanes: 2,
    trafficFormationChance: 0.3,
    trafficLaneChangeChance: 0.15,
  },
  hard: {
    trafficBaseDensity: 0.18,
    trafficMaxDensity: 0.45,
    trafficDensityIncrease: 0.002,
    trafficMinSpeedRatio: 0.15,
    trafficMaxSpeedRatio: 0.55,
    trafficMinOpenLanes: 1,
    trafficFormationChance: 0.5,
    trafficLaneChangeChance: 0.25,
  },
};

// ─── LOD Distances ───
export const LOD_HIGH_DISTANCE = 50;
export const LOD_MEDIUM_DISTANCE = 150;
export const LOD_CULL_DISTANCE = 250;

// ─── Performance ───
export const TARGET_FPS = 60;
export const FPS_CHECK_INTERVAL = 3; // seconds
export const LOW_FPS_THRESHOLD = 50;
export const AUTO_SCALE_STEP = 0.25; // hardware scaling increment
export const MAX_HARDWARE_SCALE = 2.0;
