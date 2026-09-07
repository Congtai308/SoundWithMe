export type AuthMethod = "password" | "google" | "guest";

export interface User {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  /**
   * Which method(s) this account can authenticate with. A user created via
   * Google can later also set a password (methods becomes ["google","password"]),
   * but a guest account is scoped to "guest" only — it is not link-able to a
   * real identity, by design, to keep guest accounts low-stakes/disposable.
   */
  authMethods: AuthMethod[];
  isGuest: boolean;
  createdAt: string; // ISO date
}

/**
 * Public-facing projection of a user. Never includes email, password hash,
 * googleId, or any internal/security metadata. This is the ONLY shape the
 * API should ever return for another user's profile (PRIVACY RULE, master
 * prompt §58).
 */
export type PublicUser = Pick<
  User,
  "id" | "username" | "displayName" | "avatarUrl" | "bio" | "isGuest"
>;

export type AuthenticatedUser = User & {
  email: string | null; // null for guest accounts
};
