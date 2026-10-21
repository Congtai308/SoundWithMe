"use client";

import { useState } from "react";
import Link from "next/link";
import type { Friend, FriendRequest, UserSearchResult } from "@soundwithme/types";
import { useCurrentUser } from "@/features/auth/hooks/use-auth";
import {
  useAcceptFriendRequest,
  useDismissFriendRequest,
  useFriends,
  useSendFriendRequest,
  useUnfriend,
  useUserSearch,
} from "@/features/friends/hooks/use-friends";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icon";
import { StatePanel, primaryPillClass } from "@/components/ui/StatePanel";
import { showToast } from "@/components/ui/Toaster";
import { ApiClientError } from "@/services/api-client";

/** Friends & Presence: who's online, what they're listening to, and requests. */
export default function FriendsPage() {
  const { data: user, isLoading } = useCurrentUser();
  const friends = useFriends({ enabled: Boolean(user) });

  if (!isLoading && !user) {
    return (
      <div className="px-md py-2xl md:px-[40px]">
        <StatePanel
          icon="group"
          title="Sign in to see your friends"
          body="Add friends, see who's online and jump into the room they're listening in."
          action={
            <Link href="/login" className={primaryPillClass}>
              Sign in
            </Link>
          }
        />
      </div>
    );
  }

  const data = friends.data;
  const listening = data?.friends.filter((f) => f.activity) ?? [];
  const others = data?.friends.filter((f) => !f.activity) ?? [];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-lg px-md py-lg md:px-lg">
      <header className="flex flex-col gap-1">
        <span className="font-technical text-label-mono-sm uppercase text-secondary">Friends &amp; Presence</span>
        <h1 className="text-headline-xl text-on-surface">Your people</h1>
        {user && (
          <p className="text-body-md text-on-surface-variant">
            Your username is <span className="font-technical text-on-surface">@{user.username}</span> — share it so friends can add you.
          </p>
        )}
      </header>

      <AddFriend />

      {data && data.incoming.length > 0 && (
        <Section title={`Requests · ${data.incoming.length}`} icon="person_add">
          {data.incoming.map((request) => (
            <RequestRow key={request.id} request={request} />
          ))}
        </Section>
      )}

      {friends.isLoading ? (
        <div className="h-40 animate-pulse rounded-lg bg-surface-container-low" />
      ) : friends.isError ? (
        <StatePanel tone="error" icon="error" title="Couldn't load your friends" body="Check your connection and try again." />
      ) : data && data.friends.length === 0 ? (
        <StatePanel icon="diversity_3" title="No friends yet" body="Search for someone by name or username above and send a request." />
      ) : (
        <>
          {listening.length > 0 && (
            <Section title={`Listening now · ${listening.length}`} icon="graphic_eq">
              {listening.map((friend) => (
                <FriendRow key={friend.user.id} friend={friend} />
              ))}
            </Section>
          )}
          {others.length > 0 && (
            <Section title={`Friends · ${data?.friends.length ?? 0}`} icon="group">
              {others.map((friend) => (
                <FriendRow key={friend.user.id} friend={friend} />
              ))}
            </Section>
          )}
        </>
      )}

      {data && data.outgoing.length > 0 && (
        <Section title={`Sent · ${data.outgoing.length}`} icon="schedule_send">
          {data.outgoing.map((request) => (
            <RequestRow key={request.id} request={request} />
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-xs">
      <h2 className="flex items-center gap-xs text-headline-sm text-on-surface">
        <Icon name={icon} className="text-[20px] text-secondary" />
        {title}
      </h2>
      <ul className="flex flex-col gap-1.5">{children}</ul>
    </section>
  );
}

function failed(title: string) {
  return (error: unknown) =>
    showToast({ icon: "error", tone: "error", title, body: error instanceof ApiClientError ? error.message : undefined });
}

function AddFriend() {
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query, 300);
  const search = useUserSearch(debounced);
  const send = useSendFriendRequest();

  return (
    <section className="flex flex-col gap-xs rounded-lg bg-surface-container-low p-md">
      <label htmlFor="friend-search" className="font-technical text-label-mono-sm uppercase text-outline">
        Add a friend
      </label>
      <div className="relative">
        <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-outline" />
        <input
          id="friend-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Name or username…"
          maxLength={40}
          autoComplete="off"
          className="w-full rounded-full bg-surface-container py-xs pl-10 pr-md text-body-md text-on-surface placeholder:text-outline focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      {debounced.trim().length >= 2 && (
        <ul className="flex flex-col gap-1">
          {search.isLoading && <li className="px-sm py-xs text-body-sm text-on-surface-variant">Searching…</li>}
          {search.data?.length === 0 && <li className="px-sm py-xs text-body-sm text-on-surface-variant">No one found.</li>}
          {search.data?.map((result) => (
            <SearchRow
              key={result.user.id}
              result={result}
              busy={send.isPending}
              onAdd={() =>
                send.mutate(result.user.username, {
                  onSuccess: ({ status }) =>
                    showToast({
                      icon: status === "accepted" ? "how_to_reg" : "send",
                      tone: "success",
                      title: status === "accepted" ? `You and ${result.user.displayName} are friends` : "Request sent",
                    }),
                  onError: failed("Couldn't send the request"),
                })
              }
            />
          ))}
        </ul>
      )}
    </section>
  );
}

const RELATION_LABEL: Record<UserSearchResult["relation"], string | null> = {
  self: "You",
  friend: "Friends",
  outgoing: "Requested",
  incoming: "Wants to be friends",
  none: null,
};

function SearchRow({ result, busy, onAdd }: { result: UserSearchResult; busy: boolean; onAdd: () => void }) {
  const label = RELATION_LABEL[result.relation];
  return (
    <li className="flex items-center gap-sm rounded-md bg-white/[0.03] p-sm">
      <Avatar name={result.user.displayName} src={result.user.avatarUrl} size={36} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-body-md font-semibold text-on-surface">{result.user.displayName}</p>
        <p className="font-technical truncate text-label-mono-sm text-outline">
          @{result.user.username}
          {result.user.isGuest && " · guest"}
        </p>
      </div>
      {result.relation === "none" || result.relation === "incoming" ? (
        <button
          type="button"
          disabled={busy}
          onClick={onAdd}
          className="flex items-center gap-1 rounded-full bg-primary-container px-sm py-1 text-body-sm font-semibold text-on-primary-container disabled:opacity-50"
        >
          <Icon name={result.relation === "incoming" ? "how_to_reg" : "person_add"} className="text-[16px]" />
          {result.relation === "incoming" ? "Accept" : "Add"}
        </button>
      ) : (
        label && <span className="text-body-sm text-on-surface-variant">{label}</span>
      )}
    </li>
  );
}

function RequestRow({ request }: { request: FriendRequest }) {
  const accept = useAcceptFriendRequest();
  const dismiss = useDismissFriendRequest();
  const incoming = request.direction === "incoming";
  return (
    <li className="flex items-center gap-sm rounded-md bg-surface-container-low p-sm">
      <Avatar name={request.user.displayName} src={request.user.avatarUrl} size={40} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-body-md font-semibold text-on-surface">{request.user.displayName}</p>
        <p className="font-technical truncate text-label-mono-sm text-outline">@{request.user.username}</p>
      </div>
      {incoming && (
        <button
          type="button"
          disabled={accept.isPending}
          onClick={() => accept.mutate(request.id, { onError: failed("Couldn't accept") })}
          className="flex items-center gap-1 rounded-full bg-primary-container px-sm py-1 text-body-sm font-semibold text-on-primary-container disabled:opacity-50"
        >
          <Icon name="check" className="text-[16px]" /> Accept
        </button>
      )}
      <button
        type="button"
        disabled={dismiss.isPending}
        onClick={() => dismiss.mutate(request.id, { onError: failed("Couldn't update the request") })}
        className="rounded-full px-sm py-1 text-body-sm text-on-surface-variant hover:bg-white/[0.06] hover:text-on-surface disabled:opacity-50"
      >
        {incoming ? "Decline" : "Cancel"}
      </button>
    </li>
  );
}

function FriendRow({ friend }: { friend: Friend }) {
  const unfriend = useUnfriend();
  const [confirm, setConfirm] = useState(false);
  const { user, online, activity } = friend;
  return (
    <li className="flex flex-wrap items-center gap-sm rounded-md bg-surface-container-low p-sm">
      <Avatar name={user.displayName} src={user.avatarUrl} size={44} online={online} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-body-md font-semibold text-on-surface">{user.displayName}</p>
        {activity ? (
          <p className="flex items-center gap-1 truncate text-body-sm text-tertiary">
            <Icon name="graphic_eq" className="text-[16px]" />
            {activity.roomName ? (
              <>
                In “{activity.roomName}”
                {activity.trackTitle && <span className="text-on-surface-variant"> · {activity.trackTitle}</span>}
              </>
            ) : (
              "In a private room"
            )}
          </p>
        ) : (
          <p className="text-body-sm text-on-surface-variant">{online ? "Online" : "Offline"}</p>
        )}
      </div>
      {activity?.canJoin && (
        <Link
          href={`/room/${activity.roomId}`}
          className="flex items-center gap-1 rounded-full bg-primary-container px-sm py-1 text-body-sm font-semibold text-on-primary-container"
        >
          <Icon name="headphones" className="text-[16px]" /> Join
        </Link>
      )}
      {confirm ? (
        <span className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => unfriend.mutate(user.id, { onError: failed("Couldn't remove friend") })}
            className="rounded-full px-sm py-1 text-body-sm text-error hover:bg-error/10"
          >
            Remove
          </button>
          <button type="button" onClick={() => setConfirm(false)} className="rounded-full px-sm py-1 text-body-sm text-on-surface-variant">
            Keep
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setConfirm(true)}
          aria-label={`Remove ${user.displayName} from friends`}
          title="Remove friend"
          className="rounded-full p-1 text-outline hover:text-error"
        >
          <Icon name="person_remove" className="text-[18px]" />
        </button>
      )}
    </li>
  );
}
