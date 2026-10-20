"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";
import type { TrackWithArtist } from "@soundwithme/types";
import type { EngineEvent, EngineSource, PlaybackEngine } from "../services/audio-engine";
import { HtmlAudioEngine } from "../services/audio-engine";
import { YouTubeEngine } from "../services/youtube-engine";
import { decideCorrection, SOFT_CORRECTION_MS, targetPositionMs } from "../services/drift";
import { isServerClockSettled, syncServerClock } from "../services/server-clock";
import { listenNow } from "../services/listen-delay";
import { usePlayerStore } from "../stores/player-store";
import { setLivePositionReader } from "../services/live-position";

/** architecture.md §3.4: compare against the room every 2 s. */
const SYNC_INTERVAL_MS = 2_000;
const UI_TICK_MS = 250;
/** Catch-up ends (and sound comes on) once the player is this close to the room. */
const CATCH_UP_TOLERANCE_MS = 150;
/** Re-aims allowed per catch-up before settling for rate nudges. */
const CATCH_UP_MAX_SEEKS = 3;
/** Let playback run briefly before measuring: positions right after PLAYING are stale. */
const CATCH_UP_SETTLE_MS = 350;
const CATCH_UP_POLL_MS = 250;
/** Gap between the two in-tolerance readings required before un-muting. */
const CATCH_UP_CONFIRM_MS = 400;
/** Give a start this long to reach PLAYING before trying again. */
const START_TIMEOUT_MS = 8_000;
/** After un-muting, check the browser didn't pause us for lack of a user gesture. */
const UNMUTE_VERIFY_MS = 800;
/** After a "tap to listen", give a (re)start this long to show the browser accepted it. */
const UNLOCK_VERIFY_MS = 2_500;
/** Sound refused again this soon after a "tap to listen": that tap can't unlock this browser. */
const UNLOCK_REFUSED_WINDOW_MS = 20_000;
const MAX_LEAD_MS = 5_000;
/** First guess for a seek inside the buffered stretch of a playing video. */
const WARM_SEEK_LEAD_MS = 50;

type EngineKind = "youtube" | "url";

/** The user's volume, lowered while karaoke voices play over the music. */
function effectiveVolume({ volume, duckScale }: { volume: number; duckScale: number }): number {
  return Math.round(volume * duckScale);
}

const MAX_TRACE_LINES = 300;

/** Dev-only counters read by the sync benchmark (window.__swmSync). */
interface SyncDebug {
  seeks: number;
  firstPlayingAt: number | null;
  /** When sound first came on, in sync. */
  audibleAt: number | null;
  /** "<ms since page start> <what happened>" — the join timeline. */
  log: string[];
  snapshot: () => {
    localMs: number;
    targetMs: number;
    driftMs: number;
    buffering: boolean;
    muted: boolean;
    engineMuted: boolean;
    paused: boolean;
  } | null;
}

function sourceFor(track: TrackWithArtist): EngineSource | null {
  if (track.playbackSource === "youtube-embed") return { kind: "youtube", videoId: track.providerTrackId };
  // range-request / hls sources need a signed CDN URL; the catalog doesn't issue those yet.
  return null;
}

interface AudioSyncOptions {
  /** Where the embedded (YouTube) player is mounted. */
  containerRef: RefObject<HTMLElement | null>;
  /** Catalog details for the room's current track (from React Query). */
  track: TrackWithArtist | undefined;
  /** Called once per playback version when the local player reaches the end. */
  onTrackEnded: (fromVersion: number) => void;
}

/**
 * Keeps this device's player locked to the room (TASK-03). The server state
 * in the player store is the source of truth; this hook loads the right
 * track, follows play/pause, and continuously closes the gap between the
 * local position and the room's target position (architecture.md §3.3–3.4).
 *
 * Joining mid-song uses a *silent catch-up*: the player starts muted, aimed
 * ahead of the room by the expected seek latency, re-aims (still muted) until
 * it lands within ±150 ms, and only then un-mutes — so a late joiner never
 * hears the jumps. Afterwards small drift is closed by nudging the playback
 * rate (inaudible), and only large gaps trigger another silent catch-up.
 */
export function useAudioSync({ containerRef, track, onTrackEnded }: AudioSyncOptions): { unlock: () => void } {
  const engineRef = useRef<PlaybackEngine | null>(null);
  const engineKindRef = useRef<EngineKind | null>(null);
  const loadedTrackIdRef = useRef<string | null>(null);
  const unsubscribeEngineRef = useRef<(() => void) | null>(null);
  const nudgeTimerRef = useRef<number | null>(null);
  const endedVersionRef = useRef(0);
  const onTrackEndedRef = useRef(onTrackEnded);
  onTrackEndedRef.current = onTrackEnded;

  /** When play() was issued and PLAYING hasn't been seen yet. */
  const startPendingSinceRef = useRef<number | null>(null);
  /** `confirmed`: one in-tolerance reading seen; un-mute only if the next one agrees. */
  const catchUpRef = useRef({ active: false, seeks: 0, confirmed: false });
  /** Whether the loaded track has played at all (later seeks hit the buffer). */
  const hasPlayedRef = useRef(false);
  const catchUpTimerRef = useRef<number | null>(null);
  /**
   * How far ahead of the room to aim a seek, learned from each landing. A seek
   * from a stopped player (cold) re-buffers from the network; one inside the
   * already-buffered stretch of a playing video (warm) resumes almost at once.
   */
  const leadMsRef = useRef({ cold: 0, warm: 0 });
  const lastAimRef = useRef<"cold" | "warm">("cold");
  const clockWaitRef = useRef(false);

  const debugRef = useRef<SyncDebug>({ seeks: 0, firstPlayingAt: null, audibleAt: null, log: [], snapshot: () => null });
  const trace = useCallback((event: string) => {
    if (process.env.NODE_ENV === "production") return;
    const { log } = debugRef.current;
    log.push(`${Math.round(performance.now())} ${event}`);
    if (log.length > MAX_TRACE_LINES) log.splice(0, log.length - MAX_TRACE_LINES);
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    debugRef.current.snapshot = () => {
      const engine = engineRef.current;
      const state = usePlayerStore.getState().serverState;
      if (!engine || !state) return null;
      const targetMs = targetPositionMs(state, listenNow());
      const localMs = engine.getPositionMs();
      return {
        localMs,
        targetMs,
        driftMs: localMs - targetMs,
        buffering: usePlayerStore.getState().isBuffering,
        muted: catchUpRef.current.active,
        engineMuted: engine.isMuted(),
        paused: engine.isPaused(),
      };
    };
    (window as unknown as { __swmSync?: SyncDebug }).__swmSync = debugRef.current;
    trace("sync hook mounted");
  }, [trace]);

  /** When the user last tapped "tap to listen", to tell whether that tap worked. */
  const lastUnlockAtRef = useRef<number | null>(null);
  /** Set below (it needs callbacks defined later); see waitForVideoTap. */
  const waitForVideoTapRef = useRef<() => void>(() => undefined);
  /** True (and handled) when sound was refused right after a "tap to listen". */
  const unlockJustRefused = () => {
    const at = lastUnlockAtRef.current;
    if (at === null || performance.now() - at > UNLOCK_REFUSED_WINDOW_MS) return false;
    waitForVideoTapRef.current();
    return true;
  };

  const clearTimer = (ref: { current: number | null }) => {
    if (ref.current !== null) {
      window.clearTimeout(ref.current);
      ref.current = null;
    }
  };

  /** Muted while the user muted, while catching up silently, or while the browser blocks sound. */
  const applyMute = useCallback(() => {
    const { isMuted, needsUserGesture, tapVideoToStart } = usePlayerStore.getState();
    // Waiting for a tap on the video itself: un-muted, so that tap starts it with sound.
    engineRef.current?.setMuted(isMuted || (needsUserGesture && !tapVideoToStart) || catchUpRef.current.active);
  }, []);

  const aimAhead = useCallback(() => {
    const engine = engineRef.current;
    const state = usePlayerStore.getState().serverState;
    if (!engine || !state) return;
    const target = targetPositionMs(state, listenNow());
    const kind = hasPlayedRef.current ? "warm" : "cold";
    lastAimRef.current = kind;
    engine.seekMs(target + leadMsRef.current[kind]);
    debugRef.current.seeks += 1;
    trace(`seek #${debugRef.current.seeks} (${kind}) → ${Math.round(target)} + lead ${Math.round(leadMsRef.current[kind])}`);
  }, [trace]);

  const finishCatchUp = useCallback(() => {
    clearTimer(catchUpTimerRef);
    catchUpRef.current.active = false;
    applyMute();
    const store = usePlayerStore.getState();
    if (store.isMuted || store.needsUserGesture) return;
    debugRef.current.audibleAt ??= performance.now();
    trace("audible");
    // Without a prior click on the page, the browser either pauses us or
    // (YouTube) silently keeps the player muted — both mean "ask for a tap".
    window.setTimeout(() => {
      const engine = engineRef.current;
      const current = usePlayerStore.getState();
      if (!engine || !current.serverState?.isPlaying || current.isMuted || catchUpRef.current.active) return;
      if (!engine.isPaused() && !engine.isMuted()) return;
      trace(`unmute blocked (${engine.isPaused() ? "paused" : "kept muted"}): keep playing muted`);
      if (unlockJustRefused()) return;
      usePlayerStore.getState().setNeedsUserGesture(true);
      applyMute();
      engine.play();
    }, UNMUTE_VERIFY_MS);
  }, [applyMute, trace]);

  /** Measures where a catch-up landed, learns the seek latency, and re-aims or finishes. */
  const checkCatchUp = useCallback(() => {
    clearTimer(catchUpTimerRef);
    const engine = engineRef.current;
    const store = usePlayerStore.getState();
    const state = store.serverState;
    if (!engine || !state || !catchUpRef.current.active) return;
    if (engine.isPaused() || store.isBuffering) {
      catchUpTimerRef.current = window.setTimeout(checkCatchUp, CATCH_UP_POLL_MS);
      return;
    }

    const drift = engine.getPositionMs() - targetPositionMs(state, listenNow()); // < 0: behind
    const inTolerance = Math.abs(drift) <= CATCH_UP_TOLERANCE_MS;
    if (inTolerance && !catchUpRef.current.confirmed && catchUpRef.current.seeks < CATCH_UP_MAX_SEEKS) {
      // Right after a seek YouTube can report a moving position while still
      // stalling; un-muting on one reading let joiners hear an 800 ms lag.
      catchUpRef.current.confirmed = true;
      trace(`landed ${Math.round(drift)}, confirming`);
      catchUpTimerRef.current = window.setTimeout(checkCatchUp, CATCH_UP_CONFIRM_MS);
      return;
    }
    if (inTolerance || catchUpRef.current.seeks >= CATCH_UP_MAX_SEEKS) {
      trace(`landed ${Math.round(drift)}`);
      finishCatchUp();
      return;
    }

    // We aimed `lead` ahead and ended up `drift` off, so the real latency was lead − drift.
    const kind = lastAimRef.current;
    leadMsRef.current[kind] = Math.min(MAX_LEAD_MS, Math.max(0, leadMsRef.current[kind] - drift));
    trace(`landed ${Math.round(drift)} → ${kind} lead ${Math.round(leadMsRef.current[kind])}`);
    catchUpRef.current.confirmed = false;
    catchUpRef.current.seeks += 1;
    aimAhead();
    catchUpTimerRef.current = window.setTimeout(checkCatchUp, leadMsRef.current.warm + CATCH_UP_SETTLE_MS);
  }, [aimAhead, finishCatchUp, trace]);

  /** Mutes, aims ahead of the room and plays; checkCatchUp takes it from there. */
  const beginCatchUp = useCallback(
    (reason: string) => {
      const engine = engineRef.current;
      if (!engine) return;
      trace(`catch-up (${reason})`);
      clearTimer(nudgeTimerRef);
      engine.setRate(1);
      catchUpRef.current = { active: true, seeks: 0, confirmed: false };
      applyMute();
      aimAhead();
      if (engine.isPaused()) {
        startPendingSinceRef.current = Date.now();
        engine.play();
      } else {
        catchUpTimerRef.current = window.setTimeout(checkCatchUp, leadMsRef.current.warm + CATCH_UP_SETTLE_MS);
      }
    },
    [aimAhead, applyMute, checkCatchUp, trace],
  );

  const cancelCatchUp = useCallback(() => {
    clearTimer(catchUpTimerRef);
    startPendingSinceRef.current = null;
    if (catchUpRef.current.active) {
      catchUpRef.current.active = false;
      applyMute();
    }
  }, [applyMute]);

  /**
   * Safari refused the room's "tap to listen" (it only counts taps on the
   * cross-origin player itself): stop, un-mute, and let the next tap go
   * straight through to the video. Its PLAYING then ends the wait.
   */
  const waitForVideoTap = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    trace("unlock refused: waiting for a tap on the video");
    lastUnlockAtRef.current = null;
    cancelCatchUp();
    clearTimer(nudgeTimerRef);
    engine.setRate(1);
    engine.pause();
    const store = usePlayerStore.getState();
    store.setNeedsUserGesture(true);
    store.setTapVideoToStart(true);
    applyMute();
  }, [applyMute, cancelCatchUp, trace]);
  waitForVideoTapRef.current = waitForVideoTap;

  /** Brings the engine in line with the latest server state. Safe to call any time. */
  const reconcile = useCallback(() => {
    const engine = engineRef.current;
    const store = usePlayerStore.getState();
    const state = store.serverState;
    if (!engine || !state || loadedTrackIdRef.current !== state.trackId) return;

    const target = targetPositionMs(state, listenNow());
    const local = engine.getPositionMs();
    const drift = Math.abs(local - target);

    if (!state.isPlaying) {
      cancelCatchUp();
      clearTimer(nudgeTimerRef);
      engine.setRate(1);
      if (!engine.isPaused()) engine.pause();
      if (drift > SOFT_CORRECTION_MS) engine.seekMs(target);
      store.setSync(true, 0);
      return;
    }
    // Playing it ourselves would just be refused again; the tap on the video starts it.
    if (store.tapVideoToStart) return;

    // Placing a late joiner by an unsynced device clock would cost a second correction.
    if (!isServerClockSettled()) {
      if (!clockWaitRef.current) {
        clockWaitRef.current = true;
        void syncServerClock().finally(() => {
          clockWaitRef.current = false;
          reconcile();
        });
      }
      return;
    }

    if (engine.isPaused()) {
      const pendingSince = startPendingSinceRef.current;
      if (pendingSince !== null && Date.now() - pendingSince < START_TIMEOUT_MS) return; // still starting
      // Even a muted start never played (Safari in Low Power Mode refuses any autoplay): ask for a tap.
      if (pendingSince !== null && !store.needsUserGesture) {
        trace("start refused: ask for a tap");
        store.setNeedsUserGesture(true);
      }
      beginCatchUp(pendingSince === null ? "start" : "start timed out");
      return;
    }

    if (catchUpRef.current.active || store.isBuffering) return;

    const correction = decideCorrection(local, target, engine.seekThresholdMs);
    if (correction.kind === "seek") {
      beginCatchUp(`drift ${Math.round(local - target)}`);
      return;
    }
    clearTimer(nudgeTimerRef);
    engine.setRate(correction.rate);
    if (correction.rate !== 1) {
      nudgeTimerRef.current = window.setTimeout(() => {
        nudgeTimerRef.current = null;
        engineRef.current?.setRate(1);
      }, correction.forMs);
    }
    store.setSync(drift <= SOFT_CORRECTION_MS, drift);
  }, [beginCatchUp, cancelCatchUp, trace]);

  const handleEngineEvent = useCallback(
    (event: EngineEvent) => {
      const store = usePlayerStore.getState();
      if (event.type !== "duration") trace(`engine ${event.type}${event.type === "buffering" ? ` ${event.buffering}` : ""}`);
      switch (event.type) {
        case "buffering":
          store.setBuffering(event.buffering);
          // During a catch-up, checkCatchUp polls instead; reconciling here would re-aim mid-seek.
          if (!event.buffering && !catchUpRef.current.active) reconcile();
          break;
        case "duration":
          store.setDuration(event.durationMs);
          break;
        case "playing":
          debugRef.current.firstPlayingAt ??= performance.now();
          startPendingSinceRef.current = null;
          hasPlayedRef.current = true;
          if (store.tapVideoToStart) {
            // The tap on the video started it, with sound. Jump to the room's
            // position audibly: muting again for a silent catch-up could be refused.
            trace("video tapped: playing with sound");
            store.setNeedsUserGesture(false);
            applyMute();
            aimAhead();
            break;
          }
          if (catchUpRef.current.active) {
            clearTimer(catchUpTimerRef);
            catchUpTimerRef.current = window.setTimeout(checkCatchUp, CATCH_UP_SETTLE_MS);
          }
          break;
        case "autoplay-blocked":
          if (unlockJustRefused()) break;
          // Muted playback is always allowed: stay in sync silently until the user taps.
          store.setNeedsUserGesture(true);
          applyMute();
          break;
        case "ended": {
          const version = store.stateVersion;
          if (store.serverState?.isPlaying && endedVersionRef.current !== version) {
            endedVersionRef.current = version;
            onTrackEndedRef.current(version);
          }
          break;
        }
        case "error":
          store.setEngineError(event.message);
          break;
        default:
          break;
      }
    },
    [reconcile, checkCatchUp, applyMute, aimAhead, trace],
  );

  // Load the room's current track into the right engine.
  useEffect(() => {
    const store = usePlayerStore.getState();
    if (!track) return;
    const source = sourceFor(track);
    if (!source) {
      store.setEngineError("This track has no playable audio source yet");
      return;
    }

    const kind: EngineKind = source.kind;
    if (engineKindRef.current !== kind) {
      unsubscribeEngineRef.current?.();
      engineRef.current?.destroy();
      engineRef.current = null;
      if (kind === "youtube") {
        const container = containerRef.current;
        if (!container) return;
        engineRef.current = new YouTubeEngine(container);
      } else {
        engineRef.current = new HtmlAudioEngine();
      }
      engineKindRef.current = kind;
      leadMsRef.current = { cold: engineRef.current.expectedSeekLatencyMs, warm: WARM_SEEK_LEAD_MS };
      unsubscribeEngineRef.current = engineRef.current.subscribe(handleEngineEvent);
      engineRef.current.setVolume(effectiveVolume(usePlayerStore.getState()));
      applyMute();
    }

    const engine = engineRef.current;
    if (!engine) return;
    let cancelled = false;
    cancelCatchUp();
    loadedTrackIdRef.current = null;
    hasPlayedRef.current = false;
    store.setBuffering(true);
    store.setEngineError(null);
    trace(`load start ${track.id}`);
    engine
      .load(source)
      .then(() => {
        if (cancelled) return;
        trace("load done");
        loadedTrackIdRef.current = track.id;
        store.setBuffering(false);
        if (track.durationMs > 0) store.setDuration(track.durationMs);
        reconcile();
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        store.setBuffering(false);
        store.setEngineError(error instanceof Error ? error.message : "This track could not be loaded");
      });
    return () => {
      cancelled = true;
    };
  }, [track, containerRef, handleEngineEvent, reconcile, applyMute, cancelCatchUp, trace]);

  // Re-sync whenever a newer server state arrives, and on a steady interval.
  useEffect(() => {
    const unsubscribe = usePlayerStore.subscribe((state, previous) => {
      if (state.serverState !== previous.serverState) {
        trace(`server state v${state.serverState?.version ?? "-"}`);
        // A seek/resume by the host makes any in-flight catch-up aim at a stale target.
        if (catchUpRef.current.active) cancelCatchUp();
        reconcile();
      }
      if (state.volume !== previous.volume || state.duckScale !== previous.duckScale) {
        engineRef.current?.setVolume(effectiveVolume(state));
      }
      if (
        state.isMuted !== previous.isMuted ||
        state.needsUserGesture !== previous.needsUserGesture ||
        state.tapVideoToStart !== previous.tapVideoToStart
      )
        applyMute();
    });
    const syncTimer = window.setInterval(reconcile, SYNC_INTERVAL_MS);
    // While catching up the player is muted and jumping; the room's position is what to show.
    const engineIsAuthoritative = () => {
      const engine = engineRef.current;
      const store = usePlayerStore.getState();
      return engine && loadedTrackIdRef.current === store.currentTrackId && !catchUpRef.current.active && !store.tapVideoToStart
        ? engine
        : null;
    };
    const uiTimer = window.setInterval(() => {
      const store = usePlayerStore.getState();
      const position =
        engineIsAuthoritative()?.getPositionMs() ??
        (store.serverState ? targetPositionMs(store.serverState, listenNow()) : 0);
      store.seek(position);
    }, UI_TICK_MS);
    setLivePositionReader(() => {
      const engine = engineIsAuthoritative();
      return engine ? { positionMs: engine.getPositionMs(), playing: usePlayerStore.getState().isPlaying } : null;
    });
    return () => {
      setLivePositionReader(null);
      unsubscribe();
      window.clearInterval(syncTimer);
      window.clearInterval(uiTimer);
    };
  }, [reconcile, applyMute, cancelCatchUp, trace]);

  // Tear the engine down with the room.
  useEffect(
    () => () => {
      clearTimer(nudgeTimerRef);
      clearTimer(catchUpTimerRef);
      unsubscribeEngineRef.current?.();
      engineRef.current?.destroy();
      engineRef.current = null;
      engineKindRef.current = null;
      loadedTrackIdRef.current = null;
    },
    [],
  );

  /**
   * Call from a click handler: browsers only allow sound after a user gesture.
   * Playback is usually already running muted and in sync, so this just un-mutes.
   */
  const unlock = useCallback(() => {
    lastUnlockAtRef.current = performance.now();
    usePlayerStore.getState().setNeedsUserGesture(false);
    applyMute();
    const engine = engineRef.current;
    const state = usePlayerStore.getState().serverState;
    if (!engine || !state?.isPlaying) return;
    if (engine.isPaused()) beginCatchUp("unlock");
    else if (!catchUpRef.current.active) debugRef.current.audibleAt ??= performance.now();
    // Safari ignores taps outside its cross-origin player: check this one took.
    window.setTimeout(() => {
      const current = usePlayerStore.getState();
      if (engineRef.current !== engine || !current.serverState?.isPlaying || current.isMuted || current.needsUserGesture) return;
      const refused = engine.isPaused() || (!catchUpRef.current.active && engine.isMuted());
      if (refused && !current.isBuffering && lastUnlockAtRef.current !== null) waitForVideoTap();
    }, UNLOCK_VERIFY_MS);
  }, [applyMute, beginCatchUp, waitForVideoTap]);

  return { unlock };
}
