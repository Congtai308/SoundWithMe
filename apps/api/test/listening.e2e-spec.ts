import type { ListeningProfile } from "@soundwithme/types";
import { artistFromChannel, classifyGenres } from "../src/modules/listening/genre-classifier";
import { RealtimeHarness } from "./support/realtime-harness";

describe("classifyGenres", () => {
  it("tags by keywords, accent-insensitively", () => {
    expect(classifyGenres("Lofi Chill Nhạc Việt Nhẹ Nhàng", "Lofi Việt")).toContain("lofi");
    expect(classifyGenres("NHẠC REMIX TIKTOK TRIỆU VIEW", "Thanh Huyy Music")).toEqual(
      expect.arrayContaining(["remix", "tiktok"]),
    );
    expect(classifyGenres("Tâm Trạng Buồn - Ballad", "Ai đó")).toContain("ballad");
    expect(classifyGenres("KARAOKE Nơi Này Có Anh - Tone Nam", "Beat Chuẩn")).toContain("karaoke");
  });

  it("falls back to language: Vietnamese → vpop, plain English → usuk, Hangul → kpop", () => {
    expect(classifyGenres("Chúng Ta Của Hiện Tại", "Sơn Tùng M-TP Official")).toEqual(["vpop"]);
    expect(classifyGenres("Blinding Lights (Official Video)", "The Weeknd")).toEqual(["usuk"]);
    expect(classifyGenres("밤양갱", "BIBI")).toContain("kpop");
  });

  it("cleans channel names into artist names", () => {
    expect(artistFromChannel("Sơn Tùng M-TP Official")).toBe("Sơn Tùng M-TP");
    expect(artistFromChannel("The Weeknd - Topic")).toBe("The Weeknd");
    expect(artistFromChannel("TaylorSwiftVEVO")).toBe("TaylorSwift");
  });
});

/** Listening history → taste profile, end to end against the mock catalog. */
const h = new RealtimeHarness();

beforeAll(() => h.start());
afterAll(() => h.stop());

describe("POST /users/me/listens (e2e)", () => {
  it("counts each track once per window and only reports habits (≥2 listens)", async () => {
    const listener = await h.createGuest("Listener");
    const listen = (trackId: string) =>
      h.api("/users/me/listens", { method: "POST", cookie: listener.cookie, body: { trackId } });

    expect((await listen("track_1")).res.status).toBe(200);
    expect((await listen("track_1")).res.status).toBe(200); // replay: deduplicated
    let profile = await h.api<{ profile: ListeningProfile }>("/users/me/listening-profile", { cookie: listener.cookie });
    expect(profile.data.profile.artists).toEqual([]); // one listen isn't a habit yet

    await listen("track_2");
    await listen("track_3");
    profile = await h.api<{ profile: ListeningProfile }>("/users/me/listening-profile", { cookie: listener.cookie });
    expect(profile.data.profile.genres.length).toBeGreaterThan(0);
    expect(profile.data.profile.genres[0]!.count).toBeGreaterThanOrEqual(2);
  });

  it("rejects unknown tracks and anonymous callers", async () => {
    const listener = await h.createGuest("Picky");
    const unknown = await h.api("/users/me/listens", {
      method: "POST",
      cookie: listener.cookie,
      body: { trackId: "track_does_not_exist" },
    });
    expect(unknown.res.status).toBe(404);

    const anonymous = await h.api("/users/me/listens", { method: "POST", body: { trackId: "track_1" } });
    expect(anonymous.res.status).toBe(401);
  });
});
