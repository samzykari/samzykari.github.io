import { BiomeType, PowerUpType } from "../types";

export type NetworkRole = "host" | "client" | "none";

export interface RemotePlayerState {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; w?: number };
  speed: number;
  powerUp: { active: PowerUpType | null };
}

export interface LocalPlayerState extends RemotePlayerState {}

export interface RemotePlayerInfo {
  vehicleId: string;
  visuals: {
    paintColor: string;
    underglowColor: string;
    underglowEnabled: boolean;
    exhaustFlamesEnabled: boolean;
  };
}

export interface TrafficSpawnPayload {
  lane: number;
  zOffset: number;
  speed: number;
  color: string;
  modelName: string;
  scale: number;
}

export interface StartPayload {
  biome: BiomeType;
  mode: string;
}

export interface LobbyPayload {
  mode: string;
  crashLimit: number;
}

export interface ReadyPayload {
  ready: boolean;
}

export interface CountdownPayload {
  seconds: number;
}

export interface CrashPayload {
  crashes: number;
}

export interface MatchEndPayload {
  result: "win" | "loss" | "draw";
  reason: string;
}

interface NetMessage<T = unknown> {
  type:
    | "state"
    | "trafficSpawn"
    | "start"
    | "playerInfo"
    | "lobby"
    | "ready"
    | "countdown"
    | "crash"
    | "matchEnd"
    | "status";
  payload: T;
}

type PeerLike = {
  on: (event: string, cb: (...args: any[]) => void) => void;
  connect: (peerId: string, options?: Record<string, unknown>) => DataConnectionLike;
  destroy: () => void;
};

type DataConnectionLike = {
  on: (event: string, cb: (...args: any[]) => void) => void;
  send: (data: unknown) => void;
  open: boolean;
  close: () => void;
};

declare const Peer: new (id?: string, options?: Record<string, unknown>) => PeerLike;

export class NetworkManager {
  private _peer: PeerLike | null = null;
  private _conn: DataConnectionLike | null = null;
  private _role: NetworkRole = "none";
  private _tickHandle: number | null = null;
  private _tickRate = 20;
  private _stateProvider: (() => LocalPlayerState | null) | null = null;

  public onHostId?: (id: string) => void;
  public onConnected?: (role: NetworkRole) => void;
  public onDisconnected?: () => void;
  public onRemoteState?: (state: RemotePlayerState) => void;
  public onRemoteInfo?: (info: RemotePlayerInfo) => void;
  public onStart?: (payload: StartPayload) => void;
  public onTrafficSpawn?: (payload: TrafficSpawnPayload) => void;
  public onLobbyUpdate?: (payload: LobbyPayload) => void;
  public onReadyUpdate?: (payload: ReadyPayload) => void;
  public onCountdown?: (payload: CountdownPayload) => void;
  public onCrash?: (payload: CrashPayload) => void;
  public onMatchEnd?: (payload: MatchEndPayload) => void;
  public onStatus?: (text: string) => void;
  public onError?: (text: string) => void;

  get role(): NetworkRole {
    return this._role;
  }

  get isConnected(): boolean {
    return !!this._conn?.open;
  }

  setTickRate(hz: number): void {
    this._tickRate = Math.max(5, Math.min(60, hz));
    if (this._tickHandle !== null) {
      this._stopTick();
      this._startTick();
    }
  }

  setLocalStateProvider(provider: () => LocalPlayerState | null): void {
    this._stateProvider = provider;
  }

  host(): void {
    this.disconnect();
    this._role = "host";
    const id = this._generateId();
    this._createPeer(id);
  }

  join(hostId: string): void {
    this.disconnect();
    this._role = "client";
    this._peer = new Peer(undefined, this._peerOptions());
    this._peer.on("open", () => {
      this._status(`Connecting to ${hostId}...`);
      const conn = this._peer?.connect(hostId, { reliable: true });
      if (!conn) return;
      this._conn = conn;
      this._wireConnection();
    });
    this._peer.on("error", (err: { type?: string; message?: string }) => {
      this._error(err.message ?? "Peer error");
    });
  }

  disconnect(): void {
    this._stopTick();
    if (this._conn) {
      this._conn.close();
      this._conn = null;
    }
    if (this._peer) {
      this._peer.destroy();
      this._peer = null;
    }
    this._role = "none";
    this.onDisconnected?.();
  }

  sendPlayerInfo(info: RemotePlayerInfo): void {
    this._send({ type: "playerInfo", payload: info } as NetMessage<RemotePlayerInfo>);
  }

  sendStart(payload: StartPayload): void {
    this._send({ type: "start", payload } as NetMessage<StartPayload>);
  }

  sendTrafficSpawn(payload: TrafficSpawnPayload): void {
    this._send({ type: "trafficSpawn", payload } as NetMessage<TrafficSpawnPayload>);
  }

  sendLobbyUpdate(payload: LobbyPayload): void {
    this._send({ type: "lobby", payload } as NetMessage<LobbyPayload>);
  }

  sendReady(payload: ReadyPayload): void {
    this._send({ type: "ready", payload } as NetMessage<ReadyPayload>);
  }

  sendCountdown(payload: CountdownPayload): void {
    this._send({ type: "countdown", payload } as NetMessage<CountdownPayload>);
  }

  sendCrash(payload: CrashPayload): void {
    this._send({ type: "crash", payload } as NetMessage<CrashPayload>);
  }

  sendMatchEnd(payload: MatchEndPayload): void {
    this._send({ type: "matchEnd", payload } as NetMessage<MatchEndPayload>);
  }

  // ─────────────── Private ───────────────

  private _createPeer(id: string): void {
    this._peer = new Peer(id, this._peerOptions());
    this._peer.on("open", (openId: string) => {
      this._status(`Hosting as ${openId}`);
      this.onHostId?.(openId);
    });
    this._peer.on("connection", (conn: DataConnectionLike) => {
      this._conn = conn;
      this._wireConnection();
    });
    this._peer.on("error", (err: { type?: string; message?: string }) => {
      if (err.type === "unavailable-id") {
        const retryId = this._generateId();
        this._status(`ID in use, retrying as ${retryId}`);
        this._peer?.destroy();
        this._peer = null;
        this._createPeer(retryId);
        return;
      }
      this._error(err.message ?? "Peer error");
    });
  }

  private _wireConnection(): void {
    if (!this._conn) return;
    this._conn.on("open", () => {
      this._status("Connected");
      this.onConnected?.(this._role);
      this._startTick();
    });
    this._conn.on("data", (data: NetMessage) => {
      this._handleMessage(data);
    });
    this._conn.on("close", () => {
      this._status("Disconnected");
      this.disconnect();
    });
  }

  private _handleMessage(msg: NetMessage): void {
    if (!msg || typeof msg !== "object") return;
    switch (msg.type) {
      case "state":
        this.onRemoteState?.(msg.payload as RemotePlayerState);
        break;
      case "trafficSpawn":
        this.onTrafficSpawn?.(msg.payload as TrafficSpawnPayload);
        break;
      case "start":
        this.onStart?.(msg.payload as StartPayload);
        break;
      case "playerInfo":
        this.onRemoteInfo?.(msg.payload as RemotePlayerInfo);
        break;
      case "lobby":
        this.onLobbyUpdate?.(msg.payload as LobbyPayload);
        break;
      case "ready":
        this.onReadyUpdate?.(msg.payload as ReadyPayload);
        break;
      case "countdown":
        this.onCountdown?.(msg.payload as CountdownPayload);
        break;
      case "crash":
        this.onCrash?.(msg.payload as CrashPayload);
        break;
      case "matchEnd":
        this.onMatchEnd?.(msg.payload as MatchEndPayload);
        break;
    }
  }

  private _startTick(): void {
    if (this._tickHandle !== null) return;
    const interval = Math.round(1000 / this._tickRate);
    this._tickHandle = window.setInterval(() => {
      if (!this._conn?.open || !this._stateProvider) return;
      const state = this._stateProvider();
      if (!state) return;
      this._send({ type: "state", payload: state } as NetMessage<LocalPlayerState>);
    }, interval);
  }

  private _stopTick(): void {
    if (this._tickHandle !== null) {
      window.clearInterval(this._tickHandle);
      this._tickHandle = null;
    }
  }

  private _send(msg: NetMessage): void {
    if (!this._conn?.open) return;
    this._conn.send(msg);
  }

  private _peerOptions(): Record<string, unknown> {
    return {
      config: {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
          { urls: "stun:stun2.l.google.com:19302" },
        ],
      },
    };
  }

  private _generateId(): string {
    const chars = "abcdefghijklmnopqrstuvwxyz";
    let id = "";
    for (let i = 0; i < 5; i++) {
      id += chars[Math.floor(Math.random() * chars.length)];
    }
    return id;
  }

  private _status(text: string): void {
    this.onStatus?.(text);
  }

  private _error(text: string): void {
    this.onError?.(text);
  }
}
