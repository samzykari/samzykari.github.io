import { VehicleDefinition, VehicleCategory } from "../types";

/**
 * Full roster of all available vehicle models across 4 categories.
 * All stats are base values before upgrades.
 */
const BASE_STATS = {
  daily: {
    topSpeed: 80,
    acceleration: 24,
    handling: 1.2,
    grip: 1.3,
    health: 0,
    nitroCapacity: 3.2,
    nearMissZoneScale: 1.2,
    driftMultiplier: 1.1,
  },
  jdm: {
    topSpeed: 95,
    acceleration: 32,
    handling: 1.6,
    grip: 1.1,
    health: 0,
    nitroCapacity: 3.5,
    nearMissZoneScale: 1.0,
    driftMultiplier: 1.6,
  },
  race: {
    topSpeed: 125,
    acceleration: 40,
    handling: 1.7,
    grip: 1.7,
    health: 0,
    nitroCapacity: 4.2,
    nearMissZoneScale: 0.9,
    driftMultiplier: 1.3,
  },
  heavy: {
    topSpeed: 65,
    acceleration: 18,
    handling: 0.7,
    grip: 0.8,
    health: 2,
    nitroCapacity: 2.5,
    nearMissZoneScale: 0.9,
    driftMultiplier: 1.0,
  },
  kart: {
    topSpeed: 70,
    acceleration: 30,
    handling: 2.0,
    grip: 1.6,
    health: 0,
    nitroCapacity: 2.0,
    nearMissZoneScale: 1.4,
    driftMultiplier: 1.8,
  },
};

const v = (
  id: string,
  name: string,
  category: VehicleCategory,
  modelName: string,
  meshScale: { x: number; y: number; z: number },
  unlockCost: number,
  baseStats: VehicleDefinition["baseStats"]
): VehicleDefinition => ({
  id,
  name,
  category,
  modelName,
  unlockCost,
  meshScale,
  baseStats,
});

export const VEHICLE_ROSTER: VehicleDefinition[] = [
  // ═══════════════ DAILY TUNERS ═══════════════
  v("sedan", "Sedan", VehicleCategory.DailyTuner, "sedan", { x: 1.8, y: 1.0, z: 4.2 }, 0, BASE_STATS.daily),
  v("hatchback-sports", "Hatchback", VehicleCategory.DailyTuner, "hatchback-sports", { x: 1.75, y: 0.95, z: 4.0 }, 300, BASE_STATS.daily),
  v("suv", "SUV", VehicleCategory.DailyTuner, "suv", { x: 2.0, y: 1.2, z: 4.6 }, 500, { ...BASE_STATS.daily, topSpeed: 76, handling: 1.0 }),
  v("suv-luxury", "SUV Luxury", VehicleCategory.DailyTuner, "suv-luxury", { x: 2.05, y: 1.25, z: 4.8 }, 900, { ...BASE_STATS.daily, topSpeed: 80, handling: 1.1 }),
  v("taxi", "Taxi", VehicleCategory.DailyTuner, "taxi", { x: 1.9, y: 1.05, z: 4.4 }, 200, BASE_STATS.daily),
  v("police", "Police", VehicleCategory.DailyTuner, "police", { x: 2.0, y: 1.1, z: 4.6 }, 700, { ...BASE_STATS.daily, topSpeed: 82, handling: 1.2 }),
  v("van", "Van", VehicleCategory.DailyTuner, "van", { x: 2.1, y: 1.3, z: 5.2 }, 600, { ...BASE_STATS.daily, topSpeed: 74, handling: 0.9 }),

  // ═══════════════ JDM LEGENDS ═══════════════
  v("sedan-sports", "Sedan Sports", VehicleCategory.JDMLegend, "sedan-sports", { x: 1.8, y: 0.9, z: 4.3 }, 1200, BASE_STATS.jdm),

  // ═══════════════ HEAVY TRUCKS ═══════════════
  v("truck", "Truck", VehicleCategory.HeavyTruck, "truck", { x: 2.4, y: 2.0, z: 6.0 }, 1000, BASE_STATS.heavy),
  v("truck-flat", "Truck Flatbed", VehicleCategory.HeavyTruck, "truck-flat", { x: 2.6, y: 2.0, z: 7.0 }, 1400, { ...BASE_STATS.heavy, topSpeed: 60 }),
  v("delivery", "Delivery", VehicleCategory.HeavyTruck, "delivery", { x: 2.4, y: 2.0, z: 6.5 }, 1200, BASE_STATS.heavy),
  v("delivery-flat", "Delivery Flat", VehicleCategory.HeavyTruck, "delivery-flat", { x: 2.5, y: 2.0, z: 7.2 }, 1500, { ...BASE_STATS.heavy, topSpeed: 58 }),
  v("garbage-truck", "Garbage Truck", VehicleCategory.HeavyTruck, "garbage-truck", { x: 2.6, y: 2.2, z: 7.2 }, 1800, { ...BASE_STATS.heavy, topSpeed: 56 }),
  v("firetruck", "Firetruck", VehicleCategory.HeavyTruck, "firetruck", { x: 2.6, y: 2.2, z: 7.5 }, 2000, { ...BASE_STATS.heavy, topSpeed: 58 }),
  v("ambulance", "Ambulance", VehicleCategory.HeavyTruck, "ambulance", { x: 2.2, y: 1.8, z: 6.2 }, 1700, { ...BASE_STATS.heavy, topSpeed: 62, handling: 0.8 }),
  v("tractor", "Tractor", VehicleCategory.HeavyTruck, "tractor", { x: 2.4, y: 2.2, z: 4.5 }, 1300, { ...BASE_STATS.heavy, topSpeed: 52, handling: 0.6 }),
  v("tractor-police", "Tractor Police", VehicleCategory.HeavyTruck, "tractor-police", { x: 2.4, y: 2.2, z: 4.5 }, 1400, { ...BASE_STATS.heavy, topSpeed: 52, handling: 0.6 }),
  v("tractor-shovel", "Tractor Shovel", VehicleCategory.HeavyTruck, "tractor-shovel", { x: 2.6, y: 2.4, z: 5.0 }, 1500, { ...BASE_STATS.heavy, topSpeed: 50, handling: 0.55 }),

  // ═══════════════ RACE CARS ═══════════════
  v("race", "Race", VehicleCategory.RaceCar, "race", { x: 1.9, y: 0.75, z: 4.5 }, 2000, { ...BASE_STATS.race, topSpeed: 108, handling: 1.85 }),
  v("race-future", "Race Future", VehicleCategory.RaceCar, "race-future", { x: 1.95, y: 0.7, z: 4.6 }, 2600, { ...BASE_STATS.race, topSpeed: 115, handling: 1.95 }),
  v("kart-oobi", "Kart Oobi", VehicleCategory.RaceCar, "kart-oobi", { x: 1.2, y: 0.6, z: 2.2 }, 400, BASE_STATS.kart),
  v("kart-oodi", "Kart Oodi", VehicleCategory.RaceCar, "kart-oodi", { x: 1.2, y: 0.6, z: 2.2 }, 500, BASE_STATS.kart),
  v("kart-ooli", "Kart Ooli", VehicleCategory.RaceCar, "kart-ooli", { x: 1.2, y: 0.6, z: 2.2 }, 500, BASE_STATS.kart),
  v("kart-oopi", "Kart Oopi", VehicleCategory.RaceCar, "kart-oopi", { x: 1.2, y: 0.6, z: 2.2 }, 600, BASE_STATS.kart),
  v("kart-oozi", "Kart Oozi", VehicleCategory.RaceCar, "kart-oozi", { x: 1.2, y: 0.6, z: 2.2 }, 600, BASE_STATS.kart),
];

/** Look up a vehicle by id. */
export function getVehicleById(id: string): VehicleDefinition | undefined {
  return VEHICLE_ROSTER.find((v) => v.id === id);
}

/** Get all vehicles in a category. */
export function getVehiclesByCategory(
  category: VehicleCategory
): VehicleDefinition[] {
  return VEHICLE_ROSTER.filter((v) => v.category === category);
}
