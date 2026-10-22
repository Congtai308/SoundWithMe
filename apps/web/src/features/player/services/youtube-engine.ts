import { EngineEmitter, type EngineEvent, type EngineSource, type PlaybackEngine } from "./audio-engine";

/* Minimal typings for the YouTube IFrame Player API (https://developers.google.com/youtube/iframe_api_reference). */
export interface YouTubePlayer {
  cueVideoById(videoId: string): void;
  loadVideoById(videoId: string): void;
  isMuted(): boolean;
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  setPlaybackRate(rate: number): void;
  getPlaybackRate(): number;
  setVolume(volume: number): void;
  mute(): void;
  unMute(): void;
  destroy(): void;
  /** Undocumented module controls — present on real players, absent on stubs. */
  unloadModule?(module: string): void;
  setOption?(module: string, option: string, value: unknown): void;
}

interface YouTubePlayerOptions {
  host?: string;
  width?: string | number;
  height?: string | number;
  playerVars?: Record<string, string | number>;
  events?: {
    onReady?: () => void;
    onStateChange?: (event: { data: number }) => void;
    onError?: (event: { data: number }) => void;
  };
}

interface YouTubeNamespace {
  Player: new (element: HTMLElement, options: YouTubePlayerOptions) => YouTubePlayer;
}

declare global {
  interface Window {
    YT?: YouTubeNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const STATE = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } as const;
const AUTOPLAY_CHECK_MS = 2_000;
/** Keep waiting while YouTube is still buffering, up to this many checks. */
const AUTOPLAY_MAX_CHECKS = 5;
/** YouTube error 2 ("invalid parameter") is often transient; reload the video this many times first. */
const MAX_RELOADS = 1;
/** Safety net: re-read the player state this often in case an onStateChange was missed. */
const STATE_POLL_MS = 500;
const LOAD_TIMEOUT_MS = 10_000;

const ERROR_MESSAGES: Record<number, string> = {
  2: "Link YouTube không hợp lệ",
  5: "Video này không phát được trên trình duyệt",
  100: "Video đã bị xoá hoặc chuyển sang riêng tư",
  101: "Chủ video không cho phát ngoài YouTube",
  150: "Chủ video không cho phát ngoài YouTube",
};

let apiPromise: Promise<YouTubeNamespace> | null = null;

/** Loads https://www.youtube.com/iframe_api once per page. */
export function loadYouTubeApi(): Promise<YouTubeNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;

  apiPromise = new Promise<YouTubeNamespace>((resolve, reject) => {
    const previousCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousCallback?.();
      if (window.YT) resolve(window.YT);
      else reject(new Error("YouTube player API did not initialise"));
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => {
      apiPromise = null;
      reject(new Error("Không tải được trình phát YouTube — kiểm tra mạng hoặc trình chặn quảng cáo"));
    };
    document.head.appendChild(script);
  });
  return apiPromise;
}

/**
 * Plays YouTube videos through the official embedded player (the video stays
 * visible, as YouTube's terms require). The IFrame API accepts fine playback
 * rates (1.05 plays at 1.05×, measured), so small drift is closed by nudging
 * the rate; seeks re-buffer for a few hundred ms, so they're kept for big gaps.
 */
export class YouTubeEngine implements PlaybackEngine {
  readonly seekThresholdMs = 1_500;
  readonly expectedSeekLatencyMs = 800;
  private readonly emitter = new EngineEmitter();
  private readonly mount: HTMLDivElement;
  private player: YouTubePlayer | null = null;
  private readyPromise: Promise<YouTubePlayer> | null = null;
  private pendingCue: { resolve: () => void; reject: (error: Error) => void } | null = null;
  private autoplayTimer: number | null = null;
  private pollTimer: number | null = null;
  private lastState: number | null = null;
  private reportedDurationMs = 0;
  private videoId: string | null = null;
  private reloads = 0;
  private destroyed = false;
  private volume = 100;
  private muted = false;

  constructor(container: HTMLElement) {
    this.mount = document.createElement("div");
    this.mount.className = "h-full w-full";
    container.appendChild(this.mount);
  }

  async load(source: EngineSource): Promise<void> {
    if (source.kind !== "youtube") throw new Error("YouTubeEngine only plays YouTube sources");
    const player = await this.ensurePlayer();
    if (this.destroyed) return;

    await new Promise<void>((resolve, reject) => {
      this.pendingCue?.reject(new Error("Superseded by a newer track"));
      const timer = window.setTimeout(() => {
        this.pendingCue = null;
        reject(new Error("YouTube tải video quá lâu"));
      }, LOAD_TIMEOUT_MS);
      this.pendingCue = {
        resolve: () => {
          window.clearTimeout(timer);
          resolve();
        },
        reject: (error) => {
          window.clearTimeout(timer);
          reject(error);
        },
      };
      this.lastState = null;
      this.reportedDurationMs = 0;
      this.videoId = source.videoId;
      this.reloads = 0;
      player.cueVideoById(source.videoId);
    });
    this.emitter.emit({ type: "ready" });
  }

  play(): void {
    if (!this.player) return;
    this.player.playVideo();
    this.clearAutoplayTimer();
    // Muted playback is never blocked; a slow start then is just slow buffering.
    if (!this.muted) this.scheduleAutoplayCheck(1);
  }

  /**
   * Browsers silently refuse unmuted autoplay without a user gesture; the only
   * signal is that the player never reaches PLAYING. A blocked start often
   * goes UNSTARTED → BUFFERING → UNSTARTED, so BUFFERING alone isn't proof of
   * playback — keep checking until it either plays or settles somewhere else.
   */
  private scheduleAutoplayCheck(attempt: number): void {
    this.autoplayTimer = window.setTimeout(() => {
      this.autoplayTimer = null;
      const state = this.player?.getPlayerState();
      if (state === STATE.PLAYING) return;
      if (state === STATE.BUFFERING && attempt < AUTOPLAY_MAX_CHECKS) {
        this.scheduleAutoplayCheck(attempt + 1);
        return;
      }
      this.emitter.emit({ type: "buffering", buffering: false });
      this.emitter.emit({ type: "autoplay-blocked" });
    }, AUTOPLAY_CHECK_MS);
  }

  pause(): void {
    this.clearAutoplayTimer();
    this.player?.pauseVideo();
  }

  isPaused(): boolean {
    const state = this.player?.getPlayerState();
    return state !== STATE.PLAYING && state !== STATE.BUFFERING;
  }

  getPositionMs(): number {
    return (this.player?.getCurrentTime() ?? 0) * 1000;
  }

  getDurationMs(): number {
    return (this.player?.getDuration() ?? 0) * 1000;
  }

  seekMs(positionMs: number): void {
    this.player?.seekTo(Math.max(0, positionMs / 1000), true);
  }

  setRate(rate: number): void {
    if (this.player && this.player.getPlaybackRate() !== rate) this.player.setPlaybackRate(rate);
  }

  setVolume(volume: number): void {
    this.volume = volume;
    this.player?.setVolume(volume);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (!this.player) return;
    if (muted) this.player.mute();
    else this.player.unMute();
  }

  isMuted(): boolean {
    return this.player?.isMuted() ?? this.muted;
  }

  subscribe(listener: (event: EngineEvent) => void): () => void {
    return this.emitter.subscribe(listener);
  }

  destroy(): void {
    this.destroyed = true;
    this.clearAutoplayTimer();
    if (this.pollTimer !== null) window.clearInterval(this.pollTimer);
    this.pollTimer = null;
    this.pendingCue?.reject(new Error("Player closed"));
    this.pendingCue = null;
    this.emitter.clear();
    this.player?.destroy();
    this.player = null;
    this.mount.remove();
  }

  private ensurePlayer(): Promise<YouTubePlayer> {
    if (this.readyPromise) return this.readyPromise;

    this.readyPromise = loadYouTubeApi().then(
      (YT) =>
        new Promise<YouTubePlayer>((resolve) => {
          const player = new YT.Player(this.mount, {
            // Default host on purpose: with youtube-nocookie.com the IFrame API
            // stops delivering onStateChange after playback starts, which breaks
            // buffering/ended/duration tracking (observed while testing TASK-03).
            width: "100%",
            height: "100%",
            playerVars: {
              controls: 0, // the room's controls are authoritative
              disablekb: 1,
              rel: 0,
              playsinline: 1,
              iv_load_policy: 3,
              // The room shows its own synced lyrics; YouTube's captions would cover the video.
              cc_load_policy: 0,
              origin: window.location.origin,
            },
            events: {
              onReady: () => {
                this.player = player;
                // Dev-only handle for the lyrics sync benchmark.
                if (process.env.NODE_ENV !== "production") (window as unknown as { __swmYT?: YouTubePlayer }).__swmYT = player;
                player.setVolume(this.volume);
                if (this.muted) player.mute();
                this.pollTimer = window.setInterval(() => this.pollState(), STATE_POLL_MS);
                resolve(player);
              },
              onStateChange: ({ data }) => this.onStateChange(data),
              onError: ({ data }) => {
                if (data === 2 && this.videoId && this.reloads < MAX_RELOADS) {
                  // A pending load() keeps waiting for CUED; during playback the
                  // sync loop sees the player paused and seeks + plays again.
                  this.reloads += 1;
                  this.lastState = null;
                  player.cueVideoById(this.videoId);
                  return;
                }
                const message = ERROR_MESSAGES[data] ?? "YouTube không phát được video này";
                this.pendingCue?.reject(new Error(message));
                this.pendingCue = null;
                this.emitter.emit({ type: "error", message });
              },
            },
          });
        }),
    );
    return this.readyPromise;
  }

  /**
   * cc_load_policy=0 doesn't stop captions a channel turns on by default (or
   * a viewer's YouTube preference), so unload the captions module once
   * playback starts — it is only loaded by then.
   */
  private hideCaptions(): void {
    try {
      this.player?.setOption?.("captions", "track", {});
      this.player?.unloadModule?.("captions");
    } catch {
      // Unsupported on this player build: captions just stay as YouTube shows them.
    }
  }

  /** Delivers state changes the event stream may have dropped, and the duration once known. */
  private pollState(): void {
    const player = this.player;
    if (!player) return;
    const state = player.getPlayerState();
    if (state !== this.lastState) this.onStateChange(state);
    this.reportDurationIfKnown();
  }

  private reportDurationIfKnown(): void {
    const durationMs = this.getDurationMs();
    if (durationMs > 0 && durationMs !== this.reportedDurationMs) {
      this.reportedDurationMs = durationMs;
      this.emitter.emit({ type: "duration", durationMs });
    }
  }

  private onStateChange(state: number): void {
    if (state === this.lastState) return;
    this.lastState = state;
    switch (state) {
      case STATE.CUED:
        this.pendingCue?.resolve();
        this.pendingCue = null;
        break;
      case STATE.PLAYING:
        this.hideCaptions();
        this.clearAutoplayTimer();
        this.reportDurationIfKnown();
        this.emitter.emit({ type: "buffering", buffering: false });
        this.emitter.emit({ type: "playing" });
        break;
      case STATE.BUFFERING:
        this.emitter.emit({ type: "buffering", buffering: true });
        break;
      case STATE.PAUSED:
        this.emitter.emit({ type: "paused" });
        break;
      case STATE.ENDED:
        this.emitter.emit({ type: "ended" });
        break;
      case STATE.UNSTARTED:
        // A refused or aborted start drops back here from BUFFERING.
        this.emitter.emit({ type: "buffering", buffering: false });
        break;
      default:
        break;
    }
  }

  private clearAutoplayTimer(): void {
    if (this.autoplayTimer !== null) {
      window.clearTimeout(this.autoplayTimer);
      this.autoplayTimer = null;
    }
  }
}
