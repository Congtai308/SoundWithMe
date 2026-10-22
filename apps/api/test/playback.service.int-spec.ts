import { randomUUID } from "crypto";
import { ConflictException, ForbiddenException, HttpException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import Redis from "ioredis";
import type { Room } from "@soundwithme/types";
import { ERROR_CODES, type ErrorCode } from "@soundwithme/constants";
import { RedisService } from "../src/database/redis/redis.service";
import { REDIS_CLIENT, REDIS_SUBSCRIBER } from "../src/database/redis/redis.constants";
import { RoomsService } from "../src/modules/rooms/rooms.service";
import { PlaybackService } from "../src/modules/playback/playback.service";
import { MusicService } from "../src/modules/music/music.service";
import { AppEventsService } from "../src/common/events/app-events.service";

/**
 * Integration test against a real Redis (docker-compose `redis` service).
 * RoomsService is stubbed so permission rules are tested without MongoDB.
 */
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const DAY_SECONDS = 60 * 60 * 24;

const HOST_ID = "user-host";
const MEMBER_ID = "user-member";
const OUTSIDER_ID = "user-outsider";

function buildRoom(overrides: Partial<Room> = {}): Room {
  return {
    id: "room-under-test",
    name: "Late Night Vibes",
    description: null,
    coverUrl: null,
    hostId: HOST_ID,
    type: "public",
    status: "active",
    settings: {
      whoCanControlPlayback: "host",
      whoCanAddSongs: "everyone",
      chatEnabled: true,
      reactionsEnabled: true,
      songRequestsEnabled: true,
      maxListeners: 50,
      maxSingers: 2,
    },
    currentTrackId: null,
    memberCount: 2,
    djIds: [],
    mutedUserIds: [],
    hasPasscode: false,
    inviteCode: null,
    createdAt: new Date().toISOString(),
    closedAt: null,
    topic: null,
    listenerCount: 2,
    ...overrides,
  };
}

async function expectErrorCode(promise: Promise<unknown>, code: ErrorCode): Promise<void> {
  const error: unknown = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  if (!(error instanceof HttpException)) {
    throw new Error(`Expected HttpException with code ${code}, got: ${String(error)}`);
  }
  expect(error.getResponse()).toMatchObject({ success: false, error: { code } });
}

describe("PlaybackService (Redis integration)", () => {
  let client: Redis;
  let service: PlaybackService;
  const usedKeys = new Set<string>();
  // Mirrors RoomsService: closed rooms and non-members are refused before permissions are checked.
  let stubRoom: Room = buildRoom();
  let stubIsMember = false;
  const roomsStub = {
    getRoomForActiveMember: jest.fn(async (_roomId: string, userId: string): Promise<Room> => {
      if (stubRoom.status === "closed") {
        throw new ConflictException({ success: false, error: { code: ERROR_CODES.ROOM_CLOSED, message: "ended" } });
      }
      if (stubRoom.hostId !== userId && !stubIsMember) {
        throw new ForbiddenException({ success: false, error: { code: ERROR_CODES.NOT_ROOM_MEMBER, message: "join" } });
      }
      return stubRoom;
    }),
    canControlPlayback: (room: Room, userId: string): boolean =>
      room.hostId === userId || room.djIds.includes(userId) || room.settings.whoCanControlPlayback === "everyone",
    setCurrentTrack: jest.fn(),
  };
  const useRoom = (room: Room, isMember: boolean): void => {
    stubRoom = room;
    stubIsMember = isMember;
  };

  const newRoomId = (): string => {
    const roomId = `test-${randomUUID()}`;
    usedKeys.add(`room:${roomId}:playback`);
    return roomId;
  };

  beforeAll(async () => {
    client = new Redis(REDIS_URL, { maxRetriesPerRequest: 1 });
    await client.ping();

    const moduleRef = await Test.createTestingModule({
      providers: [
        PlaybackService,
        RedisService,
        { provide: REDIS_CLIENT, useValue: client },
        // PlaybackService never subscribes, so the same connection can stand in.
        { provide: REDIS_SUBSCRIBER, useValue: client },
        { provide: RoomsService, useValue: roomsStub },
        { provide: MusicService, useValue: { getTrack: jest.fn() } },
        AppEventsService,
      ],
    }).compile();

    service = moduleRef.get(PlaybackService);
  });

  afterEach(() => {
    roomsStub.getRoomForActiveMember.mockClear();
    useRoom(buildRoom(), false);
  });

  afterAll(async () => {
    if (usedKeys.size > 0) {
      await client.del(...usedKeys);
    }
    await client.quit();
  });

  describe("getPlaybackState", () => {
    it("returns null when the room has never played anything", async () => {
      await expect(service.getPlaybackState(newRoomId())).resolves.toBeNull();
    });

    it("rejects corrupted data stored under the key", async () => {
      const roomId = newRoomId();
      await client.set(`room:${roomId}:playback`, "{not json", "EX", 60);
      await expectErrorCode(service.getPlaybackState(roomId), ERROR_CODES.INTERNAL_ERROR);
    });
  });

  describe("initOrUpdatePlaybackState", () => {
    it("refuses to create state without a trackId and writes nothing", async () => {
      const roomId = newRoomId();
      await expectErrorCode(
        service.initOrUpdatePlaybackState(roomId, { isPlaying: true }),
        ERROR_CODES.VALIDATION_ERROR,
      );
      await expect(client.exists(`room:${roomId}:playback`)).resolves.toBe(0);
    });

    it("initialises with version 1, defaults, server timestamp and a 24h TTL", async () => {
      const roomId = newRoomId();
      const before = Date.now();

      const state = await service.initOrUpdatePlaybackState(roomId, {
        trackId: "track-1",
        isPlaying: true,
      });

      expect(state).toMatchObject({
        roomId,
        trackId: "track-1",
        isPlaying: true,
        positionMs: 0,
        speed: 1,
        version: 1,
      });
      expect(state.serverTimestamp).toBeGreaterThanOrEqual(before);
      expect(state.serverTimestamp).toBeLessThanOrEqual(Date.now());

      const ttl = await client.ttl(`room:${roomId}:playback`);
      expect(ttl).toBeGreaterThan(DAY_SECONDS - 5);
      expect(ttl).toBeLessThanOrEqual(DAY_SECONDS);

      await expect(service.getPlaybackState(roomId)).resolves.toEqual(state);
    });

    it("increments the version, keeps untouched fields and refreshes the TTL", async () => {
      const roomId = newRoomId();
      const key = `room:${roomId}:playback`;
      await service.initOrUpdatePlaybackState(roomId, { trackId: "track-1", isPlaying: true });
      await client.expire(key, 30);

      const next = await service.initOrUpdatePlaybackState(roomId, {
        isPlaying: false,
        positionMs: 42_500,
      });

      expect(next).toMatchObject({
        trackId: "track-1",
        isPlaying: false,
        positionMs: 42_500,
        speed: 1,
        version: 2,
      });
      await expect(client.ttl(key)).resolves.toBeGreaterThan(DAY_SECONDS - 5);
    });

    it("ignores client-supplied version, serverTimestamp and roomId", async () => {
      const roomId = newRoomId();
      await service.initOrUpdatePlaybackState(roomId, { trackId: "track-1" });

      const next = await service.initOrUpdatePlaybackState(roomId, {
        version: 999,
        serverTimestamp: 1,
        roomId: "someone-elses-room",
        positionMs: 1_000,
      });

      expect(next.version).toBe(2);
      expect(next.roomId).toBe(roomId);
      expect(next.serverTimestamp).toBeGreaterThan(1);
    });

    it("rejects out-of-range values", async () => {
      const roomId = newRoomId();
      await expectErrorCode(
        service.initOrUpdatePlaybackState(roomId, { trackId: "track-1", speed: 10 }),
        ERROR_CODES.VALIDATION_ERROR,
      );
      await expectErrorCode(
        service.initOrUpdatePlaybackState(roomId, { trackId: "track-1", positionMs: -5 }),
        ERROR_CODES.VALIDATION_ERROR,
      );
    });

    it("never hands out the same version to concurrent writers", async () => {
      const roomId = newRoomId();
      await service.initOrUpdatePlaybackState(roomId, { trackId: "track-1" });

      const writers = 50;
      const results = await Promise.all(
        Array.from({ length: writers }, (_, i) =>
          service.initOrUpdatePlaybackState(roomId, { positionMs: i * 100 }),
        ),
      );

      const versions = results.map((s) => s.version).sort((a, b) => a - b);
      expect(versions).toEqual(Array.from({ length: writers }, (_, i) => i + 2));

      const final = await service.getPlaybackState(roomId);
      expect(final?.version).toBe(writers + 1);
    });
  });

  describe("verifyCanControlPlayback", () => {
    it("allows the host in a host-only room", async () => {
      useRoom(buildRoom(), false);
      await expect(service.verifyCanControlPlayback("room", HOST_ID)).resolves.toBe(true);
    });

    it("rejects a member in a host-only room with NOT_ROOM_HOST", async () => {
      useRoom(buildRoom(), true);
      await expectErrorCode(
        service.verifyCanControlPlayback("room", MEMBER_ID),
        ERROR_CODES.NOT_ROOM_HOST,
      );
    });

    it("allows a DJ in a host-only room", async () => {
      useRoom(buildRoom({ djIds: [MEMBER_ID] }), true);
      await expect(service.verifyCanControlPlayback("room", MEMBER_ID)).resolves.toBe(true);
    });

    it("allows any active member when everyone may control playback", async () => {
      useRoom(buildRoom({ settings: { ...buildRoom().settings, whoCanControlPlayback: "everyone" } }), true);
      await expect(service.verifyCanControlPlayback("room", MEMBER_ID)).resolves.toBe(true);
      expect(roomsStub.getRoomForActiveMember).toHaveBeenCalledWith("room", MEMBER_ID);
    });

    it("rejects non-members even when everyone may control playback", async () => {
      useRoom(buildRoom({ settings: { ...buildRoom().settings, whoCanControlPlayback: "everyone" } }), false);
      await expectErrorCode(
        service.verifyCanControlPlayback("room", OUTSIDER_ID),
        ERROR_CODES.NOT_ROOM_MEMBER,
      );
    });

    it("rejects everyone, including the host, once the room is closed", async () => {
      useRoom(buildRoom({ status: "closed" }), true);
      await expectErrorCode(
        service.verifyCanControlPlayback("room", HOST_ID),
        ERROR_CODES.ROOM_CLOSED,
      );
    });
  });
});
