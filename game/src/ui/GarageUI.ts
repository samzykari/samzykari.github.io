import {
  VehicleDefinition,
  VehicleCategory,
  PlayerUpgrades,
  VisualCustomization,
  UpgradeType,
} from "../types";
import { VEHICLE_ROSTER, getVehiclesByCategory } from "@vehicles/VehicleStats";
import {
  loadUpgrades,
  saveUpgrades,
  upgradeCost,
  defaultUpgrades,
} from "@vehicles/VehicleUpgrades";
import { loadVisuals, saveVisuals, defaultVisuals } from "@vehicles/VehicleFactory";
import { UPGRADE_MAX_LEVEL } from "../constants";

/**
 * Controls the garage overlay: vehicle carousel, upgrades, visual customization.
 */
export class GarageUI {
  private _currentCategory: VehicleCategory = VehicleCategory.DailyTuner;
  private _filteredVehicles: VehicleDefinition[] = [];
  private _currentIndex = 0;
  private _upgrades: PlayerUpgrades = defaultUpgrades();
  private _visuals: VisualCustomization = defaultVisuals();

  public onVehicleChange?: (def: VehicleDefinition) => void;
  public onVisualsChange?: (visuals: VisualCustomization) => void;
  public coins = 0;

  get selectedVehicle(): VehicleDefinition {
    return this._filteredVehicles[this._currentIndex];
  }

  get currentUpgrades(): PlayerUpgrades {
    return this._upgrades;
  }

  get currentVisuals(): VisualCustomization {
    return this._visuals;
  }

  constructor() {
    this._wireControls();
    this._setCategory(VehicleCategory.DailyTuner);
  }

  /** Refresh display with current coins from ScoreManager. */
  refresh(coins: number): void {
    this.coins = coins;
    document.getElementById("garage-coins")!.textContent = coins.toString();
    this._updateDisplay();
  }

  private _wireControls(): void {
    // Category tabs
    document.querySelectorAll(".cat-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        const cat = (tab as HTMLElement).dataset.category as VehicleCategory;
        if (cat) this._setCategory(cat);
        document.querySelectorAll(".cat-tab").forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
      });
    });

    // Carousel arrows
    document.getElementById("btn-prev-vehicle")?.addEventListener("click", () => {
      this._currentIndex =
        (this._currentIndex - 1 + this._filteredVehicles.length) %
        this._filteredVehicles.length;
      this._loadVehicleData();
      this._updateDisplay();
    });

    document.getElementById("btn-next-vehicle")?.addEventListener("click", () => {
      this._currentIndex = (this._currentIndex + 1) % this._filteredVehicles.length;
      this._loadVehicleData();
      this._updateDisplay();
    });

    // Upgrade buttons
    document.querySelectorAll(".btn-upgrade").forEach((btn) => {
      btn.addEventListener("click", () => {
        const type = (btn as HTMLElement).dataset.upgrade as UpgradeType;
        if (type) this._tryUpgrade(type);
      });
    });

    // Visual customization
    document.getElementById("paint-color")?.addEventListener("input", (e) => {
      this._visuals.paintColor = (e.target as HTMLInputElement).value;
      this._saveAndNotifyVisuals();
    });

    document.getElementById("underglow-color")?.addEventListener("input", (e) => {
      this._visuals.underglowColor = (e.target as HTMLInputElement).value;
      this._saveAndNotifyVisuals();
    });

    document.getElementById("underglow-toggle")?.addEventListener("change", (e) => {
      this._visuals.underglowEnabled = (e.target as HTMLInputElement).checked;
      this._saveAndNotifyVisuals();
    });

    document.getElementById("exhaust-toggle")?.addEventListener("change", (e) => {
      this._visuals.exhaustFlamesEnabled = (e.target as HTMLInputElement).checked;
      this._saveAndNotifyVisuals();
    });
  }

  private _setCategory(cat: VehicleCategory): void {
    this._currentCategory = cat;
    this._filteredVehicles = getVehiclesByCategory(cat);
    this._currentIndex = 0;
    this._loadVehicleData();
    this._updateDisplay();
  }

  private _loadVehicleData(): void {
    const v = this.selectedVehicle;
    this._upgrades = loadUpgrades(v.id);
    this._visuals = loadVisuals(v.id);
    this.onVehicleChange?.(v);
  }

  private _updateDisplay(): void {
    const v = this.selectedVehicle;
    document.getElementById("vehicle-name")!.textContent = v.name;
    document.getElementById("vehicle-category")!.textContent =
      this._categoryLabel(v.category);

    // Update stat bars (percentage of max possible)
    this._setBar("bar-engine", v.baseStats.topSpeed, 140, this._upgrades.engine.level);
    this._setBar("bar-tires", v.baseStats.handling, 2, this._upgrades.tires.level);
    this._setBar("bar-chassis", v.baseStats.health, 4, this._upgrades.chassis.level);
    this._setBar("bar-nitro", v.baseStats.nitroCapacity, 8, this._upgrades.nitro.level);

    // Update upgrade costs
    const upgradeTypes: UpgradeType[] = [UpgradeType.Engine, UpgradeType.Tires, UpgradeType.Chassis, UpgradeType.Nitro];
    for (const type of upgradeTypes) {
      const btn = document.querySelector(`.btn-upgrade[data-upgrade="${type}"]`);
      if (!btn) continue;
      const level = this._upgrades[type].level;
      const costEl = btn.querySelector(".upgrade-cost");
      if (level >= UPGRADE_MAX_LEVEL) {
        if (costEl) costEl.textContent = "MAX";
        (btn as HTMLButtonElement).disabled = true;
      } else {
        const cost = upgradeCost(level);
        if (costEl) costEl.textContent = `(${cost})`;
        (btn as HTMLButtonElement).disabled = this.coins < cost;
      }
    }

    // Visual controls
    (document.getElementById("paint-color") as HTMLInputElement).value =
      this._visuals.paintColor;
    (document.getElementById("underglow-color") as HTMLInputElement).value =
      this._visuals.underglowColor;
    (document.getElementById("underglow-toggle") as HTMLInputElement).checked =
      this._visuals.underglowEnabled;
    (document.getElementById("exhaust-toggle") as HTMLInputElement).checked =
      this._visuals.exhaustFlamesEnabled;
  }

  private _setBar(
    barId: string,
    baseValue: number,
    maxValue: number,
    upgradeLevel: number
  ): void {
    const bar = document.getElementById(barId);
    if (!bar) return;
    const pct = Math.min(100, ((baseValue / maxValue) * 100) + upgradeLevel * 8);
    bar.style.width = `${pct}%`;
  }

  private _tryUpgrade(type: UpgradeType): void {
    const level = this._upgrades[type].level;
    if (level >= UPGRADE_MAX_LEVEL) return;
    const cost = upgradeCost(level);
    if (this.coins < cost) return;

    this.coins -= cost;
    this._upgrades[type].level++;
    saveUpgrades(this.selectedVehicle.id, this._upgrades);

    // Persist coin change
    try {
      const raw = localStorage.getItem("nolaws_save");
      const data = raw ? JSON.parse(raw) : {};
      data.coins = this.coins;
      localStorage.setItem("nolaws_save", JSON.stringify(data));
    } catch { /* ignore */ }

    this._updateDisplay();
  }

  private _saveAndNotifyVisuals(): void {
    saveVisuals(this.selectedVehicle.id, this._visuals);
    this.onVisualsChange?.(this._visuals);
  }

  private _categoryLabel(cat: VehicleCategory): string {
    switch (cat) {
      case VehicleCategory.DailyTuner: return "Daily Tuner";
      case VehicleCategory.JDMLegend: return "JDM Legend";
      case VehicleCategory.HeavyTruck: return "Heavy Truck";
      case VehicleCategory.RaceCar: return "Race Car";
    }
  }
}
