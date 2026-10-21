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

/** What a listener told us they like during onboarding. Private to the owner. */
export interface MusicPreferences {
  /** Genre slugs from the web app's genre catalog. */
  genres: string[];
  /** Free-form artist names (catalog picks or typed by the user). */
  artists: string[];
  updatedAt: string; // ISO date
}

/** What the listener plays most, learned from listening history. Private to the owner. */
export interface ListeningProfile {
  genres: { slug: string; count: number }[];
  artists: { name: string; count: number }[];
}

export type AuthenticatedUser = User & {
  email: string | null; // null for guest accounts
  /** The owner proved the email is theirs (mailed link or Google). Always false for guests. */
  emailVerified: boolean;
  /** null until the user finishes (or skips) music onboarding. */
  musicPreferences: MusicPreferences | null;
};
