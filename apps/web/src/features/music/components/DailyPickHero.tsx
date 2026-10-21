"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useSearchTracks } from "@/features/music/hooks/use-search-tracks";
import { useReportListen } from "@/features/music/hooks/use-listening";
import { MUSIC_TOPICS } from "@/features/music/topics";
import type { RecommendationSeed } from "@/features/music/preferences";
import { loadYouTubeApi, type YouTubePlayer } from "@/features/player/services/youtube-engine";
import { usePlayerStore } from "@/features/player/stores/player-store";
import { useRoomSession } from "@/features/rooms/components/RoomSessionProvider";
import { useTrackActions } from "@/features/rooms/hooks/use-track-actions";
import { formatClock } from "@/features/rooms/components/TrackArt";
import { artworkAt } from "@/features/music/artwork";

const STATE_PLAYING = 1;
const STATE_ENDED = 0;
/** If YouTube hasn't started by then, the browser blocked sound: retry muted. */
const AUTOPLAY_CHECK_MS = 2_500;
const PROGRESS_TICK_MS = 500;
/** Stop skipping after this many unplayable videos in a row. */
const MAX_SKIPS = 3;
const EQ_BARS = [5, 9, 6, 12, 8, 14, 10, 7, 11, 6, 9, 5, 8, 6, 4, 7, 5, 3];

function randomIndex(length: number, exclude: number | null = null): number {
  if (length <= 1) return 0;
  let next = Math.floor(Math.random() * length);
  if (next === exclude) next = (next + 1) % length;
  return next;
}

/**
 * Home hero: a random song from a random topic, playing as soon as the page
 * opens. Browsers refuse unmuted autoplay until the visitor has clicked on the
 * site, so it falls back to muted playback with an "unmute" button. When the
 * visitor is already listening in a room it stays quiet and offers to queue
 * the song there instead.
 */
export function DailyPickHero({
  seeds,
  onEditPreferences,
}: {
  /** From the listener's onboarding answers; empty means "surprise me" across all topics. */
  seeds: RecommendationSeed[];
  onEditPreferences: () => void;
}) {
  const personalized = seeds.length > 0;
  const pool: RecommendationSeed[] = personalized
    ? seeds
    : MUSIC_TOPICS.map((topic) => ({ ...topic, reason: "Chủ đề" }));
  const { roomId } = useRoomSession();
  const roomIsPlaying = usePlayerStore((s) => Boolean(s.serverState));
  const busyInRoom = Boolean(roomId) && roomIsPlaying;
  const { mode, pick, notice } = useTrackActions();

  // Chosen after mount so server and client render the same markup.
  const [topicIndex, setTopicIndex] = useState<number | null>(null);
  const [trackIndex, setTrackIndex] = useState<number | null>(null);
  const poolSize = pool.length;
  useEffect(() => setTopicIndex(randomIndex(poolSize)), [poolSize]);

  const topic = topicIndex === null ? null : pool[topicIndex];
  const { data: tracks, isError } = useSearchTracks(topic?.query ?? "");
  useEffect(() => {
    if (tracks && tracks.length > 0 && trackIndex === null) setTrackIndex(randomIndex(tracks.length));
  }, [tracks, trackIndex]);
  const track = tracks && trackIndex !== null ? tracks[trackIndex] : undefined;

  const mountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const autoplayTimerRef = useRef<number | null>(null);
  const skipsRef = useRef(0);
  const [ready, setReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [needsUnmute, setNeedsUnmute] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  useReportListen(track?.id, isPlaying && !needsUnmute);

  const shuffle = useCallback(() => {
    if (!tracks || tracks.length === 0) return;
    // Half the time stay in the same topic, otherwise jump to another one.
    if ((Math.random() < 0.5 || poolSize === 1) && tracks.length > 1) {
      setTrackIndex((current) => randomIndex(tracks.length, current));
    } else {
      setTopicIndex((current) => randomIndex(poolSize, current));
      setTrackIndex(null);
    }
  }, [tracks, poolSize]);

  // Player callbacks are bound once; route them through a ref to see fresh state.
  const handlersRef = useRef({ onEnded: shuffle, onError: shuffle });
  handlersRef.current = {
    onEnded: shuffle,
    onError: () => {
      if (skipsRef.current >= MAX_SKIPS) return;
      skipsRef.current += 1;
      shuffle();
    },
  };

  useEffect(() => {
    let cancelled = false;
    let player: YouTubePlayer | null = null;
    loadYouTubeApi()
      .then((YT) => {
        const mount = mountRef.current;
        if (cancelled || !mount) return;
        const element = document.createElement("div");
        mount.appendChild(element);
        player = new YT.Player(element, {
          width: "100%",
          height: "100%",
          playerVars: { controls: 0, disablekb: 1, rel: 0, playsinline: 1, iv_load_policy: 3, origin: window.location.origin },
          events: {
            onReady: () => {
              if (cancelled) return;
              playerRef.current = player;
              setReady(true);
            },
            onStateChange: ({ data }) => {
              setIsPlaying(data === STATE_PLAYING);
              if (data === STATE_PLAYING) skipsRef.current = 0;
              if (data === STATE_ENDED) handlersRef.current.onEnded();
            },
            onError: () => handlersRef.current.onError(),
          },
        });
      })
      .catch(() => {
        // Script blocked (offline, ad blocker): the hero still shows the song info.
      });
    return () => {
      cancelled = true;
      if (autoplayTimerRef.current !== null) window.clearTimeout(autoplayTimerRef.current);
      player?.destroy();
      playerRef.current = null;
    };
  }, []);

  // Load each new pick; autoplay unless a room is already playing on this tab.
  useEffect(() => {
    const player = playerRef.current;
    if (!ready || !player || !track) return;
    setPositionMs(0);
    setDurationMs(track.durationMs);
    if (autoplayTimerRef.current !== null) window.clearTimeout(autoplayTimerRef.current);
    if (busyInRoom) {
      player.cueVideoById(track.providerTrackId);
      return;
    }
    player.loadVideoById(track.providerTrackId);
    autoplayTimerRef.current = window.setTimeout(() => {
      autoplayTimerRef.current = null;
      if (player.getPlayerState() === STATE_PLAYING) return;
      player.mute();
      player.playVideo();
      setNeedsUnmute(true);
    }, AUTOPLAY_CHECK_MS);
    // busyInRoom is read at load time only; joining a room never re-loads the pick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, track]);

  // A room started playing on this tab: never play on top of it.
  useEffect(() => {
    if (busyInRoom) playerRef.current?.pauseVideo();
  }, [busyInRoom]);

  useEffect(() => {
    if (!ready) return;
    const timer = window.setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      setPositionMs(player.getCurrentTime() * 1000);
      const duration = player.getDuration() * 1000;
      if (duration > 0) setDurationMs(duration);
    }, PROGRESS_TICK_MS);
    return () => window.clearInterval(timer);
  }, [ready]);

  const togglePlay = () => {
    const player = playerRef.current;
    if (!player) return;
    if (isPlaying) {
      player.pauseVideo();
      return;
    }
    player.unMute();
    setNeedsUnmute(false);
    player.playVideo();
  };

  const unmute = () => {
    const player = playerRef.current;
    if (!player) return;
    player.unMute();
    player.playVideo();
    setNeedsUnmute(false);
  };

  const progress = durationMs > 0 ? Math.min(1, positionMs / durationMs) : 0;
  const noResults = tracks !== undefined && tracks.length === 0;

  return (
    <section
      aria-labelledby="daily-pick-heading"
      className="relative overflow-hidden rounded-[28px] border border-white/[0.06] bg-gradient-to-br from-[#2b2150] via-surface-container-low to-[#0d3a44] p-lg shadow-2xl md:p-xl"
    >
      <div className="pointer-events-none absolute -left-20 -top-24 h-80 w-80 rounded-full bg-primary-container/20 blur-[110px]" />
      <div className="pointer-events-none absolute -bottom-24 right-0 h-80 w-80 rounded-full bg-secondary/15 blur-[110px]" />

      <header className="relative mb-lg flex flex-col gap-sm md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-sm">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-container/25 text-primary">
            <Icon name="casino" className="text-[22px]" />
          </span>
          <div>
            <p className="font-technical text-label-mono-sm uppercase text-secondary">Bất ngờ âm nhạc · Gợi ý ngẫu nhiên</p>
            <h2 id="daily-pick-heading" className="text-headline-lg text-on-surface md:text-headline-xl">
              Giai điệu ngẫu nhiên hôm nay
            </h2>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-xs">
          {topic && (
            <span className="font-technical inline-flex items-center gap-1.5 rounded-full border border-secondary/30 bg-secondary/10 px-sm py-1 text-label-mono-sm text-secondary">
              {topic.emoji} {topic.reason}: {topic.label}
            </span>
          )}
          <button
            type="button"
            onClick={onEditPreferences}
            className="inline-flex items-center gap-1 rounded-full bg-black/30 px-sm py-1 text-body-sm text-on-surface-variant transition-colors hover:bg-black/50 hover:text-on-surface"
          >
            <Icon name="tune" className="text-[16px]" />
            {personalized ? "Đổi sở thích" : "Chọn gu nhạc"}
          </button>
        </div>
      </header>

      <div className="relative grid grid-cols-1 items-center gap-xl md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* Video + spinning record sleeve. YouTube requires the player to stay visible. */}
        <div className="relative pr-0 sm:pr-[12%]">
          <div
            aria-hidden="true"
            className="absolute right-0 top-1/2 hidden aspect-square h-[92%] -translate-y-1/2 animate-[spin_8s_linear_infinite] rounded-full bg-[repeating-radial-gradient(circle,#0b0b10_0px,#0b0b10_2px,#1d1d26_3px,#0b0b10_4px)] shadow-[0_0_40px_rgba(0,0,0,0.6)] sm:block"
            style={{ animationPlayState: isPlaying ? "running" : "paused" }}
          >
            <span className="absolute inset-[34%] overflow-hidden rounded-full border-4 border-black/60 bg-primary-container/40">
              {track?.artworkUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- artwork comes from provider CDNs
                <img src={artworkAt(track.artworkUrl, 100)} alt="" decoding="async" className="h-full w-full object-cover" />
              )}
            </span>
          </div>

          <div className="relative z-10 aspect-video overflow-hidden rounded-2xl border border-white/10 bg-black shadow-[0_20px_50px_rgba(0,0,0,0.6)]">
            <div ref={mountRef} className="pointer-events-none absolute inset-0 [&_iframe]:h-full [&_iframe]:w-full" />

            {!track && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-xs bg-surface-container-high/60 p-md text-center">
                {isError || noResults ? (
                  <>
                    <Icon name="music_off" className="text-[32px] text-outline" />
                    <p className="text-body-sm text-on-surface-variant">
                      {isError ? "Không kết nối được YouTube" : "Chưa tìm được bài nào — thử đổi bài khác"}
                    </p>
                  </>
                ) : (
                  <Icon name="progress_activity" className="animate-spin text-[32px] text-primary" />
                )}
              </div>
            )}

            {needsUnmute && isPlaying && !busyInRoom && (
              <button
                type="button"
                onClick={unmute}
                className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-xs bg-gradient-to-t from-black/85 to-transparent pb-sm pt-xl text-headline-sm text-white"
              >
                <Icon name="volume_up" className="text-[22px]" />
                Bấm để bật tiếng
              </button>
            )}
          </div>

          {topic && (
            <span className="font-technical absolute -bottom-3 left-md z-10 inline-flex items-center gap-1 rounded-full border border-white/10 bg-surface-container-highest px-sm py-1 text-label-mono-sm text-on-surface">
              ✨ Vibe: {topic.label}
            </span>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-md">
          <div className="min-w-0">
            <p className="font-technical mb-1 truncate text-label-mono-sm uppercase text-on-surface-variant">
              Gợi ý hôm nay · <span className="text-secondary">{personalized ? "hợp gu của bạn" : "ngẫu nhiên"}</span>
            </p>
            <h3 className="line-clamp-2 text-[26px] font-bold leading-tight tracking-tight text-on-surface md:text-[32px]">
              {track?.title ?? "Đang chọn một bài cho bạn…"}
            </h3>
            {track && (
              <p className="mt-1 truncate text-body-lg text-on-surface-variant">
                {track.artistName}
                {topic ? ` · ${topic.label}` : ""}
              </p>
            )}
          </div>

          <div className="rounded-xl border border-white/[0.06] bg-black/30 p-md">
            <div className="mb-sm flex items-center justify-between">
              <span className="font-technical flex items-center gap-1.5 text-label-mono-sm uppercase text-secondary">
                <Icon name="graphic_eq" className="text-[16px]" />
                {isPlaying ? "Đang phát" : busyInRoom ? "Phòng của bạn đang phát" : "Tạm dừng"}
              </span>
              <span className="font-technical text-label-mono-sm text-on-surface-variant">
                {formatClock(positionMs)} / {durationMs > 0 ? formatClock(durationMs) : "--:--"}
              </span>
            </div>
            <div className="flex h-8 items-end gap-[5px]" aria-hidden="true">
              {EQ_BARS.map((height, i) => (
                <span
                  key={i}
                  className={`w-[5px] rounded-full ${i / EQ_BARS.length < progress ? "bg-gradient-to-t from-primary-container to-secondary" : "bg-white/15"} ${isPlaying ? "motion-safe:animate-pulse" : ""}`}
                  style={{ height: `${height * 2}px`, animationDelay: `${(i % 6) * 120}ms` }}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-sm">
            {!busyInRoom && (
              <button
                type="button"
                onClick={togglePlay}
                disabled={!ready || !track}
                className="flex items-center gap-xs rounded-full bg-primary-container px-lg py-sm text-headline-sm text-on-primary-container shadow-[0_0_24px_rgba(160,120,255,0.4)] transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50"
              >
                <Icon name={isPlaying ? "pause" : "play_arrow"} className="text-[22px]" filled />
                {isPlaying ? "Tạm dừng" : "Nghe ngay"}
              </button>
            )}
            <button
              type="button"
              onClick={shuffle}
              disabled={!tracks || tracks.length === 0}
              className="flex items-center gap-xs rounded-full bg-surface-container-high px-lg py-sm text-headline-sm text-on-surface transition-colors hover:bg-surface-container-highest disabled:opacity-50"
            >
              <Icon name="casino" className="text-[20px]" />
              Đổi bài ngẫu nhiên khác
            </button>
            {track && mode !== "locked" && (
              <button
                type="button"
                onClick={() => pick(track.id)}
                className="flex items-center gap-xs rounded-full bg-secondary/15 px-lg py-sm text-headline-sm text-secondary transition-colors hover:bg-secondary/25"
              >
                <Icon name={mode === "no-room" ? "headphones" : "playlist_add"} className="text-[20px]" />
                {mode === "no-room" ? "Nghe cùng bạn bè" : "Thêm vào phòng"}
              </button>
            )}
          </div>
          {notice && <p role="status" className="text-body-sm text-success">{notice}</p>}
        </div>
      </div>
    </section>
  );
}
