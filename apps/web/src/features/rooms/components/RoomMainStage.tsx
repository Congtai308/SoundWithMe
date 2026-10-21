"use client";

import { useState } from "react";
import type { TrackWithArtist } from "@soundwithme/types";
import { Icon } from "@/components/ui/Icon";
import { VideoSlot } from "@/features/player/components/VideoSlot";
import { usePlayerStore } from "@/features/player/stores/player-store";
import { LyricsPanel } from "@/features/lyrics/components/LyricsPanel";
import { LikeButton } from "@/features/library/components/LikeButton";
import { ShareTrackButton } from "@/features/messages/components/ShareTrackButton";
import { AddToPlaylistButton } from "@/features/library/components/AddToPlaylistButton";
import { useRoomLiveStore } from "../stores/room-live-store";
import { ReactionLayer } from "./ReactionLayer";
import { formatClock } from "./TrackArt";
import { backdropArtwork } from "@/features/music/artwork";

const RESTART_THRESHOLD_MS = 3_000;

type StageMode = "art" | "video";

interface RoomMainStageProps {
  track: TrackWithArtist | undefined;
  isTrackLoading: boolean;
  canControl: boolean;
  hasQueue: boolean;
  onPlay: (positionMs: number) => void;
  onPause: (positionMs: number) => void;
  onSeek: (positionMs: number) => void;
  onNext: () => void;
  onAddSong: () => void;
  canAdd: boolean;
  currentUserId: string;
  onSkipVote: (vote: boolean) => void;
}

/**
 * Column 2 — cinema stage, transport and lyrics (TASK-04). The video itself
 * is drawn by PlayerHost over the VideoSlot below. The stage is a 16:9 box
 * capped by viewport height. In "art" mode the slot is a 16:9 card over the
 * blurred artwork (YouTube requires the player to stay visible and at least
 * 200×200); "video" mode fills the stage.
 *
 * Nothing between this stage and <main> may create a stacking context
 * (backdrop-blur, transform, opacity, z-index), or the z-[21] overlays here
 * would end up underneath the player.
 */
export function RoomMainStage({
  track,
  isTrackLoading,
  canControl,
  hasQueue,
  onPlay,
  onPause,
  onSeek,
  onNext,
  onAddSong,
  canAdd,
  currentUserId,
  onSkipVote,
}: RoomMainStageProps) {
  const [mode, setMode] = useState<StageMode>("art");
  const serverState = usePlayerStore((s) => s.serverState);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const storeDuration = usePlayerStore((s) => s.durationMs);
  const volume = usePlayerStore((s) => s.volume);
  const isMuted = usePlayerStore((s) => s.isMuted);
  const setVolume = usePlayerStore((s) => s.setVolume);
  const toggleMute = usePlayerStore((s) => s.toggleMute);

  const durationMs = storeDuration || track?.durationMs || 0;
  const hasTrack = Boolean(serverState);
  // Read at click time: subscribing to the position would re-render the
  // whole stage (lyrics included) on every 250 ms tick.
  const currentPosition = () => clampPosition(usePlayerStore.getState().currentPositionMs, durationMs);
  // Video mode splits the column ~7:3 between the video and the lyrics.
  const isVideo = mode === "video" && hasTrack;
  const title = track?.title ?? (isTrackLoading ? "Loading…" : hasTrack ? "Unknown track" : "Pick something to play");

  return (
    <section aria-label="Now playing" className="flex min-h-0 flex-col gap-md md:h-full">
      <div
        className={`room-stage relative w-full overflow-hidden rounded-lg bg-surface-container-lowest transition-[flex-grow,max-height] duration-300 ${
          isVideo
            ? "aspect-video min-h-[230px] md:aspect-auto md:min-h-[260px] md:flex-[7_1_0%]"
            : "aspect-video max-h-[min(36vh,480px)] min-h-[230px] shrink-0"
        }`}
      >
        {track?.artworkUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- artwork comes from provider CDNs
          <img
            src={backdropArtwork(track.artworkUrl) ?? ""}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full scale-125 object-cover opacity-50 blur-2xl"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/10 to-black/50" />

        {hasTrack ? (
          <VideoSlot
            key={mode}
            kind="stage"
            className={
              mode === "video"
                ? "absolute inset-0"
                : "absolute left-1/2 top-1/2 aspect-video h-[76%] min-h-[200px] max-w-[calc(100%-32px)] -translate-x-1/2 -translate-y-1/2 rounded-lg shadow-[0_16px_40px_rgba(0,0,0,0.6)]"
            }
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-sm bg-gradient-to-br from-primary-container/20 via-transparent to-secondary-container/10 p-lg text-center">
            <Icon name="queue_music" className="text-[44px] text-primary" />
            <p className="text-headline-md text-on-surface">Nothing is playing yet</p>
            <p className="max-w-sm text-body-md text-on-surface-variant">
              {canAdd
                ? "Add a song from YouTube — everyone in the room will hear it at the same moment."
                : "Waiting for the host or a DJ to start the music."}
            </p>
            {canAdd && (
              <button
                type="button"
                onClick={onAddSong}
                className="mt-xs flex items-center gap-xs rounded-full bg-primary-container px-md py-xs text-headline-sm text-on-primary-container shadow-[0_0_20px_rgba(160,120,255,0.35)]"
              >
                <Icon name="add" className="text-[20px]" />
                Add a song
              </button>
            )}
          </div>
        )}

        {hasTrack && (
          <>
            <span className="font-technical absolute left-md top-md z-[21] flex items-center gap-1.5 rounded-full border border-success/40 bg-black/60 px-sm py-1 text-label-mono-sm uppercase text-success">
              <span className="h-2 w-2 rounded-full bg-success motion-safe:animate-pulse" />
              Live
            </span>
            <button
              type="button"
              onClick={() => setMode(mode === "art" ? "video" : "art")}
              aria-pressed={mode === "video"}
              className="absolute bottom-md right-md z-[21] flex items-center gap-1.5 rounded-md border border-[#8B5CF6]/50 bg-black/60 px-sm py-1 text-body-sm font-semibold text-[#c4b5fd] hover:border-[#8B5CF6]"
            >
              <Icon name={mode === "art" ? "smart_display" : "close_fullscreen"} className="text-[18px]" />
              {mode === "art" ? "Video" : "Compact"}
            </button>
          </>
        )}

        {isVideo && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[21] hidden bg-gradient-to-t from-black/75 to-transparent px-md pb-md pt-xl pr-[140px] md:block">
            <p className="truncate text-headline-sm text-white">{title}</p>
            <p className="truncate text-body-sm text-white/70">{track?.artistName}</p>
          </div>
        )}

        <ReactionLayer />
      </div>

      <div className={`flex items-start justify-between gap-md ${isVideo ? "md:hidden" : ""}`}>
        <div className="min-w-0">
          <h2 title={track?.title} className="line-clamp-1 text-headline-lg font-bold text-on-surface">
            {title}
          </h2>
          <p className="truncate text-body-md text-on-surface-variant">
            {track ? track.artistName : "SoundWithMe Sync Engine"}
            {track?.provider === "youtube" && <span className="text-outline"> · via YouTube</span>}
          </p>
        </div>
        {track && hasTrack && (
          <div className="flex shrink-0 items-center gap-1">
            <LikeButton trackId={track.id} />
            <AddToPlaylistButton trackId={track.id} />
            <ShareTrackButton trackId={track.id} trackTitle={track.title} />
            <SkipVoteButton currentUserId={currentUserId} hasQueue={hasQueue} onVote={onSkipVote} />
          </div>
        )}
      </div>

      <SeekBar durationMs={durationMs} disabled={!canControl || !hasTrack || !durationMs} onSeek={onSeek} />

      <div className="room-panel flex items-center justify-between gap-sm rounded-lg px-md py-sm">
        {/* Equal flex-1 sides keep the transport centred without overflowing narrow columns. */}
        <div className="flex min-w-0 flex-1 items-center gap-xs">
          <button
            type="button"
            onClick={toggleMute}
            aria-label={isMuted ? "Unmute" : "Mute"}
            className="flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant hover:text-on-surface"
          >
            <Icon name={isMuted || volume === 0 ? "volume_off" : volume < 50 ? "volume_down" : "volume_up"} className="text-[22px]" />
          </button>
          <input
            type="range"
            min={0}
            max={100}
            value={isMuted ? 0 : volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            aria-label="Your volume"
            className="hidden h-1 w-24 cursor-pointer accent-[#8B5CF6] min-[1600px]:block"
          />
        </div>

        <div className="flex items-center gap-md">
          <RestartButton disabled={!canControl || !hasTrack} onClick={() => onSeek(0)} />
          <button
            type="button"
            disabled={!canControl || !hasTrack}
            onClick={() => (isPlaying ? onPause(currentPosition()) : onPlay(currentPosition()))}
            aria-label={isPlaying ? "Pause for everyone" : "Play for everyone"}
            title={canControl ? undefined : "Only the host and DJs control playback in this room"}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#d946ef] to-[#ec4899] text-white shadow-[0_0_24px_rgba(236,72,153,0.45)] transition-transform hover:scale-105 active:scale-[0.96] disabled:opacity-40 disabled:shadow-none disabled:hover:scale-100"
          >
            <Icon name={isPlaying ? "pause" : "play_arrow"} className="text-[32px]" filled />
          </button>
          <TransportButton label="Skip to the next queued song" icon="skip_next" disabled={!canControl || !hasQueue} onClick={onNext} />
        </div>

        <div className="flex min-w-0 flex-1 justify-end">
          {hasTrack ? (
            <SyncBadge />
          ) : (
            !canControl && (
              <span className="flex items-center gap-1 text-body-sm text-outline">
                <Icon name="lock" className="text-[16px]" />
                Host &amp; DJs control
              </span>
            )
          )}
        </div>
      </div>

      <LyricsPanel track={hasTrack ? track : undefined} compact={isVideo} />
    </section>
  );
}

/**
 * "Skip" for everyone: when half the room (rounded up) votes, the next
 * queued song starts — no host needed. Shows votes / needed.
 */
function SkipVoteButton({
  currentUserId,
  hasQueue,
  onVote,
}: {
  currentUserId: string;
  hasQueue: boolean;
  onVote: (vote: boolean) => void;
}) {
  const skip = useRoomLiveStore((s) => s.skip);
  const trackId = usePlayerStore((s) => s.currentTrackId);
  const current = skip && skip.trackId === trackId ? skip : null;
  const voted = current?.voterIds.includes(currentUserId) ?? false;
  const votes = current?.voterIds.length ?? 0;
  const needed = current?.needed ?? 1;
  return (
    <button
      type="button"
      aria-pressed={voted}
      disabled={!hasQueue && !voted}
      onClick={() => onVote(!voted)}
      title={
        hasQueue
          ? `Vote to skip — ${votes}/${needed} votes. Half the room moves to the next song.`
          : "Nothing queued to skip to"
      }
      className={`flex items-center gap-1 rounded-full border px-sm py-1 text-body-sm font-semibold transition-colors disabled:opacity-40 ${
        voted
          ? "border-[#f59e0b]/60 bg-[#f59e0b]/15 text-[#fbbf24]"
          : "border-white/[0.12] bg-white/[0.06] text-on-surface-variant hover:text-on-surface"
      }`}
    >
      <Icon name="skip_next" className="text-[18px]" />
      <span>{voted ? "Voted" : "Skip"}</span>
      <span className="font-technical text-label-mono-sm">
        {votes}/{needed}
      </span>
    </button>
  );
}

function clampPosition(positionMs: number, durationMs: number): number {
  return durationMs ? Math.min(positionMs, durationMs) : positionMs;
}

/** The seek bar and clock — the only part of the stage that follows every position tick. */
function SeekBar({ durationMs, disabled, onSeek }: { durationMs: number; disabled: boolean; onSeek: (positionMs: number) => void }) {
  const positionMs = usePlayerStore((s) => s.currentPositionMs);
  const clampedPosition = clampPosition(positionMs, durationMs);
  const progress = durationMs ? (clampedPosition / durationMs) * 100 : 0;
  return (
    <div className="flex flex-col gap-1">
      <input
        type="range"
        min={0}
        max={Math.max(durationMs, 1)}
        step={1000}
        value={clampedPosition}
        disabled={disabled}
        onChange={(e) => onSeek(Number(e.target.value))}
        aria-label="Seek for everyone"
        className="h-1 w-full cursor-pointer appearance-none rounded-full bg-white/[0.12] accent-[#ec4899] disabled:cursor-default"
        style={{
          background: durationMs
            ? `linear-gradient(to right, #22d3ee 0%, #8B5CF6 ${progress / 2}%, #ec4899 ${progress}%, rgba(255,255,255,0.12) ${progress}%)`
            : undefined,
        }}
      />
      <div className="font-technical flex justify-between text-label-mono-sm text-outline">
        <span>{formatClock(clampedPosition)}</span>
        <span>{durationMs ? formatClock(durationMs) : "--:--"}</span>
      </div>
    </div>
  );
}

/** Shown once the song is a few seconds in (re-renders only when that flips). */
function RestartButton({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  const pastStart = usePlayerStore((s) => s.currentPositionMs >= RESTART_THRESHOLD_MS);
  return (
    <TransportButton label="Restart song for everyone" icon="skip_previous" disabled={disabled} onClick={onClick} hidden={!pastStart} />
  );
}

function SyncBadge() {
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const isSynced = usePlayerStore((s) => s.isSyncedWithServer);
  const driftMs = usePlayerStore((s) => s.driftMs);
  const needsUserGesture = usePlayerStore((s) => s.needsUserGesture);
  const inSync = isSynced && !needsUserGesture;
  return (
    <span
      title={driftMs !== null ? `Drift ${Math.round(driftMs)} ms` : undefined}
      className={`font-technical flex shrink-0 items-center gap-1 rounded-md border px-sm py-1 text-label-mono-sm uppercase ${
        inSync ? "border-[#8B5CF6]/50 bg-[#8B5CF6]/10 text-[#c4b5fd]" : "border-[#f59e0b]/40 bg-[#f59e0b]/10 text-[#f59e0b]"
      }`}
    >
      <Icon name="sensors" className="text-[14px]" />
      {inSync ? "Live" : "Syncing"}
      {driftMs !== null && isPlaying && (
        <span className="hidden normal-case opacity-70 min-[1600px]:inline">· {Math.round(driftMs)}ms</span>
      )}
    </span>
  );
}

function TransportButton({
  label,
  icon,
  disabled,
  onClick,
  hidden = false,
}: {
  label: string;
  icon: string;
  disabled: boolean;
  onClick: () => void;
  hidden?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`flex h-10 w-10 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:text-on-surface disabled:opacity-30 ${
        hidden ? "invisible" : ""
      }`}
    >
      <Icon name={icon} className="text-[26px]" filled />
    </button>
  );
}
