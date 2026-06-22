// Step icons for the "Our Approach" signal-corridor flow. Stroke uses
// currentColor so the parent (orb) controls the colour.

const s = {
  width: 28,
  height: 28,
  viewBox: "0 0 24 24",
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

// 01 · Perception — camera
function PerceptionGlyph() {
  return (
    <svg {...s} aria-hidden>
      <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2L8 5h5l1.5 2H19a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 18H4.5A1.5 1.5 0 0 1 3 16.5v-8Z" />
      <circle cx="11.5" cy="12" r="3" />
    </svg>
  );
}

// 02 · Processing & Detection — chip / CPU
function ProcessingGlyph() {
  return (
    <svg {...s} aria-hidden>
      <rect x="7" y="7" width="10" height="10" rx="1.5" />
      <path d="M10 10h4v4h-4z" />
      <path d="M9 4v2M12 4v2M15 4v2M9 18v2M12 18v2M15 18v2M4 9h2M4 12h2M4 15h2M18 9h2M18 12h2M18 15h2" />
    </svg>
  );
}

// 03 · Decision & Optimization — route / branching
function DecisionGlyph() {
  return (
    <svg {...s} aria-hidden>
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="6" r="2" />
      <circle cx="18" cy="16" r="2" />
      <path d="M8 18h4a4 4 0 0 0 4-4v-.5M16 6.5A4 4 0 0 1 12 10H8" />
    </svg>
  );
}

// 04 · Safety Supervisor — shield with check
function SafetyGlyph() {
  return (
    <svg {...s} aria-hidden>
      <path d="M12 3l7 2.5V11c0 4.6-3 7.8-7 9-4-1.2-7-4.4-7-9V5.5L12 3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

// 05 · Control & Logging — broadcast / signal out
function ControlGlyph() {
  return (
    <svg {...s} aria-hidden>
      <circle cx="12" cy="12" r="2.2" />
      <path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 15.5a5 5 0 0 0 0-7M6 6a9 9 0 0 0 0 12M18 18a9 9 0 0 0 0-12" />
    </svg>
  );
}

export const FLOW_GLYPHS = [
  PerceptionGlyph,
  ProcessingGlyph,
  DecisionGlyph,
  SafetyGlyph,
  ControlGlyph,
];
