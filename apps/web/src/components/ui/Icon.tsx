/**
 * Material Symbols Outlined icon (the icon set used by the Stitch designs).
 * `name` is the ligature, e.g. "play_arrow" — see fonts.google.com/icons.
 * Decorative by default; pass `label` when the icon is the only content of
 * an interactive element and has no visible text next to it.
 */
export function Icon({
  name,
  className = "",
  filled = false,
  label,
}: {
  name: string;
  className?: string;
  filled?: boolean;
  label?: string;
}) {
  return (
    <span
      className={`material-symbols-outlined ${filled ? "icon-filled" : ""} ${className}`}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
    >
      {name}
    </span>
  );
}
