export interface Vibe {
  slug: string;
  emoji: string;
  label: string;
  /** Short mood tag shown on the vibe card. */
  tag: string;
  /** Search query sent to the music catalog when this vibe is picked. */
  query: string;
  description: string;
  /** Tailwind classes for the card's ambient glow and action button. */
  glow: string;
  button: string;
  icon: string;
}

export const VIBES: Vibe[] = [
  {
    slug: "late-night",
    tag: "Về đêm",
    emoji: "🌙",
    label: "Đêm khuya",
    query: "lofi",
    description: "Beat chậm, synthwave nửa đêm, lo-fi dịu nhẹ.",
    glow: "from-primary-container/40",
    button: "bg-primary-container text-on-primary-container",
    icon: "graphic_eq",
  },
  {
    slug: "hype",
    tag: "Nhịp nhanh",
    emoji: "🔥",
    label: "Sôi động & tập luyện",
    query: "workout",
    description: "Phonk, techno dồn dập và nhạc nhịp nhanh.",
    glow: "from-tertiary-container/40",
    button: "bg-tertiary-container text-on-tertiary-container",
    icon: "bolt",
  },
  {
    slug: "focus",
    tag: "Tập trung",
    emoji: "🧠",
    label: "Tập trung & học bài",
    query: "study",
    description: "Nhạc nền và nhạc không lời, không làm bạn xao nhãng.",
    glow: "from-secondary-container/40",
    button: "bg-secondary-container text-on-secondary-container",
    icon: "psychology",
  },
  {
    slug: "romantic",
    tag: "Ngọt ngào",
    emoji: "❤️",
    label: "Lãng mạn",
    query: "love",
    description: "Neo-soul, R&B chậm và ballad acoustic.",
    glow: "from-tertiary-container/40",
    button: "bg-tertiary-container text-on-tertiary-container",
    icon: "favorite",
  },
  {
    slug: "road-trip",
    tag: "Lên đường",
    emoji: "🚗",
    label: "Đi phượt & hát theo",
    query: "road trip",
    description: "Indie rock sôi nổi và những bài kinh điển để hát theo.",
    glow: "from-primary-container/40",
    button: "bg-primary-container text-on-primary-container",
    icon: "directions_car",
  },
  {
    slug: "morning",
    tag: "Sáng dịu nhẹ",
    emoji: "☀️",
    label: "Cà phê sáng & chill",
    query: "acoustic",
    description: "Guitar acoustic ấm áp và bossa nhẹ nhàng cho buổi sáng.",
    glow: "from-secondary-container/40",
    button: "bg-secondary-container text-on-secondary-container",
    icon: "coffee",
  },
];

/** The four vibes surfaced as quick chips in the top bar (as in the design). */
export const QUICK_VIBES = VIBES.filter((v) =>
  ["late-night", "hype", "focus", "romantic"].includes(v.slug),
);
