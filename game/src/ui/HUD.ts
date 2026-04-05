import { PowerUpType } from "../types";

const POWERUP_LABELS: Record<PowerUpType, string> = {
  [PowerUpType.Ghost]: "👻 GHOST",
  [PowerUpType.EMP]: "⚡ EMP",
  [PowerUpType.Nitro]: "🔥 NITRO",
  [PowerUpType.CoinMagnet]: "🧲 MAGNET",
  [PowerUpType.FrontalBlast]: "💥 BLAST",
};

/**
 * Updates the in-game HUD elements each frame.
 */
export class HUD {
  private _speedEl: HTMLElement;
  private _scoreEl: HTMLElement;
  private _multiplierEl: HTMLElement;
  private _coinsEl: HTMLElement;
  private _nitroFill: HTMLElement;
  private _powerupIcon: HTMLElement;
  private _powerupTimer: HTMLElement;
  private _powerupSlot1: HTMLElement;
  private _powerupSlot2: HTMLElement;
  private _modeTitle: HTMLElement;
  private _modeStatus: HTMLElement;
  private _rivalDot: HTMLElement;
  private _rivalContainer: HTMLElement | null;
  private _healthContainer: HTMLElement;

  constructor() {
    this._speedEl = document.getElementById("hud-speed-value")!;
    this._scoreEl = document.getElementById("hud-score-value")!;
    this._multiplierEl = document.getElementById("hud-multiplier")!;
    this._coinsEl = document.getElementById("hud-coins")!;
    this._nitroFill = document.getElementById("nitro-fill")!;
    this._powerupIcon = document.getElementById("hud-powerup-icon")!;
    this._powerupTimer = document.getElementById("hud-powerup-timer")!;
    this._powerupSlot1 = document.getElementById("hud-powerup-slot-1")!;
    this._powerupSlot2 = document.getElementById("hud-powerup-slot-2")!;
    this._modeTitle = document.getElementById("hud-mode-title")!;
    this._modeStatus = document.getElementById("hud-mode-status")!;
    this._rivalDot = document.getElementById("rival-indicator")!;
    this._rivalContainer = document.querySelector(".hud-rival");
    this._healthContainer = document.getElementById("hud-health")!;
  }

  updateSpeed(kmh: number): void {
    this._speedEl.textContent = Math.floor(kmh).toString();
  }

  updateScore(score: number): void {
    this._scoreEl.textContent = Math.floor(score).toLocaleString();
  }

  updateMultiplier(mult: number): void {
    this._multiplierEl.textContent = `x${mult}`;
    this._multiplierEl.classList.toggle("hot", mult >= 5);
  }

  updateCoins(coins: number): void {
    this._coinsEl.textContent = coins.toString();
  }

  updateNitro(fraction: number): void {
    this._nitroFill.style.width = `${Math.max(0, Math.min(100, fraction * 100))}%`;
  }

  updatePowerUps(held: PowerUpType[], active: PowerUpType | null, timer: number): void {
    if (active === null) {
      this._powerupIcon.classList.add("hidden");
      this._powerupTimer.textContent = "";
    } else {
      this._powerupIcon.classList.remove("hidden");
      this._powerupIcon.textContent = POWERUP_LABELS[active];
      this._powerupTimer.textContent = timer > 0 ? timer.toFixed(1) + "s" : "";
    }

    this._powerupSlot1.textContent = held[0] ? POWERUP_LABELS[held[0]] : "";
    this._powerupSlot2.textContent = held[1] ? POWERUP_LABELS[held[1]] : "";
  }

  updateMode(title: string, status: string): void {
    this._modeTitle.textContent = title;
    this._modeStatus.textContent = status;
  }

  /** Update the rival distance indicator. -1 to 1 where -1 is far behind, 1 is far ahead. */
  updateRivalPosition(normalizedOffset: number): void {
    const pct = ((normalizedOffset + 1) / 2) * 100;
    this._rivalDot.style.left = `${Math.max(0, Math.min(100, pct))}%`;
  }

  setRivalVisible(visible: boolean): void {
    if (!this._rivalContainer) return;
    this._rivalContainer.classList.toggle("hidden", !visible);
  }

  /** Show health pips for trucks. */
  updateHealth(current: number, max: number): void {
    if (max <= 0) {
      this._healthContainer.classList.add("hidden");
      return;
    }
    this._healthContainer.classList.remove("hidden");
    let html = "";
    for (let i = 0; i < max; i++) {
      html += `<span class="health-pip ${i < current ? "filled" : "empty"}"></span>`;
    }
    this._healthContainer.innerHTML = html;
  }
}
