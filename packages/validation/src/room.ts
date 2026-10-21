import { z } from "zod";

export const roomTypeSchema = z.enum([
  "public",
  "friends",
  "private",
  "duo",
  "community",
]);

/** Room types a new room may be created as ("community" is reserved and not offered yet). */
export const CREATABLE_ROOM_TYPES = ["public", "friends", "private", "duo"] as const;

export const MAX_ROOM_LISTENERS = 100;
export const DUO_MAX_LISTENERS = 2;
/** Mic slots a room can open at once (each extra singer is mixed on every listener). */
export const MAX_ROOM_SINGERS = 4;
export const DEFAULT_ROOM_SINGERS = 2;

export const roomSettingsSchema = z.object({
  whoCanControlPlayback: z.enum(["host", "everyone"]),
  whoCanAddSongs: z.enum(["host", "everyone", "vote"]),
  chatEnabled: z.boolean(),
  reactionsEnabled: z.boolean(),
  songRequestsEnabled: z.boolean(),
  maxListeners: z.number().int().min(2).max(MAX_ROOM_LISTENERS),
  maxSingers: z.number().int().min(1).max(MAX_ROOM_SINGERS),
});

/** 4–32 visible characters; spaces at the ends are dropped. */
export const roomPasscodeSchema = z
  .string()
  .trim()
  .min(4, "Use at least 4 characters")
  .max(32, "Use at most 32 characters");

export const createRoomSchema = z
  .object({
    name: z.string().trim().min(1, "Give the room a name").max(80),
    description: z.string().trim().max(500).optional(),
    type: z.enum(CREATABLE_ROOM_TYPES),
    settings: roomSettingsSchema.partial().optional(),
    /** Private rooms only: lets people in without the invite link. */
    passcode: roomPasscodeSchema.optional(),
  })
  .refine((input) => input.type === "private" || input.passcode === undefined, {
    message: "Only private rooms have a passcode",
    path: ["passcode"],
  });
export type CreateRoomInput = z.infer<typeof createRoomSchema>;

// Every field optional — PATCH /rooms/:id. Only the host may call this (enforced in the service).
export const updateRoomSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  settings: roomSettingsSchema.partial().optional(),
  /** Private rooms: a new passcode, or null to remove it (invite link only). */
  passcode: roomPasscodeSchema.nullable().optional(),
});
export type UpdateRoomInput = z.infer<typeof updateRoomSchema>;

/** POST /rooms/:id/join — private rooms need the invite code or the passcode. */
export const joinRoomSchema = z
  .object({
    passcode: z.string().trim().max(32).optional(),
    invite: z.string().trim().max(64).optional(),
  })
  .default({});
export type JoinRoomInput = z.infer<typeof joinRoomSchema>;

/** GET /rooms/:id?invite=… — an invite link lets you see a private room before joining. */
export const getRoomQuerySchema = z.object({
  invite: z.string().trim().max(64).optional(),
});
export type GetRoomQuery = z.infer<typeof getRoomQuerySchema>;

export const listRoomsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type ListRoomsQuery = z.infer<typeof listRoomsQuerySchema>;

// ---- Moderation & roles (socket events, host only) ----

const roomIdSchema = z.string().min(1);
const userIdSchema = z.string().min(1).max(64);

export const hostTransferSchema = z.object({ roomId: roomIdSchema, newHostId: userIdSchema });
export type HostTransferInput = z.infer<typeof hostTransferSchema>;

/** Max DJs besides the host. */
export const MAX_ROOM_DJS = 5;
export const setDjSchema = z.object({ roomId: roomIdSchema, userId: userIdSchema, dj: z.boolean() });
export type SetDjInput = z.infer<typeof setDjSchema>;

export const muteUserSchema = z.object({ roomId: roomIdSchema, userId: userIdSchema, muted: z.boolean() });
export type MuteUserInput = z.infer<typeof muteUserSchema>;

export const kickUserSchema = z.object({ roomId: roomIdSchema, userId: userIdSchema });
export type KickUserInput = z.infer<typeof kickUserSchema>;

/** Invite a friend into the room you're in. */
export const inviteFriendSchema = z.object({ roomId: roomIdSchema, userId: userIdSchema });
export type InviteFriendInput = z.infer<typeof inviteFriendSchema>;
