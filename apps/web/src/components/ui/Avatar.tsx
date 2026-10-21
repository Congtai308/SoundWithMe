const AVATAR_TINTS = [
  "bg-primary-container/30 text-primary",
  "bg-secondary-container/25 text-secondary",
  "bg-tertiary-container/25 text-tertiary",
];

function tintFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffff;
  return AVATAR_TINTS[hash % AVATAR_TINTS.length] ?? AVATAR_TINTS[0]!;
}

export function Avatar({
  name,
  src,
  size = 32,
  online = false,
}: {
  name: string;
  src?: string | null;
  size?: number;
  online?: boolean;
}) {
  const initial = name.trim().slice(0, 1).toUpperCase() || "?";

  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- avatars come from arbitrary OAuth hosts
        <img src={src} alt="" className="h-full w-full rounded-full object-cover" />
      ) : (
        <span
          className={`flex h-full w-full items-center justify-center rounded-full font-semibold ${tintFor(name)}`}
          style={{ fontSize: Math.round(size * 0.4) }}
          aria-hidden="true"
        >
          {initial}
        </span>
      )}
      {online && (
        <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-secondary ring-2 ring-surface-container-low" />
      )}
    </span>
  );
}
