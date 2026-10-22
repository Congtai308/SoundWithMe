import { SOCKET_EVENTS } from "@soundwithme/constants";
import { safeAvatarUrl } from "@soundwithme/validation";
import type { AuthenticatedUser } from "@soundwithme/types";
import { RealtimeHarness, nextEventMatching } from "./support/realtime-harness";

/** People pick their avatar from the app's own set; nothing else is stored. */
const h = new RealtimeHarness();

beforeAll(() => h.start());
afterAll(() => h.stop());

describe("Profile avatar", () => {
  it("takes one of the singer avatars, or none", async () => {
    const guest = await h.createGuest("Picker");
    const picked = await h.api<{ user: AuthenticatedUser }>("/users/me", {
      method: "PATCH",
      cookie: guest.cookie,
      body: { avatarUrl: "/avatars/frog.svg", displayName: "Ếch hát" },
    });
    expect(picked.res.status).toBe(200);
    expect(picked.data.user).toMatchObject({ avatarUrl: "/avatars/frog.svg", displayName: "Ếch hát" });

    const cleared = await h.api<{ user: AuthenticatedUser }>("/users/me", { method: "PATCH", cookie: guest.cookie, body: { avatarUrl: null } });
    expect(cleared.data.user.avatarUrl).toBeNull();
  });

  it("refuses any other image address", async () => {
    const guest = await h.createGuest("Tracker");
    for (const avatarUrl of ["https://evil.example/pixel.png", "/avatars/../secret.svg", "/avatars/unknown.svg"]) {
      const { res } = await h.api("/users/me", { method: "PATCH", cookie: guest.cookie, body: { avatarUrl } });
      expect(res.status).toBe(400);
    }
  });

  it("shows the new avatar to the room right away", async () => {
    const host = await h.createGuest("Host");
    const room = await h.createRoom(host.cookie);
    const hostSocket = await h.joinedSocket(host.cookie, room.id);
    const listener = await h.createGuest("Listener");
    await h.joinRest(room.id, listener.cookie);
    await h.joinedSocket(listener.cookie, room.id);

    const updated = nextEventMatching(hostSocket, SOCKET_EVENTS.ROOM_PRESENCE, (p) =>
      p.listeners.some((l) => l.id === listener.userId && l.avatarUrl === "/avatars/cat.svg"),
    );
    await h.api("/users/me", { method: "PATCH", cookie: listener.cookie, body: { avatarUrl: "/avatars/cat.svg" } });
    await updated;
  });

  it("never passes on an avatar address saved before presets", () => {
    expect(safeAvatarUrl("/avatars/frog.svg")).toBe("/avatars/frog.svg");
    expect(safeAvatarUrl("https://lh3.googleusercontent.com/a/photo")).toBe("https://lh3.googleusercontent.com/a/photo");
    for (const old of ["https://evil.example/pixel.png", "http://lh3.googleusercontent.com/a", "https://googleusercontent.com.evil.example/x", "javascript:alert(1)"]) {
      expect(safeAvatarUrl(old)).toBeNull();
    }
  });
});
