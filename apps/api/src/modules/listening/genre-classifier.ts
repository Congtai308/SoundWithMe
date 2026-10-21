import { GENRE_SLUGS, type GenreSlug } from "@soundwithme/constants";

/**
 * Best-effort genre tags for a YouTube video, from its title and channel.
 * YouTube has no genre metadata, so this is keyword matching: good enough to
 * notice "this person plays a lot of lofi", not a catalogue-grade label.
 */

/** Keywords are matched against lowercase, accent-free text. */
const KEYWORDS: Partial<Record<GenreSlug, RegExp>> = {
  lofi: /\blo-?fi\b|\bchill\b|\bchillhop\b/,
  remix: /\bremix\b|\bedm\b|vinahouse|\bnonstop\b|\bhouse lak\b|\bdj\b/,
  karaoke: /\bkaraoke\b|\bbeat\b|\btone (nam|nu)\b/,
  acoustic: /\bacoustic\b|\bguitar\b|\bunplugged\b/,
  bolero: /\bbolero\b/,
  oldies: /nhac xua|tien chien|bat hu|\bnhac vang\b|\b(7|8|9)x\b/,
  "rap-viet": /\brap\b|hip ?hop|\btrap\b|\bfreestyle\b|\bcypher\b/,
  ballad: /\bballad\b|tam trang|\bbuon\b|tru tinh|that tinh/,
  rnb: /r&b|\brnb\b|\bsoul\b/,
  rock: /\brock\b|\bmetal\b|\bpunk\b/,
  tiktok: /tik ?tok|\bviral\b|\btrend\b/,
  anime: /\banime\b|\bopening\b|\bending\b|\bjpop\b|\bj-pop\b|\bgame ost\b/,
  indie: /\bindie\b/,
  kpop: /\bk-?pop\b/,
};

const VIETNAMESE_CHARS = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i;
const HANGUL = /[가-힯]/;
const JAPANESE = /[぀-ヿ]/;

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/đ/g, "d")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function classifyGenres(title: string, channel: string): GenreSlug[] {
  const raw = `${title} ${channel}`;
  const text = normalize(raw);
  const genres = new Set<GenreSlug>();

  for (const slug of GENRE_SLUGS) {
    if (KEYWORDS[slug]?.test(text)) genres.add(slug);
  }
  if (HANGUL.test(raw)) genres.add("kpop");
  if (JAPANESE.test(raw)) genres.add("anime");

  // Language decides the broad bucket when nothing more specific matched.
  if (genres.size === 0) {
    if (VIETNAMESE_CHARS.test(raw)) genres.add("vpop");
    else if (/^[\x20-\x7e]+$/.test(raw)) genres.add("usuk");
  }
  return [...genres];
}

/** YouTube channel names → artist name ("Sơn Tùng M-TP Official" → "Sơn Tùng M-TP"). */
export function artistFromChannel(channel: string): string | null {
  const name = channel
    .replace(/\s*-\s*Topic$/i, "")
    .replace(/VEVO$/i, "")
    .replace(/\s+(Official|Official Channel|Channel|Music)$/i, "")
    .replace(/\s+Official$/i, "")
    .trim();
  return name.length > 0 && name.length <= 60 ? name : null;
}
