// Shared congestion ramp for data visualisation. The 5 steps mirror the
// project's fixed congestion ramp; colours are tuned for contrast on the
// light government surface (data viz, not chrome).

import type { CongestionLevel } from "../types/snapshot";

export const CONGESTION_COLOR: Record<CongestionLevel, string> = {
  CLEAR: "#138808", // india green
  SMOOTH: "#7cb342",
  MODERATE: "#ff9500", // amber
  HEAVY: "#ff5500",
  GRIDLOCK: "#c62828", // critical red
};

export const CONGESTION_LABEL: Record<CongestionLevel, string> = {
  CLEAR: "Clear",
  SMOOTH: "Smooth",
  MODERATE: "Moderate",
  HEAVY: "Heavy",
  GRIDLOCK: "Gridlock",
};

export const CONGESTION_LABEL_HI: Record<CongestionLevel, string> = {
  CLEAR: "साफ़",
  SMOOTH: "सुगम",
  MODERATE: "मध्यम",
  HEAVY: "भारी",
  GRIDLOCK: "जाम",
};

export const CONGESTION_ORDER: CongestionLevel[] = [
  "CLEAR",
  "SMOOTH",
  "MODERATE",
  "HEAVY",
  "GRIDLOCK",
];

/** Map a normalised 0–1 congestion score onto the ramp (mirrors Layer-3). */
export function congestionLevelFromScore(score: number): CongestionLevel {
  const pct = score * 100;
  if (pct < 20) return "CLEAR";
  if (pct < 40) return "SMOOTH";
  if (pct < 60) return "MODERATE";
  if (pct < 80) return "HEAVY";
  return "GRIDLOCK";
}
