import { RtcService } from "../src/modules/rtc/rtc.service";

describe("RtcService ICE servers", () => {
  const realFetch = global.fetch;
  const env = { ...process.env };
  let fetchMock: jest.Mock;

  beforeEach(() => {
    delete process.env.CLOUDFLARE_TURN_KEY_ID;
    delete process.env.CLOUDFLARE_TURN_API_TOKEN;
    delete process.env.ICE_SERVERS;
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterAll(() => {
    global.fetch = realFetch;
    process.env = env;
  });

  it("is STUN-only without configuration", async () => {
    const result = await new RtcService().getIceServers();
    expect(result.relay).toBe(false);
    expect(result.iceServers).toEqual([{ urls: "stun:stun.l.google.com:19302" }]);
  });

  it("uses a fixed ICE_SERVERS list and spots TURN in it", async () => {
    process.env.ICE_SERVERS = JSON.stringify([{ urls: "turn:t.example:3478", username: "u", credential: "p" }]);
    const result = await new RtcService().getIceServers();
    expect(result.relay).toBe(true);
    expect(result.iceServers[0]).toMatchObject({ urls: "turn:t.example:3478" });
  });

  it("generates Cloudflare TURN credentials once and reuses them", async () => {
    process.env.CLOUDFLARE_TURN_KEY_ID = "key";
    process.env.CLOUDFLARE_TURN_API_TOKEN = "token";
    const iceServers = [{ urls: ["turn:turn.cloudflare.com:3478?transport=udp"], username: "x", credential: "y" }];
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ iceServers }), { status: 201 }));

    const service = new RtcService();
    const first = await service.getIceServers();
    const second = await service.getIceServers();
    expect(first).toMatchObject({ relay: true, iceServers });
    expect(second.iceServers).toEqual(iceServers);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/turn/keys/key/credentials/generate-ice-servers");
    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe("Bearer token");
  });

  it("falls back to STUN when Cloudflare is unreachable", async () => {
    process.env.CLOUDFLARE_TURN_KEY_ID = "key";
    process.env.CLOUDFLARE_TURN_API_TOKEN = "token";
    fetchMock.mockResolvedValue(new Response("", { status: 401 }));
    const result = await new RtcService().getIceServers();
    expect(result.relay).toBe(false);
  });
});
