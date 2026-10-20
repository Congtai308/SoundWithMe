"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode, type RefObject } from "react";
import type { Room, TrackWithArtist } from "@soundwithme/types";
import { useCurrentUser } from "@/features/auth/hooks/use-auth";
import { useTrack } from "@/features/music/hooks/use-track";
import { useReportListen } from "@/features/music/hooks/use-listening";
import { usePlayerStore } from "@/features/player/stores/player-store";
import { useAudioSync } from "@/features/player/hooks/use-audio-sync";
import { PlayerHost } from "@/features/player/components/PlayerHost";
import { loadYouTubeApi } from "@/features/player/services/youtube-engine";
import { useRoom } from "../hooks/use-rooms";
import { useRoomSocket, type RoomCommands } from "../hooks/use-room-socket";
import { useKaraoke } from "@/features/karaoke/hooks/use-karaoke";
import { useRoomLiveStore } from "../stores/room-live-store";
import { useRoomSessionStore } from "../stores/room-session-store";
import { roomPermissions, type RoomPermissions } from "../permissions";
import { useRecentTracks } from "../stores/recent-tracks";
import { MiniPlayer } from "./MiniPlayer";

/** Re-sends of "the song ended" if the room hasn't moved on yet. */
const ENDED_RETRY_DELAYS_MS = [4_000, 9_000];

export interface RoomSession {
  /** The room this tab is listening to, or null. */
  roomId: string | null;
  room: Room | undefined;
  track: TrackWithArtist | undefined;
  isTrackLoading: boolean;
  isHost: boolean;
  canControl: boolean;
  canAdd: boolean;
  permissions: RoomPermissions;
  commands: RoomCommands;
  /** Call from a click handler: browsers only allow sound after a user gesture. */
  unlock: () => void;
}

const RoomSessionContext = createContext<RoomSession | null>(null);

export function useRoomSession(): RoomSession {
  const session = useContext(RoomSessionContext);
  if (!session) throw new Error("useRoomSession must be used inside RoomSessionProvider");
  return session;
}

/**
 * Owns the realtime connection and the synced player for the active room at
 * the layout level, so playback survives navigation (the mini player keeps
 * it visible). Pages only enter/exit the session.
 */
export function RoomSessionProvider({ children }: { children: ReactNode }) {
  const activeRoomId = useRoomSessionStore((s) => s.activeRoomId);
  const { data: user, isLoading: isUserLoading } = useCurrentUser();
  const roomQuery = useRoom(activeRoomId ?? "");
  const room = activeRoomId ? roomQuery.data : undefined;
  const isActive = room?.status === "active";

  const commands = useRoomSocket(activeRoomId ?? "", activeRoomId && isActive ? user?.id : undefined);
  const membership = useRoomLiveStore((s) => s.membership);
  // Karaoke voice follows the session too, so singing survives browsing away.
  useKaraoke(activeRoomId && isActive ? activeRoomId : null, user?.id, membership === "member");
  const currentTrackId = usePlayerStore((s) => s.currentTrackId);
  const trackQuery = useTrack(activeRoomId ? currentTrackId : null);
  const track = activeRoomId ? trackQuery.data : undefined;

  const permissions = useMemo(() => roomPermissions(room, user?.id), [room, user?.id]);
  const { isHost, canControl, canAdd } = permissions;

  const playerContainerRef = useRef<HTMLDivElement>(null);
  const unlockRef = useRef<(() => void) | null>(null);
  const unlock = useCallback(() => unlockRef.current?.(), []);

  const onTrackEnded = useCallback(
    (fromVersion: number) => {
      // Everyone asks: the room keeps going when the host's tab is asleep. The server lets one through.
      if (useRoomLiveStore.getState().queue.length > 0) {
        commands.next(fromVersion, true);
        // This tab may finish a few seconds before the server's clock agrees: ask again while nothing changed.
        for (const delay of ENDED_RETRY_DELAYS_MS) {
          window.setTimeout(() => {
            if (usePlayerStore.getState().stateVersion === fromVersion) commands.next(fromVersion, true);
          }, delay);
        }
      } else if (canControl) {
        commands.pause(usePlayerStore.getState().durationMs);
      }
    },
    [canControl, commands],
  );

  // Fetch the YouTube player script while the room state and track details are
  // still on their way, so a late joiner's player boots in parallel with them.
  useEffect(() => {
    if (activeRoomId) loadYouTubeApi().catch(() => undefined); // load() reports failures properly
  }, [activeRoomId]);

  // A closed room, being removed from it, or signing out ends the session.
  const exit = useRoomSessionStore((s) => s.exit);
  const closedOrKicked = useRoomLiveStore((s) => s.closedReason !== null || s.kicked);
  useEffect(() => {
    if (!activeRoomId) return;
    if ((room && room.status !== "active") || roomQuery.isError || closedOrKicked || (!isUserLoading && !user)) exit();
  }, [activeRoomId, room, roomQuery.isError, closedOrKicked, isUserLoading, user, exit]);

  const pushRecent = useRecentTracks((s) => s.push);
  useEffect(() => {
    if (track && membership === "member") pushRecent(track);
  }, [track, membership, pushRecent]);

  // Songs heard in rooms teach the taste profile behind Home's suggestions.
  const isHearing = usePlayerStore((s) => s.isPlaying && !s.needsUserGesture && !s.isMuted);
  useReportListen(membership === "member" ? track?.id : null, isHearing);

  const session = useMemo<RoomSession>(
    () => ({
      roomId: activeRoomId,
      room,
      track,
      isTrackLoading: trackQuery.isLoading,
      isHost,
      canControl,
      canAdd,
      permissions,
      commands,
      unlock,
    }),
    [activeRoomId, room, track, trackQuery.isLoading, isHost, canControl, canAdd, permissions, commands, unlock],
  );

  return (
    <RoomSessionContext.Provider value={session}>
      {children}
      <PlayerHost containerRef={playerContainerRef} onUnlock={unlock} />
      {/* Keyed per room so leaving a room tears its player down. */}
      {activeRoomId && isActive && (
        <SessionAudio
          key={activeRoomId}
          containerRef={playerContainerRef}
          track={track}
          onTrackEnded={onTrackEnded}
          unlockRef={unlockRef}
        />
      )}
      <MiniPlayer />
    </RoomSessionContext.Provider>
  );
}

function SessionAudio({
  containerRef,
  track,
  onTrackEnded,
  unlockRef,
}: {
  containerRef: RefObject<HTMLDivElement>;
  track: TrackWithArtist | undefined;
  onTrackEnded: (fromVersion: number) => void;
  unlockRef: { current: (() => void) | null };
}) {
  const { unlock } = useAudioSync({ containerRef, track, onTrackEnded });
  useEffect(() => {
    unlockRef.current = unlock;
    return () => {
      unlockRef.current = null;
    };
  }, [unlock, unlockRef]);
  return null;
}
