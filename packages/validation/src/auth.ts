import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  // Length only enforced here; hashing/complexity handled server-side.
  // Not a substitute for a real breached-password check, which is a
  // reasonable later hardening step, not a Phase 1 blocker.
  password: z.string().min(8).max(128),
  displayName: z.string().trim().min(1).max(50),
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

/** The token from a mailed link (verify email, reset password). */
const mailedTokenSchema = z.string().trim().min(20).max(200);

export const verifyEmailSchema = z.object({ token: mailedTokenSchema });
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: mailedTokenSchema,
  password: registerSchema.shape.password,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
