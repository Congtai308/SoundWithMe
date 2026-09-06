export interface User {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  createdAt: string; // ISO date
}

/**
 * Public-facing projection of a user. Never includes email, password hash,
 * or any internal/security metadata. This is the ONLY shape the API should
 * ever return for another user's profile (see PRIVACY RULE, master prompt §58).
 */
export type PublicUser = Pick<
  User,
  "id" | "username" | "displayName" | "avatarUrl" | "bio"
>;

export type AuthenticatedUser = User & {
  email: string;
};
