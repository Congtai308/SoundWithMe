// Production server: `next start` plus one fix to X-Forwarded-For.
//
// Next only fills X-Forwarded-For when the request has none, so a visitor
// reaching this server directly (same wifi, http://<pc-ip>:3000) could send
// a made-up address and the API would rate limit that instead of them. Here
// direct visitors always get their real socket address. Requests from this
// machine (the cloudflared tunnel) keep the header: Cloudflare appends the
// real client address last, and the API reads only that last entry.
import { createServer } from "node:http";
import next from "next";

const port = Number(process.env.PORT ?? 3000);
const LOOPBACK = /^(127\.|::1$|::ffff:127\.)/;

function setClientAddress(req) {
  const remote = req.socket.remoteAddress ?? "";
  if (!LOOPBACK.test(remote) || !req.headers["x-forwarded-for"]) {
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
