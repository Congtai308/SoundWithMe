import type { RoomTopic } from "@soundwithme/types";

export interface LobbyTopic extends RoomTopic {
  /** Room name and description as listed. */
  name: string;
  description: string;
  /**
   * YouTube searches the room's songs come from. Each one is a cold search
   * (100 quota units) at most once a day: the pool is cached (LobbyService).
   */
  queries: string[];
}

/** The always-open rooms, in the order they're listed. */
export const LOBBY_TOPICS: LobbyTopic[] = [
  {
    slug: "acoustic",
    label: "Acoustic",
    emoji: "☕",
    name: "Cà Phê Acoustic",
    description: "Mộc mạc, nhẹ nhàng như một buổi chiều ở quán quen",
    queries: ["acoustic cover tiếng việt", "nhạc acoustic nhẹ nhàng"],
  },
  {
    slug: "lofi",
    label: "Lofi",
    emoji: "🎧",
    name: "Lofi Học Bài",
    description: "Nhạc nền êm để học và làm việc tập trung",
    queries: ["lofi chill", "nhạc lofi chill việt"],
  },
  {
    slug: "vpop",
    label: "Thịnh hành",
    emoji: "📈",
    name: "V-Pop Thịnh Hành",
    description: "Những bài nhạc trẻ đang được nghe nhiều nhất",
    queries: ["nhạc trẻ hot nhất", "vpop hits mới nhất"],
  },
  {
    slug: "ballad",
    label: "Ballad",
    emoji: "💔",
    name: "Ballad Tâm Trạng",
    description: "Cho những ngày muốn nghe chậm lại một chút",
    queries: ["ballad buồn tâm trạng", "nhạc ballad việt hay nhất"],
  },
  {
    slug: "remix",
    label: "Remix",
    emoji: "⚡",
    name: "Remix Sôi Động",
    description: "Bật lên là quẩy, không cần suy nghĩ",
    queries: ["nhạc remix sôi động", "vinahouse remix hay nhất"],
  },
  {
    slug: "usuk",
    label: "US-UK",
    emoji: "🌍",
    name: "US-UK Hits",
    description: "Hit quốc tế, vừa nghe vừa luyện tiếng Anh",
    queries: ["english songs with lyrics", "top us uk hits"],
  },
];

const BY_SLUG = new Map(LOBBY_TOPICS.map((topic) => [topic.slug, topic]));

export function lobbyTopic(slug: string | null | undefined): LobbyTopic | null {
  return slug ? (BY_SLUG.get(slug) ?? null) : null;
}

/**
 * Listeners added to a lobby room's count so it never looks deserted: a
 * level per room (6–17) that drifts up and down by a few over about forty
 * minutes. The same for every viewer at the same time, and smooth from one
 * minute to the next.
 */
export function seededListeners(roomId: string, now = Date.now()): number {
  let hash = 0;
  for (let i = 0; i < roomId.length; i++) hash = (hash * 31 + roomId.charCodeAt(i)) | 0;
  const seed = Math.abs(hash);
  const base = 6 + (seed % 12);
  const minutes = now / 60_000;
  const phase = (seed % 360) * (Math.PI / 180);
  const drift = 3 * Math.sin((2 * Math.PI * minutes) / 40 + phase) + 1.5 * Math.sin((2 * Math.PI * minutes) / 13 + 2 * phase);
  return Math.max(3, Math.round(base + drift));
}
