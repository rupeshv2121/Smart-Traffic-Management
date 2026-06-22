// ============================================================
// congestion.ts — shared congestion vocabulary for the dashboard
//
// The 5-step congestion ramp and the car/bike/auto/bus/truck class split are
// part of the Layer 5 data contract (see the project overview doc). Kept in one
// place so both the per-junction snapshot and the city snapshot agree.
// ============================================================

import type { VehicleDetection } from "../types/types";

/** Fixed 5-step ramp, low → high. Mirrored by the frontend colour ramp. */
export type CongestionLevel = "CLEAR" | "SMOOTH" | "MODERATE" | "HEAVY" | "GRIDLOCK";

/** Map a 0–100 spatial-occupancy percentage onto the ramp. */
export function congestionLevel(occupancyPct: number): CongestionLevel {
  if (occupancyPct < 20) return "CLEAR";
  if (occupancyPct < 40) return "SMOOTH";
  if (occupancyPct < 60) return "MODERATE";
  if (occupancyPct < 80) return "HEAVY";
  return "GRIDLOCK";
}

/** Map a normalised 0–1 congestion score onto the ramp. */
export function congestionLevelFromScore(score: number): CongestionLevel {
  return congestionLevel(score * 100);
}

/** Public-facing vehicle-class split (collapses Layer-3's finer types). */
export interface ClassCounts {
  car: number;
  bike: number;
  auto: number;
  bus: number;
  truck: number;
}

export function classCountsFromDetections(detections: VehicleDetection[]): ClassCounts {
  const counts: ClassCounts = { car: 0, bike: 0, auto: 0, bus: 0, truck: 0 };
  for (const d of detections) {
    switch (d.type) {
      case "Car":
        counts.car += d.count;
        break;
      case "Motorcycle":
        counts.bike += d.count;
        break;
      case "AutoRickshaw":
        counts.auto += d.count;
        break;
      case "Bus":
        counts.bus += d.count;
        break;
      case "MiniTruck":
      case "HeavyTruck":
        counts.truck += d.count;
        break;
      // Ambulance is an EMV, not part of the civilian class split.
      default:
        break;
    }
  }
  return counts;
}
