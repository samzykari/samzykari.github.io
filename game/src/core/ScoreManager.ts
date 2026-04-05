import {
  NEAR_MISS_SCORE,
  DISTANCE_SCORE_RATE,
  DRAFT_BONUS_PER_SEC,
  MAX_MULTIPLIER,
  MULTIPLIER_DECAY_TIME,
  COIN_VALUE,
} from "../constants";
import { RunStats } from "../types";

const SAVE_KEY = "nolaws_save";

/**
 * Tracks score, multiplier, coins, and run statistics.
 * Persists coins and high score to localStorage.
 */
export class ScoreManager {
  public score = 0;
  public multiplier = 1;
  public coins = 0;
  public runCoins = 0;
  public nearMissCount = 0;
  public maxMultiplier = 1;
  public distance = 0;

  private _timeSinceLastNearMiss = 0;

  constructor() {
    this._loadCoins();
  }

  update(dt: number, scrollSpeed: number): void {
    // Distance-based score
    const distDelta = scrollSpeed * dt;
    this.distance += distDelta;
    this.score += distDelta * DISTANCE_SCORE_RATE * this.multiplier;

    // Multiplier decay
    this._timeSinceLastNearMiss += dt;
    if (this._timeSinceLastNearMiss >= MULTIPLIER_DECAY_TIME) {
      this.multiplier = 1;
    }
  }

  /** Called when a near-miss is detected. */
  registerNearMiss(): void {
    this.nearMissCount++;
    this._timeSinceLastNearMiss = 0;
    this.score += NEAR_MISS_SCORE * this.multiplier;
    this.multiplier = Math.min(this.multiplier + 1, MAX_MULTIPLIER);
    if (this.multiplier > this.maxMultiplier) {
      this.maxMultiplier = this.multiplier;
    }
  }

  /** Called per frame when drafting. */
  registerDrafting(dt: number): void {
    this.score += DRAFT_BONUS_PER_SEC * dt * this.multiplier;
  }

  /** Called when a coin is collected. */
  collectCoin(): void {
    this.runCoins += COIN_VALUE;
  }

  /** Called on collision — reset multiplier. */
  onCollision(): void {
    this.multiplier = 1;
  }

  /** Add a flat score bonus (e.g. Frontal Blast). */
  addBonus(points: number): void {
    this.score += points * this.multiplier;
  }

  /** Finalize run, persist data. Returns run summary. */
  endRun(): RunStats {
    this.coins += this.runCoins;
    this._saveCoins();
    return {
      score: Math.floor(this.score),
      coins: this.runCoins,
      nearMisses: this.nearMissCount,
      maxMultiplier: this.maxMultiplier,
      distance: Math.floor(this.distance),
    };
  }

  /** Spend coins (for upgrades). Returns true if successful. */
  spendCoins(amount: number): boolean {
    if (this.coins < amount) return false;
    this.coins -= amount;
    this._saveCoins();
    return true;
  }

  reset(): void {
    this.score = 0;
    this.multiplier = 1;
    this.runCoins = 0;
    this.nearMissCount = 0;
    this.maxMultiplier = 1;
    this.distance = 0;
    this._timeSinceLastNearMiss = 0;
  }

  // ─────────────── Persistence ───────────────

  private _loadCoins(): void {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        this.coins = typeof data.coins === "number" ? data.coins : 0;
      }
    } catch {
      this.coins = 0;
    }
  }

  private _saveCoins(): void {
    try {
      const existing = this._loadSaveData();
      existing.coins = this.coins;
      localStorage.setItem(SAVE_KEY, JSON.stringify(existing));
    } catch {
      // localStorage not available
    }
  }

  private _loadSaveData(): Record<string, unknown> {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }
}
