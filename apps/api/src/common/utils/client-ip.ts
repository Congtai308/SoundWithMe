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
