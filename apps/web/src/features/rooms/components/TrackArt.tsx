import { Icon } from "@/components/ui/Icon";
import { artworkAt } from "@/features/music/artwork";

function gradientFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) & 0xffffffff;
  const hue = Math.abs(hash) % 360;
  return `linear-gradient(135deg, hsl(${hue} 60% 35%), hsl(${(hue + 50) % 360} 70% 18%))`;
}

/** Artwork thumbnail, or a deterministic gradient with a note icon when there is none. */
export function TrackArt({
  artworkUrl,
  seed,
  size = 40,
  className = "",
}: {
  artworkUrl: string | null | undefined;
  seed: string;
  size?: number;
  className?: string;
}) {
  if (artworkUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- artwork comes from provider CDNs
      <img
        src={artworkAt(artworkUrl, size)}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        className={`shrink-0 rounded-sm object-cover ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-sm ${className}`}
      style={{ width: size, height: size, background: gradientFor(seed) }}
    >
      <Icon name="music_note" className="text-[18px] text-white/70" />
    </span>
  );
}

/** Three bouncing bars — the DESIGN.md "currently playing" marker. */
export function Equalizer({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`flex h-3.5 w-3.5 items-end gap-[2px] ${className}`}>
      <span className="eq-bar h-full w-[3px] rounded-full bg-tertiary-container" />
      <span className="eq-bar h-full w-[3px] rounded-full bg-primary [animation-delay:150ms]" />
      <span className="eq-bar h-full w-[3px] rounded-full bg-secondary [animation-delay:300ms]" />
    </span>
  );
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes >= 60) {
    return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
