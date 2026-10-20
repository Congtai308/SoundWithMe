import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { Strategy, type Profile, type VerifyCallback } from "passport-google-oauth20";
import { OAuthStateCookieStore } from "./oauth-state.store";

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, "google") {
  constructor(configService: ConfigService) {
    super({
      clientID: configService.get<string>("app.google.clientId")!,
      clientSecret: configService.get<string>("app.google.clientSecret")!,
      callbackURL: configService.get<string>("app.google.callbackUrl")!,
      scope: ["email", "profile"],
      // Types now require this explicitly (newer @types/passport-google-oauth20) —
      // we read profile data from `validate`'s own params, not the request.
      passReqToCallback: false,
      // The callback must come back to the browser that started signing in
      // (state in a cookie), and the code is useless without its PKCE verifier.
      state: true,
      pkce: true,
      store: new OAuthStateCookieStore() as never,
    });
  }

  /**
   * Passport has already verified this profile came from Google (OAuth
   * code exchange completed) by the time this runs — we just normalize the
   * shape for AuthService. This strategy never sees or stores a password.
   */
  validate(_accessToken: string, _refreshToken: string, profile: Profile, done: VerifyCallback) {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      done(null, false, { message: "Google profile did not include an email address" });
      return;
    }
    // Accounts are matched by email, so only an address Google has verified may claim one.
    if (profile.emails?.[0]?.verified !== true && profile._json.email_verified !== true) {
      done(null, false, { message: "Google has not verified this email address" });
      return;
    }

    done(null, {
      googleId: profile.id,
      email,
      displayName: profile.displayName,
      avatarUrl: profile.photos?.[0]?.value ?? null,
    });
  }
}
