/** Claims embedded in the short-lived access token. Never put secrets here. */
export interface AccessTokenPayload {
  sub: string; // userId
  username: string;
  isGuest: boolean;
  /** The login session (refresh-token chain) this token belongs to. */
  sid?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}
