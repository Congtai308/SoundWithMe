"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { LyricLine, TrackWithArtist } from "@soundwithme/types";
import { Icon } from "@/components/ui/Icon";
import { useLyrics, useSharedLyricsOffset } from "../hooks/use-lyrics";
import { lyricsApi } from "../services/lyrics-api";
import { useCurrentUser } from "@/features/auth/hooks/use-auth";
import { useSmoothPosition } from "../hooks/use-smooth-position";

const OFFSET_STEP_MS = 500;
/** People tap a line a moment after they hear it start: count that in when syncing by tap. */
const TAP_REACTION_MS = 200;
/** How long "Synced · Undo" stays up after a change. */
const SYNC_NOTICE_MS = 5_000;
/** A listener's own sync is shared once they've stopped adjusting for this long. */
const SHARE_DELAY_MS = 2_000;
/** A video at least this much longer than the lyrics' recording probably has an intro the album cut doesn't. */
const INTRO_GUESS_MIN_MS = 3_000;
/** Start scrolling to the next line this early, so it reaches the middle as it lights up. */
const SCROLL_LEAD_MS = 350;
/** Shortest scroll animation (after a seek lands just before a line). */
const SCROLL_MIN_MS = 120;
/** About one frame: the time React takes to commit the newly lit line. */
const RENDER_LEAD_MS = 16;
const VERSION_MISMATCH_HINT =
  "These lyrics follow the album version and this video has extra parts — click the line being sung to line them up.";
/** Lyrics timed to a recording this much shorter/longer than the video are probably the album cut. */
const DURATION_MISMATCH_MS = 4_000;
/** Words ending before this share of the video means it has parts the album cut doesn't (intro, skits). */
const LYRICS_MIN_COVERAGE = 0.6;
/** The karaoke wipe never crawls slower than this per character, even before a long instrumental gap. */
const WIPE_MS_PER_CHAR = 140;
const WIPE_MIN_MS = 1_200;
const OFFSET_STORAGE_PREFIX = "swm.lyrics.offset.";
const NO_LINES: LyricLine[] = [];
/** Opacity by distance from the line being sung — the eye lands on it, then on the next one. */
const LINE_OPACITY = [1, 0.55, 0.38, 0.22];
/** After the listener scrolls the lyrics themselves, wait this long before following the song again. */
const MANUAL_SCROLL_HOLD_MS = 4_000;

/** Index of the last line whose timestamp has passed, or -1 before the first line. */
function activeLineIndex(lines: LyricLine[], positionMs: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid]!.timeMs <= positionMs) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/** This listener's own timing for the track, or null if they never changed it. */
function readOffset(trackId: string): number | null {
  try {
    const raw = window.localStorage.getItem(OFFSET_STORAGE_PREFIX + trackId);
    const stored = raw === null ? NaN : Number(raw);
    return Number.isFinite(stored) ? stored : null;
  } catch {
    return null;
  }
}

function storeOffset(trackId: string, offsetMs: number): void {
  try {
    // 0 too: "back to the published timing" is a choice, not "follow everyone else".
    window.localStorage.setItem(OFFSET_STORAGE_PREFIX + trackId, String(offsetMs));
  } catch {
    // The correction just won't survive a reload.
  }
}

/**
 * Karaoke-style synced lyrics following the room's playback. A smoothed
 * clock drives a per-frame wipe across the current line without re-rendering.
 * Lyrics are usually timed to the album version, while music videos add
 * intros — clicking the line being sung re-aligns them (saved per track).
 */
export function LyricsPanel({ track, compact = false }: { track: TrackWithArtist | undefined; compact?: boolean }) {
  const [isOpen, setIsOpen] = useState(true);
  const [offsetMs, setOffsetMs] = useState(0);
  const [active, setActive] = useState(-1);
  const getPosition = useSmoothPosition();
  const lyrics = useLyrics(track?.id, isOpen);
  const scrollRef = useRef<HTMLDivElement>(null);
  const manualScrollUntil = useRef(0);
  const holdAutoScroll = () => {
    manualScrollUntil.current = performance.now() + MANUAL_SCROLL_HOLD_MS;
  };
  const activeRef = useRef<HTMLButtonElement>(null);
  /** Read by the scroll animation, which runs outside React. */
  const syncingRef = useRef(false);

  const trackId = track?.id;
  const shared = useSharedLyricsOffset(trackId, isOpen);
  const { data: user } = useCurrentUser();
  /** Whether this listener set the timing themselves (else it follows everyone's). */
  const [ownOffset, setOwnOffset] = useState(false);
  useEffect(() => {
    const own = trackId ? readOffset(trackId) : null;
    setOwnOffset(own !== null);
    setOffsetMs(own ?? 0);
  }, [trackId]);
  // Nobody set it here: start from the timing other listeners settled on.
  useEffect(() => {
    if (!ownOffset && shared) setOffsetMs(shared.offsetMs);
  }, [ownOffset, shared]);

  const lines = lyrics.data?.lines ?? NO_LINES;

  const changeOffset = useCallback(
    (next: number) => {
      const rounded = Math.round(next / 100) * 100;
      setOffsetMs(rounded);
      setOwnOffset(true);
      if (trackId) storeOffset(trackId, rounded);
    },
    [trackId],
  );

  // A listener's hand-made sync (tap or nudge) helps everyone after them:
  // send it once they've settled. Guesses and the shared value aren't votes.
  const [toShare, setToShare] = useState<number | null>(null);
  useEffect(() => {
    if (toShare === null || !trackId || !user) return;
    const timer = window.setTimeout(() => {
      void lyricsApi.recordOffset(trackId, toShare).catch(() => undefined);
      setToShare(null);
    }, SHARE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [toShare, trackId, user]);

  /**
   * Sync mode: the lyrics stop following the song (so the right line can be
   * found while they're off), and the next line tapped becomes the one being
   * sung. Each change shows "Synced · Undo" for a moment.
   */
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState<{ previous: number; text: string; vote: boolean } | null>(null);
  /** `vote`: the listener chose this timing by hand, so it's shared. */
  const applyOffset = useCallback(
    (next: number, text: string, vote: boolean) => {
      setNotice({ previous: offsetMs, text, vote });
      changeOffset(next);
      if (vote) setToShare(Math.round(next / 100) * 100);
    },
    [offsetMs, changeOffset],
  );
  const syncToLine = (line: LyricLine) => {
    // Line `line` should have started a reaction time ago: shift the timing so it did.
    applyOffset(line.timeMs - (getPosition() - TAP_REACTION_MS), "Đã khớp", true);
    setSyncing(false);
  };
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), SYNC_NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);
  useEffect(() => setSyncing(false), [trackId]);
  useEffect(() => {
    syncingRef.current = syncing;
    // Back to following the song from where it really is.
    if (!syncing) manualScrollUntil.current = 0;
  }, [syncing]);

  // [ and ] nudge the timing, Esc leaves sync mode; never while typing (chat).
  useEffect(() => {
    if (!isOpen || lines.length === 0) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if ((e.target as HTMLElement | null)?.closest("input, textarea, [contenteditable='true']")) return;
      if (e.key === "]") applyOffset(offsetMs + OFFSET_STEP_MS, "Sớm hơn", true);
      else if (e.key === "[") applyOffset(offsetMs - OFFSET_STEP_MS, "Muộn hơn", true);
      else if (e.key === "Escape" && syncing) setSyncing(false);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, lines.length, offsetMs, syncing, applyOffset]);

  const scrolledToRef = useRef(-2);
  /**
   * Our own scroll animation instead of `behavior: "smooth"`, whose duration
   * the browser picks: a fixed duration lets a line arrive in the middle
   * exactly as it lights up. Advanced from the per-frame tick below.
   */
  const tweenRef = useRef<{ from: number; to: number; start: number; duration: number } | null>(null);

  /** Scrolls line `index` (or the top, before the first line) to the middle over `duration` ms. */
  const centerLine = useCallback((index: number, duration: number) => {
    const container = scrollRef.current;
    if (!container || performance.now() < manualScrollUntil.current || syncingRef.current) return;
    const line = index >= 0 ? container.querySelector<HTMLElement>(`[data-index="${index}"]`) : null;
    const max = container.scrollHeight - container.clientHeight;
    const to = Math.max(0, Math.min(max, line ? line.offsetTop - container.clientHeight / 2 + line.clientHeight / 2 : 0));
    if (duration <= 0) {
      tweenRef.current = null;
      container.scrollTop = to;
      return;
    }
    tweenRef.current = { from: container.scrollTop, to, start: performance.now(), duration };
  }, []);

  // Per frame: pick the active line (re-render only when it changes), start
  // scrolling to the next line early so it is centred when it lights up, and
  // paint the wipe straight onto the element.
  useEffect(() => {
    if (!isOpen || lines.length === 0) return;
    let frame = 0;
    let current = -2;
    scrolledToRef.current = -2;
    const tick = () => {
      const position = getPosition() + offsetMs;
      // One frame early: React needs a frame to commit, so the line lights on the beat.
      const index = activeLineIndex(lines, position + RENDER_LEAD_MS);
      if (index !== current) {
        current = index;
        setActive(index);
      }
      const scrollIndex = activeLineIndex(lines, position + SCROLL_LEAD_MS);
      if (scrollIndex !== scrolledToRef.current) {
        scrolledToRef.current = scrollIndex;
        // Arrive when the line starts (or quickly, after a seek past it).
        const untilLit = (lines[scrollIndex]?.timeMs ?? 0) - position;
        centerLine(scrollIndex, Math.max(SCROLL_MIN_MS, Math.min(SCROLL_LEAD_MS, untilLit)));
      }
      const tween = tweenRef.current;
      const container = scrollRef.current;
      if (tween && container) {
        const t = Math.min(1, (performance.now() - tween.start) / tween.duration);
        const eased = 1 - (1 - t) ** 3; // ease-out cubic
        container.scrollTop = tween.from + (tween.to - tween.from) * eased;
        if (t >= 1) tweenRef.current = null;
      }
      const line = lines[index];
      const element = activeRef.current;
      // Until React commits the new active line, the ref still points at the old one.
      if (line && element && element.dataset.index === String(index)) {
        const gap = (lines[index + 1]?.timeMs ?? line.timeMs + WIPE_MIN_MS) - line.timeMs;
        const wipeMs = Math.max(WIPE_MIN_MS, Math.min(gap * 0.9, line.text.length * WIPE_MS_PER_CHAR));
        const progress = Math.min(1, Math.max(0, (position - line.timeMs) / wipeMs));
        element.style.setProperty("--wipe", `${(progress * 100).toFixed(1)}%`);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isOpen, lines, offsetMs, getPosition, centerLine]);

  // Lighting a line resizes it and shrinks the previous one, shifting
  // everything by a few dozen px. Re-centre in the same frame, before paint,
  // so the lit line never visibly jumps.
  useLayoutEffect(() => {
    if (active === scrolledToRef.current) centerLine(active, 0);
  }, [active, centerLine]);

  // The window resizes when the stage switches between art and video mode.
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => centerLine(scrolledToRef.current, 0));
    observer.observe(container);
    return () => observer.disconnect();
  }, [isOpen, lines.length, centerLine]);

  const offsetLabel = `${offsetMs > 0 ? "+" : ""}${(offsetMs / 1000).toFixed(1)}s`;

  /**
   * One button to line the lyrics up, most reliable first: the timing other
   * listeners settled on; else a guess from how much longer the video is than
   * the recording the lyrics belong to (usually an intro); else, or when
   * those are already applied, tap the line being sung.
   */
  const autoSync = () => {
    if (syncing) {
      setSyncing(false);
      return;
    }
    if (shared && offsetMs !== shared.offsetMs) {
      applyOffset(shared.offsetMs, `Khớp theo ${shared.votes} người nghe`, false);
      return;
    }
    const extraMs = (track?.durationMs ?? 0) - (lyrics.data?.durationMs ?? 0);
    const guess = -Math.round(extraMs / 100) * 100;
    if (!shared && extraMs >= INTRO_GUESS_MIN_MS && offsetMs !== guess) {
      applyOffset(guess, "Đã đoán theo đoạn intro", false);
      return;
    }
    setSyncing(true);
  };
  const videoMs = track?.durationMs ?? 0;
  const lastLineMs = lines[lines.length - 1]?.timeMs ?? 0;
  // LRCLIB's own duration field is sometimes wrong, so also check where the words actually end.
  const versionMismatch =
    lines.length > 0 &&
    videoMs > 0 &&
    (Math.abs((lyrics.data?.durationMs ?? 0) - videoMs) > DURATION_MISMATCH_MS ||
      lastLineMs > videoMs ||
      lastLineMs < videoMs * LYRICS_MIN_COVERAGE);

  return (
    <section
      aria-label="Lyrics"
      className={`room-panel-static flex flex-col overflow-hidden rounded-lg ${
        !isOpen ? "" : compact ? "md:min-h-[150px] md:flex-[3_1_0%]" : "md:min-h-[240px] md:flex-1 md:basis-0"
      }`}
    >
      <header className="flex items-center gap-sm border-b border-white/[0.08] bg-white/[0.025] px-md py-sm">
        <Icon name="lyrics" className="text-[20px] text-[#c4b5fd]" />
        <h3 className={`font-technical text-label-mono-sm uppercase tracking-wider text-[#c4b5fd] ${compact ? "sr-only" : ""}`}>Lyrics</h3>
        {compact && versionMismatch && (
          <span title={VERSION_MISMATCH_HINT} className="flex shrink-0 text-[#fbbf24]/80">
            <Icon name="touch_app" className="text-[16px]" />
            <span className="sr-only">{VERSION_MISMATCH_HINT}</span>
          </span>
        )}
        {lyrics.data && (
          <p className="min-w-0 flex-1 truncate text-body-sm text-on-surface-variant">
            — {lyrics.data.trackName} · {lyrics.data.artistName}
          </p>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-xs">
          {isOpen && lines.length > 0 && (
            <>
              {notice ? (
                <span
                  role="status"
                  title={`${notice.text} (${offsetLabel})`}
                  className="flex items-center gap-1 rounded-full bg-success/10 py-1 pl-xs pr-0.5 text-body-sm text-success"
                >
                  <Icon name="check" className="text-[16px]" />
                  <span className="sr-only">{notice.text}</span>
                  <span className="font-technical text-label-mono-sm tabular-nums">{offsetLabel}</span>
                  <button
                    type="button"
                    onClick={() => {
                      changeOffset(notice.previous);
                      // The vote being undone (sent or still waiting) is replaced by the old timing.
                      if (notice.vote) setToShare(notice.previous);
                      setNotice(null);
                    }}
                    aria-label="Hoàn tác"
                    title="Hoàn tác"
                    className="flex h-6 w-6 items-center justify-center rounded-full text-on-surface hover:bg-white/[0.08]"
                  >
                    <Icon name="undo" className="text-[16px]" />
                  </button>
                </span>
              ) : (
                <div className="flex items-center overflow-hidden rounded-full border border-white/[0.12] text-body-sm text-on-surface-variant">
                  <button
                    type="button"
                    onClick={() => applyOffset(offsetMs - OFFSET_STEP_MS, "Muộn hơn", true)}
                    title="Lời hiện trước giọng hát: cho lời muộn hơn 0,5 giây  (phím [ )"
                    aria-label="Cho lời muộn hơn nửa giây"
                    className="flex items-center px-xs py-1 hover:bg-white/[0.06] hover:text-on-surface"
                  >
                    <Icon name="fast_rewind" className="text-[16px]" />
                  </button>
                  <button
                    type="button"
                    onClick={() => applyOffset(0, "Về mặc định", true)}
                    disabled={offsetMs === 0}
                    title={
                      offsetMs === 0
                        ? "Lời đang theo thời gian gốc"
                        : !ownOffset && shared
                          ? `Đang khớp theo ${shared.votes} người nghe. Bấm để về thời gian gốc`
                          : "Bấm để về thời gian gốc"
                    }
                    className="font-technical border-x border-white/[0.12] px-xs py-1 text-label-mono-sm tabular-nums enabled:hover:bg-white/[0.06] enabled:hover:text-on-surface"
                  >
                    {offsetLabel}
                  </button>
                  <button
                    type="button"
                    onClick={() => applyOffset(offsetMs + OFFSET_STEP_MS, "Sớm hơn", true)}
                    title="Lời hiện sau giọng hát: cho lời sớm hơn 0,5 giây  (phím ] )"
                    aria-label="Cho lời sớm hơn nửa giây"
                    className="flex items-center px-xs py-1 hover:bg-white/[0.06] hover:text-on-surface"
                  >
                    <Icon name="fast_forward" className="text-[16px]" />
                  </button>
                </div>
              )}
              <button
                type="button"
                onClick={autoSync}
                aria-pressed={syncing}
                title="Lời bị lệch? Bấm để tự khớp. Vẫn lệch thì bấm tiếp rồi chọn câu đang hát"
                className={`flex items-center gap-1 rounded-full px-sm py-1 text-body-sm font-semibold transition-colors ${
                  syncing
                    ? "bg-primary-container text-on-primary-container"
                    : "bg-primary-container/20 text-primary hover:bg-primary-container/35"
                }`}
              >
                <Icon name={syncing ? "close" : "sync"} className="text-[16px]" />
                {syncing ? "Huỷ" : "Khớp nhạc"}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            aria-expanded={isOpen}
            aria-label={isOpen ? "Hide lyrics" : "Show lyrics"}
            className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant hover:bg-white/[0.06] hover:text-on-surface"
          >
            <Icon name={isOpen ? "expand_less" : "expand_more"} className="text-[22px]" />
          </button>
        </div>
      </header>

      {isOpen && syncing && (
        <p role="status" className="flex shrink-0 items-center gap-xs border-b border-primary/20 bg-primary-container/15 px-md py-xs text-body-sm text-on-surface">
          <span className="h-2 w-2 shrink-0 rounded-full bg-primary motion-safe:animate-ping" />
          Bấm vào câu đang được hát, lời sẽ khớp theo câu đó.
          <span className="ml-auto shrink-0 text-outline">Esc để huỷ</span>
        </p>
      )}

      {isOpen && versionMismatch && !compact && !syncing && (
        <p className="flex shrink-0 items-center gap-1.5 px-md pt-xs text-body-sm text-[#fbbf24]/80">
          <Icon name="touch_app" className="text-[16px]" />
          {VERSION_MISMATCH_HINT}
        </p>
      )}

      {isOpen && (
        <div
          ref={scrollRef}
          onWheel={holdAutoScroll}
          onTouchMove={holdAutoScroll}
          className="scrollbar-none relative h-[50vh] overflow-y-auto md:h-auto md:min-h-0 md:flex-1 px-md [mask-image:linear-gradient(to_bottom,transparent,black_20%,black_80%,transparent)]"
        >
          {!track ? (
            <LyricsNotice text="Lyrics show up here once a song is playing." />
          ) : lyrics.isLoading ? (
            <LyricsNotice text="Finding lyrics…" busy />
          ) : lyrics.isError ? (
            <LyricsNotice text={lyrics.error.message} action={{ label: "Retry", onClick: () => lyrics.refetch() }} />
          ) : lines.length > 0 ? (
            <div
              className={`flex flex-col items-center gap-sm text-center ${
                compact ? "py-[clamp(48px,8vh,96px)]" : "py-[clamp(80px,14vh,180px)]"
              }`}
            >
              {lines.map((line, i) => {
                const isActive = i === active;
                const isNext = i === active + 1;
                const distance = Math.abs(i - active);
                return (
                  <button
                    type="button"
                    key={`${line.timeMs}-${i}`}
                    data-index={i}
                    ref={isActive ? activeRef : undefined}
                    aria-current={isActive ? "true" : undefined}
                    onClick={() => syncToLine(line)}
                    title="Click when this line is being sung"
                    style={{ opacity: isActive ? 1 : (LINE_OPACITY[Math.min(distance, LINE_OPACITY.length - 1)] ?? 0) + (isNext ? 0.2 : 0) }}
                    className={`block max-w-full rounded-md px-xs transition-[color,opacity,filter] duration-300 hover:bg-white/[0.04] hover:!opacity-100 ${
                      syncing ? "!opacity-90 !blur-none outline-dashed outline-1 outline-white/10 hover:bg-primary-container/25 hover:outline-primary/60" : ""
                    } ${
                      isActive
                        ? `my-xs bg-clip-text ${compact ? "text-[clamp(1.25rem,1.8vw,1.625rem)]" : "text-[clamp(1.5rem,2.4vw,2.125rem)]"} font-extrabold leading-tight text-transparent drop-shadow-[0_0_22px_rgba(139,92,246,0.55)] [background-image:linear-gradient(90deg,#67e8f9,#c4b5fd_var(--wipe,0%),rgba(255,255,255,0.6)_var(--wipe,0%))]`
                        : isNext
                          ? "text-headline-md font-semibold text-on-surface"
                          : distance === 1
                            ? "text-body-lg text-on-surface-variant"
                            : `text-body-md text-outline ${distance >= 3 ? "blur-[0.6px]" : ""}`
                    }`}
                  >
                    {line.text || "♪"}
                  </button>
                );
              })}
            </div>
          ) : lyrics.data?.plain ? (
            <p className="whitespace-pre-line py-md text-center text-body-md text-on-surface-variant">{lyrics.data.plain}</p>
          ) : (
            <LyricsNotice text="No lyrics found for this song." />
          )}
        </div>
      )}
    </section>
  );
}

function LyricsNotice({
  text,
  busy = false,
  action,
}: {
  text: string;
  busy?: boolean;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-xs text-center">
      {busy && <Icon name="progress_activity" className="animate-spin text-[24px] text-outline" />}
      <p className="text-body-md text-on-surface-variant">{text}</p>
      {action && (
        <button type="button" onClick={action.onClick} className="text-body-sm font-semibold text-primary hover:underline">
          {action.label}
        </button>
      )}
    </div>
  );
}
