import { clientIp } from "../src/common/utils/client-ip";

describe("clientIp", () => {
  it("uses the socket address for direct requests, ignoring forwarded headers", () => {
    expect(clientIp({ socket: { remoteAddress: "192.168.1.20" }, headers: { "x-forwarded-for": "1.2.3.4" } })).toBe("192.168.1.20");
  });

  it("trusts only the entry the local proxy added", () => {
    // A client forging the header gets its fake entry pushed left; the proxy appends the real one.
    expect(clientIp({ socket: { remoteAddress: "::1" }, headers: { "x-forwarded-for": "6.6.6.6, 203.0.113.9" } })).toBe("203.0.113.9");
    expect(clientIp({ socket: { remoteAddress: "127.0.0.1" }, headers: { "x-forwarded-for": "203.0.113.9" } })).toBe("203.0.113.9");
    expect(clientIp({ socket: { remoteAddress: "::ffff:127.0.0.1" }, headers: {} })).toBe("::ffff:127.0.0.1");
  });
});
