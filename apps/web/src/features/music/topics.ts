export interface MusicTopic {
  slug: string;
  emoji: string;
  label: string;
  /** Search query sent to the YouTube catalog for this topic. */
  query: string;
}

/** Topic chips on the Music page (first one is the default view). */
export const MUSIC_TOPICS: MusicTopic[] = [
  { slug: "trending", emoji: "📈", label: "Thịnh hành", query: "nhạc trẻ hot nhất" },
  { slug: "karaoke", emoji: "🎤", label: "Karaoke", query: "karaoke beat chuẩn" },
  { slug: "energy", emoji: "⚡", label: "Năng lượng", query: "nhạc remix sôi động" },
  { slug: "learn-english", emoji: "📚", label: "Học tiếng Anh", query: "english songs with lyrics" },
  { slug: "acoustic", emoji: "🎸", label: "Acoustic", query: "acoustic cover" },
  { slug: "oldies", emoji: "🎻", label: "Nhạc xưa", query: "nhạc xưa bất hủ" },
  { slug: "ballad", emoji: "💔", label: "Trữ tình", query: "nhạc trữ tình" },
  { slug: "lofi", emoji: "🎧", label: "Lofi", query: "lofi chill" },
  { slug: "tiktok", emoji: "🔥", label: "TikTok Viral", query: "nhạc hot tiktok" },
];

/** Artist shortcuts; each one simply searches for the name. */
export const MUSIC_ARTISTS = [
  "HIEUTHUHAI",
  "Sơn Tùng M-TP",
  "MONO",
  "tlinh",
  "Hoàng Thùy Linh",
  "AMEE",
  "Bích Phương",
  "Đen Vâu",
  "BLACKPINK",
  "BTS",
];
