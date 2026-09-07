import { z } from "zod";

// Username is the public handle — separate from displayName so it can be
// used safely in URLs and stays stable even if displayName changes.
const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(24)
  .regex(
    /^[a-zA-Z0-9_]+$/,
    "Username can only contain letters, numbers, and underscores",
  );

export const registerSchema = z.object({
  username: usernameSchema,
  email: z.string().trim().toLowerCase().email(),
  // Length only enforced here; hashing/complexity handled server-side.
  // Not a substitute for a real breached-password check, which is a
  // reasonable later hardening step, not a Phase 1 blocker.
  password: z.string().min(8).max(128),
  displayName: z.string().trim().min(1).max(50).optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const guestLoginSchema = z.object({
  // Guest mode is intentionally minimal: a display name only, no password,
  // no email. Kept short/simple since guest accounts are meant to be
  // low-friction and disposable, not a full identity.
  displayName: z.string().trim().min(1).max(50),
});
export type GuestLoginInput = z.infer<typeof guestLoginSchema>;

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
