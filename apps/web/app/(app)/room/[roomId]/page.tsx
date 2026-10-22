"use client";

import { useEffect, useRef, useState } from "react";
import { takePendingPlay } from "@/features/rooms/pending-play";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ApiClientError } from "@/services/api-client";
import { useCurrentUser, useGuestLogin } from "@/features/auth/hooks/use-auth";
import { useJoinRoom, useLeaveRoom, useRoom } from "@/features/rooms/hooks/use-rooms";
import { useRoomLiveStore } from "@/features/rooms/stores/room-live-store";
import { useRoomSessionStore } from "@/features/rooms/stores/room-session-store";
import { useRoomSession } from "@/features/rooms/components/RoomSessionProvider";
import { usePlayerStore } from "@/features/player/stores/player-store";
import { RoomHeader } from "@/features/rooms/components/RoomHeader";
import { RoomQueueSidebar } from "@/features/rooms/components/RoomQueueSidebar";
import { RoomMainStage } from "@/features/rooms/components/RoomMainStage";
import { RoomChatSidebar } from "@/features/rooms/components/RoomChatSidebar";
import { AddSongDialog } from "@/features/rooms/components/AddSongDialog";
import { JoinRoomGate } from "@/features/rooms/components/JoinRoomGate";
import { RoomAmbience } from "@/features/rooms/components/RoomAmbience";
import { RoomPeopleDialog } from "@/features/rooms/components/RoomPeopleDialog";
import { InviteFriendsDialog } from "@/features/rooms/components/InviteFriendsDialog";
import { rememberInvite } from "@/features/rooms/stores/room-invites";
import { roomPermissions } from "@/features/rooms/permissions";
import { Icon } from "@/components/ui/Icon";
import { StatePanel, primaryPillClass, ghostPillClass } from "@/components/ui/StatePanel";

const ERROR_TOAST_MS = 4_000;
type MobilePanel = "chat" | "queue";

/** Name for the guest account a signed-out visitor gets on opening a room. */
function guestName(): string {
  return `Khách ${Math.floor(1000 + Math.random() * 9000)}`;
}

/**
 * Listening room — 3-column studio: queue · cinema stage · listeners & chat
 * (TASK-04). The socket and the synced player live in RoomSessionProvider
 * so the music continues in the mini player when the user browses away.
 */
export default function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const router = useRouter();
  // A private room's invite link: remember the code before the room is fetched.
  const inviteParam = useSearchParams().get("invite");
  if (inviteParam) rememberInvite(roomId, inviteParam);
  const { data: user, isLoading: isUserLoading } = useCurrentUser();
  const roomQuery = useRoom(roomId);
  const room = roomQuery.data;
  const isActive = room?.status === "active";

  const session = useRoomSession();
  const enterSession = useRoomSessionStore((s) => s.enter);
  const exitSession = useRoomSessionStore((s) => s.exit);
  const inSession = session.roomId === roomId;
  const { commands } = session;

  const liveMembership = useRoomLiveStore((s) => s.membership);
  const liveRoomId = useRoomLiveStore((s) => s.roomId);
  const membership = inSession && liveRoomId === roomId ? liveMembership : "checking";
  const connection = useRoomLiveStore((s) => s.connection);
  const queue = useRoomLiveStore((s) => s.queue);
  const listeners = useRoomLiveStore((s) => s.listeners);
  const lastError = useRoomLiveStore((s) => s.lastError);
  const setError = useRoomLiveStore((s) => s.setError);

  const serverState = usePlayerStore((s) => s.serverState);
  const isPlaying = usePlayerStore((s) => s.isPlaying);

  const { isHost, isDj, canControl, canAdd, canManage } = roomPermissions(room, user?.id);
  const closedReason = useRoomLiveStore((s) => s.closedReason);
  const kicked = useRoomLiveStore((s) => s.kicked);

  const joinRoom = useJoinRoom(roomId);
  const leaveRoom = useLeaveRoom(roomId);
  const guestLogin = useGuestLogin();
  const [showAddSong, setShowAddSong] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("chat");
  const [dialog, setDialog] = useState<"people" | "invite" | null>(null);

  // Opening a room makes it this tab's session (replacing any other room).
  useEffect(() => {
    if (user && isActive) enterSession(roomId);
  }, [user, isActive, roomId, enterSession]);

  // Opening a room signed out: a guest account, no questions asked.
  const guestTriedRef = useRef(false);
  const refetchRoom = roomQuery.refetch;
  useEffect(() => {
    if (isUserLoading || user || guestTriedRef.current) return;
    guestTriedRef.current = true;
    guestLogin.mutate({ displayName: guestName() }, { onSuccess: () => void refetchRoom() });
  }, [isUserLoading, user, guestLogin, refetchRoom]);

  // Lobby rooms are open to all: walk straight in instead of showing the join screen.
  const autoJoinTriedRef = useRef(false);
  const autoJoining = membership === "not-member" && Boolean(room?.topic) && !joinRoom.isError;
  useEffect(() => {
    if (!autoJoining || autoJoinTriedRef.current) return;
    autoJoinTriedRef.current = true;
    joinRoom.mutate(
      {},
      {
        onSuccess: () => {
          useRoomLiveStore.getState().setMembership("checking");
          commands.rejoin();
        },
      },
    );
  }, [autoJoining, joinRoom, commands]);

  // Browsing away keeps the session only if we actually got in.
  useEffect(
    () => () => {
      const live = useRoomLiveStore.getState();
      const stillOurs = useRoomSessionStore.getState().activeRoomId === roomId;
      if (stillOurs && !(live.roomId === roomId && live.membership === "member")) exitSession();
    },
    [roomId, exitSession],
  );

  useEffect(() => {
    if (!lastError) return;
    const timer = window.setTimeout(() => setError(null), ERROR_TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [lastError, setError]);

  // Play the song picked on the Music page once we're in (see pending-play.ts).
  const playHandledRef = useRef(false);
  useEffect(() => {
    if (playHandledRef.current || membership !== "member" || !canAdd) return;
    playHandledRef.current = true;
    const trackId = takePendingPlay(roomId);
    if (!trackId) return;
    if (canControl) commands.changeTrack(trackId);
    else commands.queueAdd(trackId);
  }, [membership, canAdd, canControl, commands, roomId]);

  if (isUserLoading || roomQuery.isLoading || (!user && !guestLogin.isError)) return <StudioSkeleton />;

  if (!user) {
    return (
      <PageFrame>
        <StatePanel
          icon="lock"
          title="Sign in to join this room"
          body="Rooms are for signed-in listeners. A Fast Pass gets you in with just a name."
          action={
            <Link href="/login" className={primaryPillClass}>
              Sign in or use a Fast Pass
            </Link>
          }
        />
      </PageFrame>
    );
  }

  const lockedError = roomQuery.error instanceof ApiClientError && roomQuery.error.code === "ROOM_LOCKED" ? roomQuery.error : null;
  if (lockedError) {
    return (
      <PageFrame>
        <JoinRoomGate
          room={null}
          needsPasscode={lockedError.details.hasPasscode === true}
          isJoining={joinRoom.isPending}
          error={joinRoom.error}
          onJoin={(passcode) => joinRoom.mutate({ passcode })}
        />
      </PageFrame>
    );
  }

  if (kicked) {
    return (
      <PageFrame>
        <StatePanel
          tone="error"
          icon="person_remove"
          title="You were removed from this room"
          body="The host removed you, so you can't rejoin this room."
          action={
            <Link href="/rooms" className={ghostPillClass}>
              Browse live rooms
            </Link>
          }
        />
      </PageFrame>
    );
  }

  if (roomQuery.isError || !room) {
    return (
      <PageFrame>
        <StatePanel
          tone="error"
          icon="sensors_off"
          title="This room isn't available"
          body={roomQuery.error instanceof ApiClientError ? roomQuery.error.message : "It may have been removed, or you may not have access."}
          action={
            <Link href="/rooms" className={ghostPillClass}>
              Browse live rooms
            </Link>
          }
        />
      </PageFrame>
    );
  }

  if (!isActive || closedReason) {
    return (
      <PageFrame>
        <StatePanel
          icon="podcasts"
          title="This room has ended"
          body={
            closedReason === "inactive"
              ? "It ended after 30 minutes with nobody in it. Start your own or find another live room."
              : "The host closed this session. Start your own or find another room that's live."
          }
          action={
            <Link href="/rooms" className={primaryPillClass}>
              Find a live room
            </Link>
          }
        />
      </PageFrame>
    );
  }

  if (autoJoining) return <StudioSkeleton />;

  if (membership === "not-member") {
    return (
      <PageFrame>
        <JoinRoomGate
          room={room}
          needsPasscode={room.type === "private" && room.hasPasscode && !inviteParam}
          isJoining={joinRoom.isPending}
          error={joinRoom.error}
          onJoin={(passcode) =>
            joinRoom.mutate({ passcode }, {
              onSuccess: () => {
                useRoomLiveStore.getState().setMembership("checking");
                commands.rejoin();
              },
            })
          }
        />
      </PageFrame>
    );
  }

  const leave = () =>
    leaveRoom.mutate(undefined, {
      onSuccess: () => {
        exitSession();
        router.push("/rooms");
      },
    });

  const queueSidebar = (
    <RoomQueueSidebar
      queue={queue}
      nowPlaying={session.track}
      isPlaying={isPlaying}
      currentUserId={user.id}
      canManage={canManage}
      canAdd={canAdd}
      canControl={canControl}
      canStartQueue={!serverState && queue.length > 0}
      onAddSong={() => setShowAddSong(true)}
      onRemove={commands.queueRemove}
      onVote={commands.queueVote}
      onStartQueue={() => commands.next(0)}
    />
  );

  const chatSidebar = (
    <RoomChatSidebar
      roomId={room.id}
      hostId={room.hostId}
      currentUserId={user.id}
      listeners={listeners}
      chatEnabled={room.settings.chatEnabled}
      isMuted={room.mutedUserIds.includes(user.id)}
      reactionsEnabled={room.settings.reactionsEnabled}
      isConnected={connection === "connected"}
      onSendMessage={commands.sendChat}
      onReact={commands.sendReaction}
    />
  );

  return (
    <div className="relative flex flex-col gap-md px-md py-md md:h-[calc(100vh-4rem)] md:px-lg">
      <RoomAmbience artworkUrl={session.track?.artworkUrl ?? null} />

      <RoomHeader
        room={room}
        isHost={isHost}
        isDj={isDj}
        listenerCount={listeners.length}
        connection={connection}
        isLeaving={leaveRoom.isPending}
        onLeave={leave}
        onOpenPeople={() => setDialog("people")}
        onOpenInvite={() => setDialog("invite")}
      />

      {(lastError || leaveRoom.isError) && (
        <div
          role="alert"
          className="fixed left-1/2 top-20 z-[55] flex -translate-x-1/2 items-center gap-xs rounded-full border border-white/[0.16] bg-[rgba(30,41,59,0.92)] px-md py-xs text-body-sm text-on-surface shadow-xl backdrop-blur-xl"
        >
          <Icon name="error" className="text-[18px] text-error" />
          {lastError?.message ?? "Couldn't leave the room. Try again."}
        </div>
      )}

      <div className="relative grid min-h-0 flex-1 grid-cols-1 gap-md md:grid-cols-[clamp(16rem,20vw,21rem)_minmax(0,1fr)_clamp(16rem,20vw,21rem)] lg:grid-cols-[clamp(18rem,22vw,26rem)_minmax(0,1fr)_clamp(18rem,22vw,26rem)]">
        <div className="hidden min-h-0 md:flex md:flex-col">{queueSidebar}</div>

        <div className="scrollbar-none min-h-0 md:overflow-y-auto">
          <RoomMainStage
            track={session.track}
            isTrackLoading={session.isTrackLoading}
            canControl={canControl}
            canAdd={canAdd}
            hasQueue={queue.length > 0}
            onPlay={commands.play}
            onPause={commands.pause}
            onSeek={commands.seek}
            onNext={() => commands.next(usePlayerStore.getState().stateVersion)}
            onAddSong={() => setShowAddSong(true)}
            currentUserId={user.id}
            onSkipVote={commands.skipVote}
          />
        </div>

        <div className="hidden min-h-0 md:flex md:flex-col">{chatSidebar}</div>

        {/* Below 768px the side columns become tabs under the stage. */}
        <div className="flex flex-col gap-sm md:hidden">
          <div role="tablist" aria-label="Room panels" className="flex rounded-full bg-surface-container p-1">
            {(["chat", "queue"] as const).map((panel) => (
              <button
                key={panel}
                type="button"
                role="tab"
                aria-selected={mobilePanel === panel}
                onClick={() => setMobilePanel(panel)}
                className={`flex-1 rounded-full py-1.5 text-headline-sm capitalize transition-colors ${
                  mobilePanel === panel ? "bg-primary-container text-on-primary-container" : "text-on-surface-variant"
                }`}
              >
                {panel === "chat" ? `Chat · ${listeners.length}` : `Queue · ${queue.length}`}
              </button>
            ))}
          </div>
          <div className="flex h-[70vh] flex-col">{mobilePanel === "chat" ? chatSidebar : queueSidebar}</div>
        </div>
      </div>

      {dialog === "people" && (
        <RoomPeopleDialog
          room={room}
          listeners={listeners}
          currentUserId={user.id}
          commands={commands}
          onInvite={() => setDialog("invite")}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "invite" && (
        <InviteFriendsDialog room={room} listeners={listeners} currentUserId={user.id} commands={commands} onClose={() => setDialog(null)} />
      )}

      {showAddSong && (
        <AddSongDialog
          canPlayNow={canControl}
          onQueue={commands.queueAdd}
          onQueueMany={commands.queueAddMany}
          onPlayNow={commands.changeTrack}
          onClose={() => setShowAddSong(false)}
        />
      )}
    </div>
  );
}

function PageFrame({ children }: { children: React.ReactNode }) {
  return <div className="px-md py-2xl md:px-[40px]">{children}</div>;
}

function StudioSkeleton() {
  return (
    <div className="flex flex-col gap-md px-md py-md md:h-[calc(100vh-4rem)] md:px-lg" aria-busy="true">
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-md md:grid-cols-[clamp(16rem,20vw,21rem)_minmax(0,1fr)_clamp(16rem,20vw,21rem)] lg:grid-cols-[clamp(18rem,22vw,26rem)_minmax(0,1fr)_clamp(18rem,22vw,26rem)]">
        <div className="hidden animate-pulse rounded-lg bg-surface-container-low md:block" />
        <div className="flex flex-col gap-md">
          <div className="h-[300px] animate-pulse rounded-lg bg-surface-container-low" />
          <div className="h-24 animate-pulse rounded-lg bg-surface-container-low" />
        </div>
        <div className="hidden animate-pulse rounded-lg bg-surface-container-low md:block" />
      </div>
    </div>
  );
}
