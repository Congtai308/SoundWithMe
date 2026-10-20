/**
 * A playback engine is whatever actually makes sound on this device: a plain
 * HTML <audio> element for CDN-hosted files, or a provider's embedded player
 * (YouTube). The sync hook drives every engine through this one interface.
 */
export type EngineSource =
  | { kind: "url"; url: string }
  | { kind: "youtube"; videoId: string };

export type EngineEvent =
  | { type: "ready" }
  | { type: "playing" }
  | { type: "paused" }
  | { type: "buffering"; buffering: boolean }
  | { type: "ended" }
  | { type: "duration"; durationMs: number }
  /** The browser refused to start audio without a user gesture. */
  | { type: "autoplay-blocked" }
  | { type: "error"; message: string };

export interface PlaybackEngine {
  /** Drift above this is fixed by seeking; below it by nudging the playback rate. */
  readonly seekThresholdMs: number;
  /** First guess at how long a seek takes before sound resumes; the sync hook refines it. */
  readonly expectedSeekLatencyMs: number;
  /** Loads a source paused at 0. Resolves when it can accept play/seek. */
  load(source: EngineSource): Promise<void>;
  play(): void;
  pause(): void;
  isPaused(): boolean;
  getPositionMs(): number;
  getDurationMs(): number;
  seekMs(positionMs: number): void;
  setRate(rate: number): void;
  setVolume(volume: number): void;
  setMuted(muted: boolean): void;
  /** Actual mute state; a browser may keep a player muted after setMuted(false). */
  isMuted(): boolean;
  subscribe(listener: (event: EngineEvent) => void): () => void;
  destroy(): void;
}

/** Shared listener bookkeeping for engine implementations. */
export class EngineEmitter {
  private readonly listeners = new Set<(event: EngineEvent) => void>();

  subscribe(listener: (event: EngineEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: EngineEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  clear(): void {
    this.listeners.clear();
  }
}

/**
 * HTML5 <audio> engine for files served from object storage/CDN via range
 * requests — never proxied through the API. Supports fine playback rates, so
 * drift is corrected smoothly (pitch is preserved by the browser).
 */
export class HtmlAudioEngine implements PlaybackEngine {
  readonly seekThresholdMs = 250;
  readonly expectedSeekLatencyMs = 50;
  private readonly audio = new Audio();
  private readonly emitter = new EngineEmitter();
  private readonly detach: () => void;

  constructor() {
    this.audio.preload = "auto";
    this.audio.preservesPitch = true;

    const handlers: [keyof HTMLMediaElementEventMap, () => void][] = [
      ["playing", () => this.emitter.emit({ type: "playing" })],
      ["pause", () => this.emitter.emit({ type: "paused" })],
      ["waiting", () => this.emitter.emit({ type: "buffering", buffering: true })],
      ["canplay", () => this.emitter.emit({ type: "buffering", buffering: false })],
      ["ended", () => this.emitter.emit({ type: "ended" })],
      ["durationchange", () => this.emitter.emit({ type: "duration", durationMs: this.getDurationMs() })],
      ["error", () => this.emitter.emit({ type: "error", message: "This track could not be loaded" })],
    ];
    for (const [event, handler] of handlers) this.audio.addEventListener(event, handler);
    this.detach = () => {
      for (const [event, handler] of handlers) this.audio.removeEventListener(event, handler);
    };
  }

  async load(source: EngineSource): Promise<void> {
    if (source.kind !== "url") throw new Error("HtmlAudioEngine only plays URL sources");
    this.audio.src = source.url;
    this.audio.currentTime = 0;
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        this.audio.removeEventListener("loadedmetadata", onReady);
        this.audio.removeEventListener("error", onError);
      };
      const onReady = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error("This track could not be loaded"));
      };
      this.audio.addEventListener("loadedmetadata", onReady);
      this.audio.addEventListener("error", onError);
      this.audio.load();
    });
    this.emitter.emit({ type: "ready" });
  }

  play(): void {
    this.audio.play().catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "NotAllowedError") {
        this.emitter.emit({ type: "autoplay-blocked" });
      } else {
        this.emitter.emit({ type: "error", message: "Playback failed to start" });
      }
    });
  }

  pause(): void {
    this.audio.pause();
  }

  isPaused(): boolean {
    return this.audio.paused;
  }

  getPositionMs(): number {
    return this.audio.currentTime * 1000;
  }

  getDurationMs(): number {
    return Number.isFinite(this.audio.duration) ? this.audio.duration * 1000 : 0;
  }

  seekMs(positionMs: number): void {
    this.audio.currentTime = Math.max(0, positionMs / 1000);
  }

  setRate(rate: number): void {
    if (this.audio.playbackRate !== rate) this.audio.playbackRate = rate;
  }

  setVolume(volume: number): void {
    this.audio.volume = Math.min(1, Math.max(0, volume / 100));
  }

  setMuted(muted: boolean): void {
    this.audio.muted = muted;
  }

  isMuted(): boolean {
    return this.audio.muted;
  }

  subscribe(listener: (event: EngineEvent) => void): () => void {
    return this.emitter.subscribe(listener);
  }

  destroy(): void {
    this.detach();
    this.emitter.clear();
    this.audio.pause();
    this.audio.removeAttribute("src");
    this.audio.load();
  }
}
