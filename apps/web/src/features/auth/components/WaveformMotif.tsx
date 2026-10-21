// Fixed heights (not Math.random()) so server and client render identically —
// randomness here would cause a hydration mismatch on the first paint.
const BAR_HEIGHTS = [
  18, 34, 22, 48, 30, 62, 40, 78, 52, 90, 60, 100, 70, 94, 58, 82, 44, 68, 32, 54, 24, 42,
  16, 36, 20, 46, 28, 58, 38, 66, 26, 50, 18, 40, 22, 34,
];

/**
 * Grounds the auth screen in "this is a music app" rather than a generic
 * SaaS form — deliberately not a gradient blur or stock illustration.
 */
export function WaveformMotif({ className }: { className?: string }) {
  const barWidth = 6;
  const gap = 5;
  const width = BAR_HEIGHTS.length * (barWidth + gap);
  const height = 100;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      {BAR_HEIGHTS.map((h, i) => (
        <rect
          key={i}
          x={i * (barWidth + gap)}
          y={(height - h) / 2}
          width={barWidth}
          height={h}
          rx={barWidth / 2}
          className="fill-accent-primary"
          opacity={0.15 + (h / 100) * 0.55}
        />
      ))}
    </svg>
  );
}
