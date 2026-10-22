// Production server: `next start` plus one fix to X-Forwarded-For.
//
// Next only fills X-Forwarded-For when the request has none, so a visitor
// reaching this server directly (same wifi, http://<pc-ip>:3000) could send
// a made-up address and the API would rate limit that instead of them. Here
// direct visitors always get their real socket address. Requests from this
// machine (the cloudflared tunnel) keep the header: Cloudflare appends the
// real client address last, and the API reads only that last entry.
//
// Behind a hosting platform's proxies (Render, …) every request comes from
// the proxy, so TRUSTED_PROXY_HOPS says how many of them stand in front of
// this server: the client is the address just before those hops in the
// chain. Anything the client wrote further left is ignored, so it can't
// claim someone else's address. LOG_FORWARDED=1 logs the first few chains,
// to check the hop count after a deploy.
import { createServer } from "node:http";
import next from "next";

const port = Number(process.env.PORT ?? 3000);
const LOOPBACK = /^(127\.|::1$|::ffff:127\.)/;
const TRUSTED_PROXY_HOPS = Math.max(0, Number(process.env.TRUSTED_PROXY_HOPS ?? 0) || 0);
let chainsToLog = process.env.LOG_FORWARDED === "1" ? 5 : 0;

function setClientAddress(req) {
  const remote = req.socket.remoteAddress ?? "";
  const header = req.headers["x-forwarded-for"];
  if (TRUSTED_PROXY_HOPS > 0) {
    const chain = [
      ...(Array.isArray(header) ? header.join(",") : header ?? "").split(",").map((s) => s.trim()).filter(Boolean),
      remote,
    ];
    if (chainsToLog > 0) {
      chainsToLog--;
      console.log(`[forwarded] chain=${JSON.stringify(chain)} hops=${TRUSTED_PROXY_HOPS}`);
    }
    req.headers["x-forwarded-for"] = chain[Math.max(0, chain.length - 1 - TRUSTED_PROXY_HOPS)];
    return;
  }
  if (!LOOPBACK.test(remote) || !header) {
    req.headers["x-forwarded-for"] = remote;
  }
}

const app = next({ dev: false, port });
const handle = app.getRequestHandler();
await app.prepare();
const upgrade = app.getUpgradeHandler();

const server = createServer((req, res) => {
  setClientAddress(req);
  handle(req, res);
});
// socket.io's WebSocket goes through the /socket.io rewrite too.
server.on("upgrade", (req, socket, head) => {
  setClientAddress(req);
  upgrade(req, socket, head);
});
server.listen(port, () => {
  console.log(`▲ Ready on http://localhost:${port}`);
});
