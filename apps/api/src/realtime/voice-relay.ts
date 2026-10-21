import { SOCKET_EVENTS } from "@soundwithme/constants";
import type { AppServer } from "./realtime.types";

/** Socket.IO rooms `voice:<roomId>:<singerSocketId>`: listeners taking one singer's voice through the server. */
export const RELAY_PREFIX = "voice:";

export function relayRoom(roomId: string, singer: string): string {
  return `${RELAY_PREFIX}${roomId}:${singer}`;
}

/** Every voice relay of one listening room, among a socket's rooms. */
export function relaysOfRoom(rooms: Iterable<string>, roomId: string): string[] {
  const prefix = `${RELAY_PREFIX}${roomId}:`;
  return [...rooms].filter((room) => room.startsWith(prefix));
}

/** Tells the singer how many listeners take their voice through the server (0 = stop streaming), and which codec they can all play. */
export async function notifyRelayDemand(server: AppServer, relay: string): Promise<void> {
  const [, roomId, singer] = relay.split(":");
  if (!roomId || !singer) return;
  const sockets = await server.in(relay).fetchSockets();
  const pcmOnly = sockets.filter((s) => !s.data.voiceOpus).length;
  server.to(singer).emit(SOCKET_EVENTS.VOICE_RELAY_DEMAND, { roomId, listeners: sockets.length, pcmOnly });
}
