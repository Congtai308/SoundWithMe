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
    tag: "Nocturnal",
    emoji: "🌙",
    label: "Late Night",
    query: "lofi",
    description: "Slow burn beats, midnight synthwave, low-light lo-fi.",
    glow: "from-primary-container/40",
    button: "bg-primary-container text-on-primary-container",
    icon: "graphic_eq",
  },
  {
    slug: "hype",
    tag: "High BPM",
    emoji: "🔥",
    label: "Hype & Workout",
    query: "workout",
    description: "Phonk, driving techno basslines and high-BPM energy.",
    glow: "from-tertiary-container/40",
    button: "bg-tertiary-container text-on-tertiary-container",
    icon: "bolt",
  },
  {
    slug: "focus",
    tag: "Flow State",
    emoji: "🧠",
    label: "Deep Focus & Study",
    query: "study",
    description: "Ambient textures and instrumentals that stay out of the way.",
    glow: "from-secondary-container/40",
    button: "bg-secondary-container text-on-secondary-container",
    icon: "psychology",
  },
  {
    slug: "romantic",
    tag: "Intimate",
    emoji: "❤️",
    label: "Romantic & Intimate",
    query: "love",
    description: "Velvet neo-soul, R&B slow jams and acoustic ballads.",
    glow: "from-tertiary-container/40",
    button: "bg-tertiary-container text-on-tertiary-container",
    icon: "favorite",
  },
  {
    slug: "road-trip",
    tag: "Open Road",
    emoji: "🚗",
    label: "Road Trip & Singalong",
    query: "road trip",
    description: "Anthemic indie rock and windows-down classics.",
    glow: "from-primary-container/40",
    button: "bg-primary-container text-on-primary-container",
    icon: "directions_car",
  },
  {
    slug: "morning",
    tag: "Gentle Wake",
    emoji: "☀️",
    label: "Morning Coffee & Chill",
    query: "acoustic",
    description: "Warm acoustic guitars and gentle bossa for slow starts.",
    glow: "from-secondary-container/40",
    button: "bg-secondary-container text-on-secondary-container",
    icon: "coffee",
  },
];

/** The four vibes surfaced as quick chips in the top bar (as in the design). */
export const QUICK_VIBES = VIBES.filter((v) =>
  ["late-night", "hype", "focus", "romantic"].includes(v.slug),
);
