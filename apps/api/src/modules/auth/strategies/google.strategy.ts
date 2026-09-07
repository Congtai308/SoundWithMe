import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { Strategy, type Profile, type VerifyCallback } from "passport-google-oauth20";

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
      done(new Error("Google profile did not include an email address"), false);
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
