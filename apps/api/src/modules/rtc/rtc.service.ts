import { Injectable, Logger } from "@nestjs/common";
import { z } from "zod";

const STUN_ONLY = [{ urls: "stun:stun.l.google.com:19302" }];
/** Cloudflare TURN credentials live this long; browsers refetch well before. */
const CREDENTIAL_TTL_SECONDS = 24 * 60 * 60;
const REQUEST_TIMEOUT_MS = 5_000;

const iceServerSchema = z.object({
  urls: z.union([z.string(), z.array(z.string())]),
  username: z.string().optional(),
  credential: z.string().optional(),
});
const iceServersSchema = z.array(iceServerSchema);
export type IceServer = z.infer<typeof iceServerSchema>;

/**
 * ICE servers for karaoke voice. STUN is enough on most home networks, but
 * mobile (4G, CGNAT) and corporate networks block direct connections, so
 * voices only get through via a TURN relay:
 *
 * - CLOUDFLARE_TURN_KEY_ID + CLOUDFLARE_TURN_API_TOKEN: short-lived
 *   credentials from Cloudflare's TURN service (free tier is generous).
 * - ICE_SERVERS: a fixed JSON RTCIceServer[] (e.g. Metered, or your own coturn).
 *
 * Neither is required: without TURN, blocked listeners fall back to the
 * voice relay in KaraokeGateway.
 */
@Injectable()
export class RtcService {
  private readonly logger = new Logger(RtcService.name);
  private cached: { servers: IceServer[]; expiresAt: number } | null = null;

  async getIceServers(): Promise<{ iceServers: IceServer[]; relay: boolean; ttlSeconds: number }> {
    const keyId = process.env.CLOUDFLARE_TURN_KEY_ID;
    const token = process.env.CLOUDFLARE_TURN_API_TOKEN;
    if (keyId && token) {
      const servers = await this.cloudflare(keyId, token);
      if (servers) return { iceServers: servers, relay: true, ttlSeconds: CREDENTIAL_TTL_SECONDS / 2 };
    }

    const fixed = this.fixedServers();
    if (fixed) return { iceServers: fixed, relay: fixed.some(isTurn), ttlSeconds: CREDENTIAL_TTL_SECONDS };
    return { iceServers: STUN_ONLY, relay: false, ttlSeconds: CREDENTIAL_TTL_SECONDS };
  }

  /** Shared by everyone; regenerated halfway through the credentials' life. */
  private async cloudflare(keyId: string, token: string): Promise<IceServer[] | null> {
    if (this.cached && this.cached.expiresAt > Date.now()) return this.cached.servers;
    try {
      const response = await fetch(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`,
        {
          method: "POST",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({ ttl: CREDENTIAL_TTL_SECONDS }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        },
      );
      if (!response.ok) {
        this.logger.warn(`Cloudflare TURN credentials request failed with HTTP ${response.status}`);
        return this.cached?.servers ?? null;
      }
      const body = z.object({ iceServers: z.union([iceServersSchema, iceServerSchema]) }).parse(await response.json());
      const servers = Array.isArray(body.iceServers) ? body.iceServers : [body.iceServers];
      this.cached = { servers, expiresAt: Date.now() + (CREDENTIAL_TTL_SECONDS / 2) * 1000 };
      return servers;
    } catch (error: unknown) {
      this.logger.warn(`Cloudflare TURN credentials request failed: ${error instanceof Error ? error.name : "unknown error"}`);
      return this.cached?.servers ?? null;
    }
  }

  private fixedServers(): IceServer[] | null {
    const configured = process.env.ICE_SERVERS;
    if (!configured) return null;
    try {
      return iceServersSchema.parse(JSON.parse(configured));
    } catch {
      this.logger.warn("ICE_SERVERS is not a valid JSON RTCIceServer[] — using STUN only");
      return null;
    }
  }
}

function isTurn(server: IceServer): boolean {
  const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
  return urls.some((url) => url.startsWith("turn:") || url.startsWith("turns:"));
}
