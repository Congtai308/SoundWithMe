import type { AuthenticatedUser, PublicUser } from "@soundwithme/types";
import { RealtimeHarness } from "./support/realtime-harness";

/** Onboarding answers: saved on the account, visible only to its owner. */
const h = new RealtimeHarness();

beforeAll(() => h.start());
afterAll(() => h.stop());

describe("PUT /users/me/music-preferences (e2e)", () => {
  it("starts empty, saves de-duplicated picks, and returns them on /users/me", async () => {
    const listener = await h.createGuest("Listener");
    const before = await h.api<{ user: AuthenticatedUser }>("/users/me", { cookie: listener.cookie });
    expect(before.data.user.musicPreferences).toBeNull();

    const saved = await h.api<{ user: AuthenticatedUser }>("/users/me/music-preferences", {
      method: "PUT",
      cookie: listener.cookie,
      body: { genres: ["lofi", "kpop", "lofi"], artists: ["Sơn Tùng M-TP", "sơn tùng m-tp", " AMEE "] },
    });
    expect(saved.res.status).toBe(200);
    expect(saved.data.user.musicPreferences).toMatchObject({
      genres: ["lofi", "kpop"],
      artists: ["Sơn Tùng M-TP", "AMEE"],
    });

    const after = await h.api<{ user: AuthenticatedUser }>("/users/me", { cookie: listener.cookie });
    expect(after.data.user.musicPreferences?.artists).toEqual(["Sơn Tùng M-TP", "AMEE"]);
  });

  it("accepts an empty answer (skipped onboarding) and rejects malformed input", async () => {
    const listener = await h.createGuest("Skipper");
    const skipped = await h.api<{ user: AuthenticatedUser }>("/users/me/music-preferences", {
      method: "PUT",
      cookie: listener.cookie,
      body: { genres: [], artists: [] },
    });
    expect(skipped.data.user.musicPreferences).toMatchObject({ genres: [], artists: [] });

    const bad = await h.api("/users/me/music-preferences", {
      method: "PUT",
      cookie: listener.cookie,
      body: { genres: ["<script>"], artists: [] },
    });
    expect(bad.res.status).toBe(400);
  });

  it("requires sign-in and never leaks preferences on the public profile", async () => {
    const anonymous = await h.api("/users/me/music-preferences", {
      method: "PUT",
      body: { genres: ["lofi"], artists: [] },
    });
    expect(anonymous.res.status).toBe(401);

    const listener = await h.createGuest("Private");
    const me = await h.api<{ user: AuthenticatedUser }>("/users/me/music-preferences", {
      method: "PUT",
      cookie: listener.cookie,
      body: { genres: ["lofi"], artists: ["AMEE"] },
    });
    const profile = await h.api<{ user: PublicUser }>(`/users/${me.data.user.username}`);
    expect(profile.data.user).not.toHaveProperty("musicPreferences");
  });
});
