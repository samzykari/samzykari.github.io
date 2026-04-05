import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { Sound } from "@babylonjs/core/Audio/sound";
import { AudioEngine } from "@babylonjs/core/Audio/audioEngine";
import "@babylonjs/core/Audio/audioSceneComponent";

export type EngineType = "standard" | "aggressive";

export interface VolumeSettings {
  master: number;
  music: number;
  sfx: number;
  engine: number;
}

const STORAGE_KEY = "nolaws_audio";

const DEFAULT_VOLUMES: VolumeSettings = {
  master: 0.8,
  music: 0.6,
  sfx: 0.8,
  engine: 1.0,
};

const NICK_COOLDOWN_MS = 500;

export class AudioManager {
  private _scene: Scene;
  private _unlocked = false;
  private _volumes: VolumeSettings = { ...DEFAULT_VOLUMES };

  private _baseUrl = "";
  private _startMusicOnReady = false;
  private _startEngineOnReady = false;

  private _htmlMusic: HTMLAudioElement[] = [];
  private _htmlSfx: Record<string, HTMLAudioElement> = {};
  private _htmlEngineStandard: HTMLAudioElement | null = null;
  private _htmlEngineAggressive: HTMLAudioElement | null = null;
  private _activeHtmlEngine: HTMLAudioElement | null = null;

  private _musicTracks: Sound[] = [];
  private _sfx: Record<string, Sound> = {};
  private _engineStandard: Sound | null = null;
  private _engineAggressive: Sound | null = null;
  private _activeEngine: Sound | null = null;
  private _activeEngineType: EngineType = "standard";
  private _lastEngineSpeed = 0;
  private _lastEngineUpdate = 0;

  private _lastNickAt = 0;
  private _celebrationPlayed = false;

  constructor(scene: Scene) {
    this._scene = scene;
    this._volumes = this._loadVolumes();
    (window as any).__audioState = () => ({
      unlocked: this._unlocked,
      canUseWebAudio: Engine.audioEngine?.canUseWebAudio ?? null,
      contextState: Engine.audioEngine?.audioContext?.state ?? null,
    });
  }

  get unlocked(): boolean {
    return this._unlocked;
  }

  get volumes(): VolumeSettings {
    return { ...this._volumes };
  }

  unlock(): void {
    if (this._unlocked) return;
    this._unlocked = true;
    if (!Engine.audioEngine) {
      // Ensure audio engine exists in tree-shaken builds
      Engine.audioEngine = new AudioEngine(document.body);
    }
    // Force audio context initialization before unlock
    const ctx = Engine.audioEngine.audioContext;
    Engine.audioEngine.useCustomUnlockedButton = true;
    Engine.audioEngine?.unlock();
    ctx?.resume().catch(() => {
      // ignore
    });
    Engine.audioEngine?.setGlobalVolume(this._volumes.master);
    console.log("[Audio] unlock", {
      unlocked: Engine.audioEngine?.unlocked,
      canUseWebAudio: Engine.audioEngine?.canUseWebAudio,
      contextState: Engine.audioEngine?.audioContext?.state,
    });
    this._baseUrl = `${import.meta.env.BASE_URL}sounds/`;
    this._initHtmlAudio();
    this._startMusicOnReady = true;
    this._startEngineOnReady = false;
    void this._initSoundsAsync();
    this._applyVolumes();
    window.setTimeout(() => {
      this.playRandomMusic();
    }, 500);
  }

  setVolumes(volumes: Partial<VolumeSettings>): void {
    this._volumes = { ...this._volumes, ...volumes };
    this._saveVolumes(this._volumes);
    this._applyVolumes();
  }

  setCelebrationPlayed(played: boolean): void {
    this._celebrationPlayed = played;
  }

  setEngineType(type: EngineType): void {
    this._activeEngineType = type;
    if (!this._unlocked) return;
    this._startEngineLoop();
  }

  startEngine(): void {
    if (!this._unlocked) return;
    this._startEngineLoop();
  }

  stopEngine(): void {
    if (this._activeEngine) this._activeEngine.stop();
    if (this._engineStandard) this._engineStandard.stop();
    if (this._engineAggressive) this._engineAggressive.stop();
    if (this._activeHtmlEngine) this._activeHtmlEngine.pause();
    if (this._htmlEngineStandard) this._htmlEngineStandard.pause();
    if (this._htmlEngineAggressive) this._htmlEngineAggressive.pause();
  }

  updateEngineSound(currentSpeed: number, maxSpeed: number): void {
    if (!this._unlocked) return;
    const safeMax = Math.max(1, maxSpeed);
    const speedRatio = Math.max(0, Math.min(1, currentSpeed / safeMax));

    const now = performance.now();
    const dt = this._lastEngineUpdate > 0 ? Math.max(0.016, (now - this._lastEngineUpdate) / 1000) : 0.016;
    const accel = (currentSpeed - this._lastEngineSpeed) / dt;
    const accelRatio = Math.max(0, Math.min(1, accel / safeMax));

    const baseRate = 0.9 + speedRatio * 1.1;
    const accelBoost = accelRatio * 0.45;
    const rate = Math.max(0.8, Math.min(2.2, baseRate + accelBoost));
    const engineVolume = (0.45 + speedRatio * 0.55) * this._volumes.engine * this._volumes.master;

    if (this._activeEngine) {
      this._activeEngine.setPlaybackRate(rate);
      this._activeEngine.setVolume(engineVolume);
      if (!this._activeEngine.isPlaying) this._activeEngine.play();
    }

    if (this._activeHtmlEngine) {
      this._activeHtmlEngine.volume = Math.min(1, engineVolume);
      this._activeHtmlEngine.playbackRate = rate;
      if (this._activeHtmlEngine.paused) {
        this._activeHtmlEngine.play().catch(() => {
          // ignore
        });
      }
    }

    this._lastEngineSpeed = currentSpeed;
    this._lastEngineUpdate = now;
  }

  playNick(): void {
    if (!this._unlocked) return;
    const now = performance.now();
    if (now - this._lastNickAt < NICK_COOLDOWN_MS) return;
    this._lastNickAt = now;
    this._play("nick");
  }

  playCrash(): void {
    if (!this._unlocked) return;
    this._play("crash");
  }

  playLose(): void {
    if (!this._unlocked) return;
    this._play("lose");
  }

  playCrashLose(): void {
    if (!this._unlocked) return;
    this.playCrash();
    this.playLose();
  }

  playCelebration(): void {
    if (!this._unlocked || this._celebrationPlayed) return;
    this._celebrationPlayed = true;
    this._play("celebration");
  }

  playNitro(): void {
    if (!this._unlocked) return;
    this._play("nitro");
  }

  playGhost(): void {
    if (!this._unlocked) return;
    this._play("ghost");
  }

  playScreech(): void {
    if (!this._unlocked) return;
    this._play("screech");
  }

  // ─────────────── Internal ───────────────

  private async _initSoundsAsync(): Promise<void> {
    this._scene.audioEnabled = true;
    const base = this._baseUrl;

    try {
      const music = await Promise.all([
        this._loadSound("music_1", `${base}background1.mp3`, { loop: true, autoplay: false }),
        this._loadSound("music_2", `${base}background2.mp3`, { loop: true, autoplay: false }),
        this._loadSound("music_3", `${base}background3.mp3`, { loop: true, autoplay: false }),
        this._loadSound("music_4", `${base}background4.mp3`, { loop: true, autoplay: false }),
      ]);
      this._musicTracks = music;

      this._sfx = {
        crash: await this._loadSound("sfx_crash", `${base}crash.mp3`, { loop: false, autoplay: false }),
        lose: await this._loadSound("sfx_lose", `${base}lose.mp3`, { loop: false, autoplay: false }),
        celebration: await this._loadSound("sfx_celebration", `${base}celebration.mp3`, { loop: false, autoplay: false }),
        nitro: await this._loadSound("sfx_nitro", `${base}nitro.mp3`, { loop: false, autoplay: false }),
        ghost: await this._loadSound("sfx_ghost", `${base}ghost-powerup.mp3`, { loop: false, autoplay: false }),
        nick: await this._loadSound("sfx_nick", `${base}nick.mp3`, { loop: false, autoplay: false }),
        screech: await this._loadSound("sfx_screech", `${base}screech.mp3`, { loop: false, autoplay: false }),
      };

      this._engineStandard = await this._loadSound("engine_standard", `${base}engine-loop.mp3`, {
        loop: true,
        autoplay: false,
      });

      this._engineAggressive = await this._loadSound("engine_aggressive", `${base}engine-loop1.mp3`, {
        loop: true,
        autoplay: false,
      });

      this._activeEngine = this._activeEngineType === "aggressive" ? this._engineAggressive : this._engineStandard;

      if (this._startMusicOnReady) this.playRandomMusic();
      if (this._startEngineOnReady) this._startEngineLoop();
    } catch (err) {
      console.warn("[Audio] failed to load sounds", err);
    }
  }

  private _initHtmlAudio(): void {
    if (this._htmlMusic.length > 0) return;
    const base = this._baseUrl;
    this._htmlMusic = [
      new Audio(`${base}background1.mp3`),
      new Audio(`${base}background2.mp3`),
      new Audio(`${base}background3.mp3`),
      new Audio(`${base}background4.mp3`),
    ];
    for (const track of this._htmlMusic) {
      track.loop = true;
      track.preload = "auto";
    }

    this._htmlSfx = {
      crash: new Audio(`${base}crash.mp3`),
      lose: new Audio(`${base}lose.mp3`),
      celebration: new Audio(`${base}celebration.mp3`),
      nitro: new Audio(`${base}nitro.mp3`),
      ghost: new Audio(`${base}ghost-powerup.mp3`),
      nick: new Audio(`${base}nick.mp3`),
      screech: new Audio(`${base}screech.mp3`),
    };
    for (const key of Object.keys(this._htmlSfx)) {
      this._htmlSfx[key].preload = "auto";
    }

    this._htmlEngineStandard = new Audio(`${base}engine-loop.mp3`);
    this._htmlEngineAggressive = new Audio(`${base}engine-loop1.mp3`);
    if (this._htmlEngineStandard) {
      this._htmlEngineStandard.loop = true;
      this._htmlEngineStandard.preload = "auto";
    }
    if (this._htmlEngineAggressive) {
      this._htmlEngineAggressive.loop = true;
      this._htmlEngineAggressive.preload = "auto";
    }

    this._activeHtmlEngine = this._activeEngineType === "aggressive"
      ? this._htmlEngineAggressive
      : this._htmlEngineStandard;

    this._applyHtmlVolumes();
  }

  private _applyHtmlVolumes(): void {
    const master = this._volumes.master;
    for (const track of this._htmlMusic) {
      track.volume = Math.min(1, this._volumes.music * master);
    }
    for (const key of Object.keys(this._htmlSfx)) {
      this._htmlSfx[key].volume = Math.min(1, this._volumes.sfx * master);
    }
    if (this._activeHtmlEngine) {
      this._activeHtmlEngine.volume = Math.min(1, this._volumes.engine * master);
    }
  }

  private _applyVolumes(): void {
    if (!this._unlocked) return;
    Engine.audioEngine?.setGlobalVolume(this._volumes.master);
    this._applyHtmlVolumes();

    for (const track of this._musicTracks) {
      track.setVolume(Math.min(1, this._volumes.music));
    }

    for (const key of Object.keys(this._sfx)) {
      const sound = this._sfx[key];
      sound.setVolume(Math.min(1, this._volumes.sfx));
    }

    if (this._activeEngine) {
      this._activeEngine.setVolume(Math.min(1, this._volumes.engine));
    }
  }

  private _startEngineLoop(): void {
    const target = this._activeEngineType === "aggressive" ? this._engineAggressive : this._engineStandard;
    if (!target) return;

    if (this._activeEngine && this._activeEngine !== target) {
      this._activeEngine.stop();
    }
    this._activeEngine = target;

    if (!this._activeEngine.isPlaying) this._activeEngine.play();
    const htmlTarget = this._activeEngineType === "aggressive" ? this._htmlEngineAggressive : this._htmlEngineStandard;
    if (htmlTarget) {
      if (this._activeHtmlEngine && this._activeHtmlEngine !== htmlTarget) {
        this._activeHtmlEngine.pause();
      }
      this._activeHtmlEngine = htmlTarget;
      if (this._activeHtmlEngine.paused) {
        this._activeHtmlEngine.play().catch(() => {
          // ignore
        });
      }
    }
  }

  private _play(key: string): void {
    const sound = this._sfx[key];
    if (!sound) return;
    sound.play();
    const html = this._htmlSfx[key];
    if (html) {
      html.currentTime = 0;
      html.play().catch(() => {
        // ignore
      });
    }
  }

  private playRandomMusic(): void {
    if (this._musicTracks.length === 0) return;
    const track = this._musicTracks[Math.floor(Math.random() * this._musicTracks.length)];
    if (!track.isPlaying) track.play();
    if (this._htmlMusic.length > 0) {
      for (const audio of this._htmlMusic) {
        audio.pause();
        audio.currentTime = 0;
      }
      const htmlTrack = this._htmlMusic[Math.floor(Math.random() * this._htmlMusic.length)];
      htmlTrack.play().catch(() => {
        // ignore
      });
    }
  }

  private async _loadSound(
    name: string,
    url: string,
    options: { loop: boolean; autoplay: boolean }
  ): Promise<Sound> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${name} ${res.status}`);
    const buffer = await res.arrayBuffer();
    return new Sound(name, buffer, this._scene, undefined, options);
  }

  private _loadVolumes(): VolumeSettings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULT_VOLUMES };
      const parsed = JSON.parse(raw) as Partial<VolumeSettings>;
      return { ...DEFAULT_VOLUMES, ...parsed };
    } catch {
      return { ...DEFAULT_VOLUMES };
    }
  }

  private _saveVolumes(volumes: VolumeSettings): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(volumes));
    } catch {
      // ignore
    }
  }
}
