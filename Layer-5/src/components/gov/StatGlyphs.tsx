// Red line-icons for the floating stats card, in the style of india.gov.in's
// service counters. Stroke uses currentColor so the parent sets the red.

const common = {
  width: 26,
  height: 26,
  viewBox: "0 0 24 24",
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function CycleGlyph() {
  return (
    <svg {...common} aria-hidden>
      <path d="M20 12a8 8 0 1 1-2.3-5.6" />
      <path d="M20 4v3.5h-3.5" />
      <path d="M12 8v4l2.6 1.6" />
    </svg>
  );
}

export function JunctionGlyph() {
  return (
    <svg {...common} aria-hidden>
      <path d="M12 3v18M3 12h18" />
      <circle cx="12" cy="12" r="2.4" />
    </svg>
  );
}

export function ShieldGlyph() {
  return (
    <svg {...common} aria-hidden>
      <path d="M12 3l7 2.5V11c0 4.6-3 7.8-7 9-4-1.2-7-4.4-7-9V5.5L12 3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export function ClockGlyph() {
  return (
    <svg {...common} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.2 2" />
    </svg>
  );
}

export const STAT_GLYPHS = [CycleGlyph, JunctionGlyph, ShieldGlyph, ClockGlyph];
