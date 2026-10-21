import { useId } from "react";

/** SoundWithMe mark + wordmark, from docs/ui/.../soundwithme_brand_logo. */
export function BrandLogo({ showWordmark = true }: { showWordmark?: boolean }) {
  const gradientId = useId();

  return (
    <span className="flex items-center gap-sm">
      <svg viewBox="0 0 48 48" className="h-9 w-9 shrink-0" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#8B5CF6" />
            <stop offset="50%" stopColor="#A855F7" />
            <stop offset="100%" stopColor="#06B6D4" />
          </linearGradient>
        </defs>
        <circle
          cx="24"
          cy="24"
          r="22"
          stroke={`url(#${gradientId})`}
          strokeWidth="2.5"
          opacity="0.3"
          strokeDasharray="4 3"
        />
        <circle cx="20" cy="24" r="14" fill="#8B5CF6" fillOpacity="0.2" stroke="#8B5CF6" strokeWidth="2" />
        <circle cx="28" cy="24" r="14" fill="#06B6D4" fillOpacity="0.2" stroke="#06B6D4" strokeWidth="2" />
        <rect x="16" y="20" width="2.5" height="8" rx="1.25" fill="#FFFFFF" />
        <rect x="20.5" y="15" width="2.5" height="18" rx="1.25" fill="#FFFFFF" />
        <rect x="25" y="11" width="2.5" height="26" rx="1.25" fill="#FFFFFF" />
        <rect x="29.5" y="16" width="2.5" height="16" rx="1.25" fill="#FFFFFF" />
        <rect x="34" y="21" width="2.5" height="6" rx="1.25" fill="#FFFFFF" />
      </svg>
      {showWordmark && (
        <span className="text-headline-md font-extrabold tracking-tight text-on-surface">
          Sound
          <span className="bg-gradient-to-r from-[#8B5CF6] via-[#A855F7] to-[#06B6D4] bg-clip-text text-transparent">
            WithMe
          </span>
        </span>
      )}
    </span>
  );
}
