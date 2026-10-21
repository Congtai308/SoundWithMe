import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import type { Friend, FriendActivity, FriendsOverview } from "@soundwithme/types";
import { RoomDocument } from "../../database/mongodb/models/room.schema";
import { PresenceService } from "../presence/presence.service";
import { MusicService } from "../music/music.service";
import { FriendshipsService } from "./friendships.service";

/**
 * The Friends page: your friends with who's online and what they're
 * listening to, plus pending requests. Reads rooms straight from their
 * collection (not RoomsService), because RoomsService itself depends on
 * friendships for friends-only rooms.
 */
@Injectable()
export class FriendsService {
  private readonly logger = new Logger(FriendsService.name);

  constructor(
    @InjectModel(RoomDocument.name) private readonly roomModel: Model<RoomDocument>,
    private readonly friendships: FriendshipsService,
    private readonly presence: PresenceService,
    private readonly musicService: MusicService,
  ) {}

  async overview(userId: string): Promise<FriendsOverview> {
    const [links, requests] = await Promise.all([
      this.friendships.friendsOf(userId),
      this.friendships.pendingRequests(userId),
    ]);
    const ids = links.map((l) => l.userId);
    const [users, presence] = await Promise.all([this.friendships.publicUsers(ids), this.presence.getMany(ids)]);

    const roomIds = [...new Set([...presence.values()].flatMap((p) => p.roomIds))];
    const rooms = roomIds.length
      ? await this.roomModel.find({ _id: { $in: roomIds }, status: "active" }).exec()
      : [];
    const roomById = new Map(rooms.map((room) => [room.id as string, room]));
    const trackTitles = await this.trackTitles(rooms.map((r) => r.currentTrackId).filter((id): id is string => Boolean(id)));

    const friends: Friend[] = [];
    for (const link of links) {
      const user = users.get(link.userId);
      if (!user) continue;
      const state = presence.get(link.userId);
      const room = state?.roomIds.map((id) => roomById.get(id)).find(Boolean);
      friends.push({
        user,
        online: state?.online ?? false,
        activity: room ? this.activity(room, trackTitles) : null,
        friendsSince: link.since.toISOString(),
      });
    }

    // Listening now first, then online, then everyone else by name.
    const rank = (f: Friend) => (f.activity ? 0 : f.online ? 1 : 2);
    friends.sort((a, b) => rank(a) - rank(b) || a.user.displayName.localeCompare(b.user.displayName));
    return { friends, incoming: requests.incoming, outgoing: requests.outgoing };
  }

  private activity(room: RoomDocument, titles: Map<string, { title: string; artist: string }>): FriendActivity {
    // A friend's private room stays private: you learn they're in one, nothing more.
    const isPrivate = room.type === "private";
    const track = !isPrivate && room.currentTrackId ? titles.get(room.currentTrackId) : undefined;
    return {
      roomId: room.id,
      roomName: isPrivate ? null : room.name,
      roomType: room.type,
      canJoin: !isPrivate,
      trackTitle: track?.title ?? null,
      trackArtist: track?.artist ?? null,
    };
  }

  /** Cached catalog lookups; a failing provider only costs the song title. */
  private async trackTitles(trackIds: string[]): Promise<Map<string, { title: string; artist: string }>> {
    const titles = new Map<string, { title: string; artist: string }>();
    await Promise.all(
      [...new Set(trackIds)].map(async (trackId) => {
        try {
          const track = await this.musicService.getTrackWithArtist(trackId);
          if (track) titles.set(trackId, { title: track.title, artist: track.artistName });
        } catch (error: unknown) {
          this.logger.debug(`No title for ${trackId}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }),
    );
    return titles;
  }
}
