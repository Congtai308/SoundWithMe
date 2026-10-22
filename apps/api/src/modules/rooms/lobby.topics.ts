import type { RoomTopic } from "@soundwithme/types";

export interface LobbyTopic extends RoomTopic {
  /** Room name and description as listed. */
  name: string;
  description: string;
  /**
   * YouTube searches the room's songs come from. Each one is a cold search
   * (100 quota units) at most once every three days: the pool is cached (LobbyService).
   */
  queries: string[];
  /** Only artists' official videos (no fan uploads, lyric re-posts or covers). */
  officialOnly?: boolean;
}

/**
 * The always-open rooms, in the order they're listed. Slugs stay put (each
 * one is its room's host account); names, descriptions and searches can
 * change freely. Searches lean on artists young listeners follow now, so
 * the rooms play hits rather than whatever a generic query turns up.
 */
export const LOBBY_TOPICS: LobbyTopic[] = [
  {
    slug: "acoustic",
    label: "Acoustic",
    emoji: "☕",
    name: "Cà Phê Acoustic",
    description: "Guitar mộc, giọng hát mộc — như một buổi chiều ở quán quen",
    queries: ["acoustic cover nhạc trẻ hay nhất", "nhạc acoustic chill tiếng việt", "Vũ. official mv", "Chillies official mv", "Ngọt band official mv"],
  },
  {
    slug: "lofi",
    label: "Chill",
    emoji: "📚",
    name: "Chill Học Bài",
    description: "Nhạc nhẹ, chill chill để học và làm việc tập trung",
    queries: ["nhạc lofi chill nhạc trẻ", "nhạc chill nhẹ nhàng tiếng việt", "indie việt chill", "Wren Evans official mv", "Thịnh Suy official mv"],
  },
  {
    slug: "ballad",
    label: "Tâm trạng",
    emoji: "💔",
    name: "Tâm Trạng",
    description: "Cho những ngày muốn nghe chậm lại một chút",
    queries: ["nhạc buồn tâm trạng nhạc trẻ", "ballad buồn hay nhất", "Erik official mv", "Quang Hùng MasterD official mv", "Dương Domic official mv"],
  },
  {
    slug: "vpop",
    label: "V-Pop",
    emoji: "📈",
    name: "V-Pop Thịnh Hành",
    description: "Những bài nhạc trẻ đang được nghe nhiều nhất",
    queries: [
      "HIEUTHUHAI official mv",
      "Sơn Tùng M-TP official mv",
      "MONO official mv",
      "tlinh official mv",
      "AMEE official mv",
      "GREY D official mv",
      "SOOBIN official mv",
      "Hòa Minzy official mv",
      "RHYDER official mv",
      "Đen Vâu official mv",
    ],
    officialOnly: true,
  },
  {
    slug: "tiktok",
    label: "TikTok",
    emoji: "🔥",
    name: "Nhạc Hot TikTok",
    description: "Những bài đang viral, nghe là muốn quay video",
    queries: ["nhạc hot tiktok", "nhạc trend tiktok việt", "nhạc trẻ hot tiktok mới nhất", "Negav official mv", "Bích Phương official mv"],
  },
  {
    slug: "usuk",
    label: "US-UK",
    emoji: "🌍",
    name: "US-UK Hit",
    description: "Hit quốc tế, vừa nghe vừa luyện tiếng Anh",
    queries: ["Sabrina Carpenter official music video", "Taylor Swift official music video", "The Weeknd official music video", "Billie Eilish official music video", "Bruno Mars official music video", "Dua Lipa official music video"],
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
