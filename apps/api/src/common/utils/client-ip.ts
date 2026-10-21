interface IpRequest {
  ip?: string;
  socket?: { remoteAddress?: string };
  headers?: Record<string, string | string[] | undefined>;
}

const LOOPBACK = /^(127\.|::1$|::ffff:127\.)/;

/**
 * The real client address. X-Forwarded-For is only read when the request
 * came from this machine (the Next proxy, the tunnel), and then only its
 * last entry: that one is added by the proxy itself, while earlier entries
 * are whatever the client sent and can be forged. Requests that reach the
 * API directly always use the socket address.
 */
export function clientIp(req: IpRequest): string {
  const socketIp = req.socket?.remoteAddress ?? req.ip ?? "";
  if (!LOOPBACK.test(socketIp)) return socketIp || "unknown";
  const header = req.headers?.["x-forwarded-for"];
  const entries = (Array.isArray(header) ? header.join(",") : header ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return entries.at(-1) ?? (socketIp || "unknown");
}

/**
 * The address as rate limits should count it. One IPv6 subscriber usually
 * holds a whole /64 and can rotate through it at will, so IPv6 addresses
 * count per /64; IPv4 (and IPv4-mapped) addresses count individually.
 */
export function rateLimitAddress(ip: string): string {
  const address = ip.toLowerCase().replace(/^::ffff:(?=\d+\.)/, "");
  if (!address.includes(":")) return address;
  const [head = "", tail = ""] = address.split("::", 2);
  const headParts = head ? head.split(":") : [];
  const tailParts = address.includes("::") ? (tail ? tail.split(":") : []) : [];
  const groups = address.includes("::")
    ? [...headParts, ...Array<string>(Math.max(8 - headParts.length - tailParts.length, 0)).fill("0"), ...tailParts]
    : headParts;
  return `${groups
    .slice(0, 4)
    .map((g) => (g || "0").replace(/^0+(?=.)/, ""))
    .join(":")}::/64`;
}
