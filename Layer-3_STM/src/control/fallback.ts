// ============================================================
// fallback.ts — historical time-of-day fallback timing plans.
//
// Closes the architecture's fail-safe loop: the durable cycle history (owned by
// the Data/Logging layer) is distilled into per-phase recommended green times,
// which Layer-3 uses when live perception is degraded (low CV confidence) and
// which are served to Layer-5 at GET /fallback-plan.
//
// Plans are derived for the CURRENT hour-of-day when enough samples exist
// (true time-of-day behaviour), then fall back to all-history, then to the
// supplied static defaults — so the loop is always answerable.
// ============================================================

import type { CycleSnapshot } from "../dashboard/snapshot";
import type { HistoricalTimingPlan } from "../types/types";

const PHASES = ["NORTH", "SOUTH", "EAST", "WEST"] as const;
const MIN_SAMPLES = 3;

export function deriveFallbackPlans(
  snapshots: CycleSnapshot[],
  defaults: HistoricalTimingPlan[],
): HistoricalTimingPlan[] {
  const nowHour = new Date().getHours();
  const byDefault = new Map(defaults.map((d) => [d.phaseId, d]));

  return PHASES.map((phase) => {
    const served = snapshots.filter((s) => s.decision.targetPhaseId === phase);
    const thisHour = served.filter((s) => new Date(s.timestamp).getHours() === nowHour);
    const use = thisHour.length >= MIN_SAMPLES ? thisHour : served;

    const fallback = byDefault.get(phase) ?? {
      phaseId: phase,
      recommendedGreenTime: 35,
      historicalDemand: 50,
    };
    if (use.length < MIN_SAMPLES) return fallback;

    const avgGreen = Math.round(
      use.reduce((s, c) => s + c.decision.durationSeconds, 0) / use.length,
    );
    const avgDemand = Math.round(
      use.reduce((s, c) => {
        const ap = c.perception.approaches.find((a) => a.approachId === phase);
        return s + (ap?.totalVehicles ?? 0);
      }, 0) / use.length,
    );
    return { phaseId: phase, recommendedGreenTime: avgGreen, historicalDemand: avgDemand };
  });
}
