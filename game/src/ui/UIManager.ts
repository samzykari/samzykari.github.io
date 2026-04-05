import { GameState } from "../types";

type ScreenId =
  | "main-menu"
  | "mode-select"
  | "biome-select"
  | "multiplayer-menu"
  | "multiplayer-lobby"
  | "multiplayer-countdown"
  | "garage"
  | "settings"
  | "hud"
  | "pause-menu"
  | "game-over";

const SCREEN_IDS: ScreenId[] = [
  "main-menu",
  "mode-select",
  "biome-select",
  "multiplayer-menu",
  "multiplayer-lobby",
  "multiplayer-countdown",
  "garage",
  "settings",
  "hud",
  "pause-menu",
  "game-over",
];

const STATE_TO_SCREEN: Record<GameState, ScreenId> = {
  [GameState.Menu]: "main-menu",
  [GameState.ModeSelect]: "mode-select",
  [GameState.BiomeSelect]: "biome-select",
  [GameState.Multiplayer]: "multiplayer-menu",
  [GameState.MultiplayerLobby]: "multiplayer-lobby",
  [GameState.MultiplayerCountdown]: "multiplayer-countdown",
  [GameState.Garage]: "garage",
  [GameState.Settings]: "settings",
  [GameState.Playing]: "hud",
  [GameState.Paused]: "pause-menu",
  [GameState.GameOver]: "game-over",
};

/**
 * Master UI controller — shows/hides HTML overlay screens,
 * wires button click handlers, and delegates to sub-UI modules.
 */
export class UIManager {
  private _screens: Map<ScreenId, HTMLElement> = new Map();
  private _currentScreen: ScreenId | null = null;

  // Button callbacks — set by Game.ts
  public onSettingsBack?: () => void;
  public onDifficultyChange?: (difficulty: string) => void;
  public onGraphicsQualityChange?: (quality: string) => void;
  public onMasterVolumeChange?: (value: number) => void;
  public onMusicVolumeChange?: (value: number) => void;
  public onSfxVolumeChange?: (value: number) => void;
  public onEngineVolumeChange?: (value: number) => void;
  public onPlay?: () => void;
  public onModeBack?: () => void;
  public onModeSelect?: (mode: string) => void;
  public onMultiplayer?: () => void;
  public onMultiplayerBack?: () => void;
  public onHostGame?: () => void;
  public onJoinGame?: () => void;
  public onQuickMatch?: () => void;
  public onLobbyBack?: () => void;
  public onLobbyReady?: () => void;
  public onLobbyDisconnect?: () => void;
  public onLobbyModeChange?: (mode: string) => void;
  public onLobbyCrashLimitChange?: (limit: number) => void;
  public onGarage?: () => void;
  public onSettings?: () => void;
  public onBiomeSelect?: (biome: string) => void;
  public onBiomeBack?: () => void;
  public onGarageBack?: () => void;
  public onSelectVehicle?: () => void;
  public onResume?: () => void;
  public onRestart?: () => void;
  public onQuit?: () => void;
  public onRetry?: () => void;
  public onToMenu?: () => void;

  constructor() {
    // Cache screen elements
    for (const id of SCREEN_IDS) {
      const el = document.getElementById(id);
      if (el) this._screens.set(id, el);
    }

    this._wireButtons();
  }

  /** Show the screen corresponding to a game state. */
  showState(state: GameState): void {
    const screenId = STATE_TO_SCREEN[state];
    this._showScreen(screenId);

    // Show HUD underneath pause/game-over
    if (state === GameState.Paused || state === GameState.GameOver) {
      this._screens.get("hud")?.classList.remove("hidden");
    }
  }

  /** Update a text element by query selector within #ui-root. */
  setText(selector: string, text: string): void {
    const el = document.querySelector(selector);
    if (el) el.textContent = text;
  }

  private _showScreen(id: ScreenId): void {
    for (const [screenId, el] of this._screens) {
      if (screenId === id) {
        el.classList.remove("hidden");
      } else {
        el.classList.add("hidden");
      }
    }
    this._currentScreen = id;
  }

  private _wireButtons(): void {
    this._btn("btn-play", () => this.onPlay?.());
    this._btn("btn-mode-back", () => this.onModeBack?.());
    this._btn("btn-multiplayer", () => this.onMultiplayer?.());
    this._btn("btn-garage", () => this.onGarage?.());
    this._btn("btn-settings", () => this.onSettings?.());
    this._btn("btn-mp-back", () => this.onMultiplayerBack?.());
    this._btn("btn-mp-host", () => this.onHostGame?.());
    this._btn("btn-mp-join", () => this.onJoinGame?.());
    this._btn("btn-mp-quick", () => this.onQuickMatch?.());
    this._btn("btn-mp-lobby-back", () => this.onLobbyBack?.());
    this._btn("btn-mp-ready", () => this.onLobbyReady?.());
    this._btn("btn-mp-disconnect", () => this.onLobbyDisconnect?.());
    this._btn("btn-biome-back", () => this.onBiomeBack?.());
    this._btn("btn-garage-back", () => this.onGarageBack?.());
    this._btn("btn-select-vehicle", () => this.onSelectVehicle?.());
    this._btn("btn-resume", () => this.onResume?.());
    this._btn("btn-restart", () => this.onRestart?.());
    this._btn("btn-quit", () => this.onQuit?.());
    this._btn("btn-retry", () => this.onRetry?.());
    this._btn("btn-to-menu", () => this.onToMenu?.());
    this._btn("btn-settings-back", () => this.onSettingsBack?.());

    // Biome cards
    document.querySelectorAll(".biome-card").forEach((card) => {
      card.addEventListener("click", () => {
        const biome = (card as HTMLElement).dataset.biome;
        if (biome) this.onBiomeSelect?.(biome);
      });
    });

    // Mode cards
    document.querySelectorAll(".mode-card").forEach((card) => {
      card.addEventListener("click", () => {
        const mode = (card as HTMLElement).dataset.mode;
        if (mode) this.onModeSelect?.(mode);
      });
    });

    const lobbyMode = document.getElementById("mp-lobby-mode") as HTMLSelectElement | null;
    if (lobbyMode) {
      lobbyMode.addEventListener("change", () => {
        this.onLobbyModeChange?.(lobbyMode.value);
      });
    }

    const crashLimit = document.getElementById("mp-crash-limit") as HTMLInputElement | null;
    if (crashLimit) {
      crashLimit.addEventListener("change", () => {
        const value = parseInt(crashLimit.value, 10);
        if (!Number.isNaN(value)) this.onLobbyCrashLimitChange?.(value);
      });
    }

    // Difficulty buttons
    document.querySelectorAll(".diff-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const diff = (btn as HTMLElement).dataset.difficulty;
        if (!diff) return;
        document.querySelectorAll(".diff-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this.onDifficultyChange?.(diff);
      });
    });

    // Graphics quality buttons
    document.querySelectorAll(".quality-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const quality = (btn as HTMLElement).dataset.quality;
        if (!quality) return;
        document.querySelectorAll(".quality-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this.onGraphicsQualityChange?.(quality);
      });
    });

    const master = document.getElementById("volume-master") as HTMLInputElement | null;
    if (master) {
      master.addEventListener("input", () => this.onMasterVolumeChange?.(parseFloat(master.value)));
    }

    const music = document.getElementById("volume-music") as HTMLInputElement | null;
    if (music) {
      music.addEventListener("input", () => this.onMusicVolumeChange?.(parseFloat(music.value)));
    }

    const sfx = document.getElementById("volume-sfx") as HTMLInputElement | null;
    if (sfx) {
      sfx.addEventListener("input", () => this.onSfxVolumeChange?.(parseFloat(sfx.value)));
    }

    const engine = document.getElementById("volume-engine") as HTMLInputElement | null;
    if (engine) {
      engine.addEventListener("input", () => this.onEngineVolumeChange?.(parseFloat(engine.value)));
    }
  }

  private _btn(id: string, handler: () => void): void {
    document.getElementById(id)?.addEventListener("click", handler);
  }
}
