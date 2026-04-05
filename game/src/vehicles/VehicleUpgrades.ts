import {
  VehicleStats,
  VehicleDefinition,
  PlayerUpgrades,
  UpgradeType,
} from "../types";
import {
  UPGRADE_MAX_LEVEL,
  UPGRADE_BASE_COST,
  UPGRADE_COST_EXPONENT,
  ENGINE_UPGRADE_PERCENT,
  TIRES_UPGRADE_PERCENT,
  CHASSIS_HEALTH_LEVELS,
  NITRO_UPGRADE_PERCENT,
} from "../constants";

const SAVE_KEY = "nolaws_save";

/** Default upgrade state. */
export function defaultUpgrades(): PlayerUpgrades {
  return {
    engine: { level: 0, maxLevel: UPGRADE_MAX_LEVEL },
    tires: { level: 0, maxLevel: UPGRADE_MAX_LEVEL },
    chassis: { level: 0, maxLevel: UPGRADE_MAX_LEVEL },
    nitro: { level: 0, maxLevel: UPGRADE_MAX_LEVEL },
  };
}

/** Calculate the coin cost for the next level of a given upgrade type. */
export function upgradeCost(currentLevel: number): number {
  if (currentLevel >= UPGRADE_MAX_LEVEL) return Infinity;
  return Math.floor(UPGRADE_BASE_COST * Math.pow(UPGRADE_COST_EXPONENT, currentLevel));
}

/** Apply upgrades to base stats, returning the effective stats. */
export function applyUpgrades(
  base: VehicleStats,
  upgrades: PlayerUpgrades
): VehicleStats {
  const engineMult = 1 + ENGINE_UPGRADE_PERCENT * upgrades.engine.level;
  const tiresMult = 1 + TIRES_UPGRADE_PERCENT * upgrades.tires.level;
  const nitroMult = 1 + NITRO_UPGRADE_PERCENT * upgrades.nitro.level;

  // Chassis grants +1 health at specific levels
  let bonusHealth = 0;
  for (const lvl of CHASSIS_HEALTH_LEVELS) {
    if (upgrades.chassis.level >= lvl) bonusHealth++;
  }

  return {
    topSpeed: base.topSpeed * engineMult,
    acceleration: base.acceleration * engineMult,
    handling: base.handling * tiresMult,
    grip: base.grip * tiresMult,
    health: base.health + bonusHealth,
    nitroCapacity: base.nitroCapacity * nitroMult,
    nearMissZoneScale: base.nearMissZoneScale,
    driftMultiplier: base.driftMultiplier,
  };
}

// ─── Persistence ───

export function loadUpgrades(vehicleId: string): PlayerUpgrades {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultUpgrades();
    const data = JSON.parse(raw);
    const ups = data.upgrades?.[vehicleId];
    if (ups) return ups as PlayerUpgrades;
  } catch {
    // ignore
  }
  return defaultUpgrades();
}

export function saveUpgrades(vehicleId: string, upgrades: PlayerUpgrades): void {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    const data = raw ? JSON.parse(raw) : {};
    if (!data.upgrades) data.upgrades = {};
    data.upgrades[vehicleId] = upgrades;
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}
