// ============================================================
// max-pressure-optimizer.ts
// Member 2 — Core Optimization Engineer
//
// RESPONSIBILITY:
//   Selects which phase gets green signal
//   Calculates how long green should last
//   Handles confidence fallback
//   Exposes pause/resume for Member 3 (EMV team)
//
// USED BY:
//   Member 3 → calls pauseOptimizer / resumeOptimizer
//   Member 4 → receives ProposedPlan from us
//   Member 5 → provides confidenceScore input
// ============================================================

import {
  ApproachMetrics,
  scoreAllApproaches,
  ScoredApproach,
} from "./types/types";

// ─── Types ───────────────────────────────────────────────────
export interface DownstreamDensity {
  direction: string;
  occupancyPct: number;
}

export interface PhaseState {
  currentPhaseId: string;
  phaseElapsedSeconds: number;
  currentGreenDuration: number;
  currentDensity: "low" | "medium" | "high";
}

export interface ProposedPlan {
  junctionId: string;
  timestamp: string;
  dataSource: "LIVE" | "HISTORICAL" | "EMV_OVERRIDE";
  targetPhaseId: string;
  greenDuration: number;
  yellowDuration: number;
  allRedDuration: number;
  pressureSnapshot: Record<string, number>;
  priorityScores: Record<string, number>;
  personFlows: Record<string, number>;
  spillbackFlags: Record<string, boolean>;
  starvationFlags: Record<string, boolean>;
  extendGreen: boolean;
  winningDirection: string;
}

// ─── Constants ───────────────────────────────────────────────
const MIN_GREEN = 15;
const MAX_GREEN = 90;
const YELLOW_TIME = 5;
const ALL_RED_TIME = 2;
const SCALING_FACTOR = 1.5;
const EXTENSION_SEC = 10;
const CONF_THRESHOLD = 0.7;
// Floor for the downstream-availability multiplier so a fully saturated
// downstream never drops a non-starved approach's pressure to absolute zero.
const DOWNSTREAM_AVAILABILITY_FLOOR = 0.1;
const DEFAULT_HISTORICAL_GREEN = 30;

// ─── Pressure Calculation (True Max-Pressure) ─────────────────
// Classic max-pressure releases the movement whose upstream demand is high
// AND whose downstream can actually absorb it. We scale the (large, composite)
// upstream priority score by a normalised downstream-availability factor in
// [0,1], so a jammed downstream suppresses release and prevents spillback —
// instead of subtracting a raw occupancy percentage that barely moved the
// ranking. Starved approaches bypass the damping so they are eventually served.
function calculatePressure(
  scored: ScoredApproach,
  downstream: DownstreamDensity[],
): number {
  const ds = downstream.find(
    (d) => d.direction.toUpperCase() === scored.direction,
  );
  const downstreamOccupancyPct = ds ? ds.occupancyPct : 0;

  // Normalise occupancy (0–100%) into available headroom (1 = empty, 0 = full).
  const availability = Math.max(
    0,
    Math.min(1, 1 - downstreamOccupancyPct / 100),
  );

  const factor = scored.starvationOverride
    ? 1
    : Math.max(DOWNSTREAM_AVAILABILITY_FLOOR, availability);

  return scored.priorityScore * factor;
}

// ─── Green Time Calculation ───────────────────────────────────
function calculateGreenTime(priorityScore: number): number {
  const raw = MIN_GREEN + priorityScore * SCALING_FACTOR;
  return Math.round(Math.max(MIN_GREEN, Math.min(MAX_GREEN, raw)));
}

// ─── Adaptive Extension Check ─────────────────────────────────
function shouldExtendGreen(phase: PhaseState): boolean {
  return (
    phase.currentDensity === "high" &&
    phase.phaseElapsedSeconds >= phase.currentGreenDuration &&
    phase.currentGreenDuration < MAX_GREEN
  );
}

// ─── Build EMV Override Plan ──────────────────────────────────
function buildEMVOverridePlan(junctionId: string): ProposedPlan {
  return {
    junctionId,
    timestamp: new Date().toISOString(),
    dataSource: "EMV_OVERRIDE",
    targetPhaseId: "PHASE_EMV_CONTROLLED",
    greenDuration: 0,
    yellowDuration: 0,
    allRedDuration: 0,
    pressureSnapshot: {},
    priorityScores: {},
    personFlows: {},
    spillbackFlags: {},
    starvationFlags: {},
    extendGreen: false,
    winningDirection: "EMV_CONTROLLED",
  };
}

// ─── Build Historical Fallback Plan ───────────────────────────
function buildHistoricalFallback(
  junctionId: string,
  historicalGreenTime: number = DEFAULT_HISTORICAL_GREEN,
): ProposedPlan {
  console.log(
    `[FALLBACK] Junction ${junctionId}: ` +
      `low confidence → using historical timing (${historicalGreenTime}s)`,
  );
  return {
    junctionId,
    timestamp: new Date().toISOString(),
    dataSource: "HISTORICAL",
    targetPhaseId: "PHASE_HISTORICAL_DEFAULT",
    greenDuration: historicalGreenTime,
    yellowDuration: YELLOW_TIME,
    allRedDuration: ALL_RED_TIME,
    pressureSnapshot: {},
    priorityScores: {},
    personFlows: {},
    spillbackFlags: {},
    starvationFlags: {},
    extendGreen: false,
    winningDirection: "HISTORICAL",
  };
}

// ─── Main Optimizer ───────────────────────────────────────────
export function runMaxPressureOptimizer(
  junctionId: string,
  approaches: ApproachMetrics[],
  downstream: DownstreamDensity[],
  currentPhase: PhaseState,
  confidenceScore: number,
  historicalGreenTime?: number,
): ProposedPlan {
  // ─── Confidence Gate ────────────────────────────────────
  if (confidenceScore < CONF_THRESHOLD) {
    return buildHistoricalFallback(junctionId, historicalGreenTime);
  }

  // ─── Step 1+2: Score all approaches ─────────────────────
  const scoredApproaches = scoreAllApproaches(approaches);

  // ─── Step 3: Calculate pressure per approach ────────────
  const pressureMap: Record<string, number> = {};
  const scoreMap: Record<string, number> = {};
  const flowMap: Record<string, number> = {};
  const spillbackMap: Record<string, boolean> = {};
  const starvationMap: Record<string, boolean> = {};

  scoredApproaches.forEach((scored) => {
    pressureMap[scored.direction] = calculatePressure(scored, downstream);
    scoreMap[scored.direction] = scored.priorityScore;
    flowMap[scored.direction] = scored.personFlow;
    spillbackMap[scored.direction] = scored.spillbackBoost;
    starvationMap[scored.direction] = scored.starvationOverride;
  });

  // ─── Select Winning Phase ────────────────────────────────
  let winningDir = "";
  let highestPressure = -Infinity;

  Object.entries(pressureMap).forEach(([dir, pressure]) => {
    if (pressure > highestPressure) {
      highestPressure = pressure;
      winningDir = dir;
    }
  });

  // ─── Step 4: Calculate Green Duration ───────────────────
  const winningScore = scoreMap[winningDir] ?? 0;
  let greenDuration = calculateGreenTime(winningScore);
  let extendGreen = false;

  // ─── Step 5: Adaptive Extension ─────────────────────────
  if (
    currentPhase.currentPhaseId === `PHASE_${winningDir}_GREEN` &&
    shouldExtendGreen(currentPhase)
  ) {
    greenDuration = Math.min(
      currentPhase.currentGreenDuration + EXTENSION_SEC,
      MAX_GREEN,
    );
    extendGreen = true;
    console.log(
      `[EXTEND] ${winningDir}: ` +
        `extending green by ${EXTENSION_SEC}s → ${greenDuration}s total`,
    );
  }

  console.log(
    `[OPTIMIZER] Junction ${junctionId}: ` +
      `${winningDir} selected | ` +
      `Pressure: ${highestPressure.toFixed(2)} | ` +
      `Green: ${greenDuration}s | ` +
      `People: ${flowMap[winningDir]}`,
  );

  return {
    junctionId,
    timestamp: new Date().toISOString(),
    dataSource: "LIVE",
    targetPhaseId: `PHASE_${winningDir}_GREEN`,
    greenDuration,
    yellowDuration: YELLOW_TIME,
    allRedDuration: ALL_RED_TIME,
    pressureSnapshot: pressureMap,
    priorityScores: scoreMap,
    personFlows: flowMap,
    spillbackFlags: spillbackMap,
    starvationFlags: starvationMap,
    extendGreen,
    winningDirection: winningDir,
  };
}

// ─── EMV Pause/Resume System (per-instance, no shared global state) ───────────
// Each controller owns its own pause registry, so an EMV corridor at one
// junction can never leak into another junction handled by a different
// optimizer instance (or a later run that reuses the same junction id).
export class MaxPressureOptimizer {
  private readonly pausedJunctions = new Set<string>();

  /** Suspend normal optimization for a junction while an EMV corridor is active. */
  public pause(junctionId: string): void {
    this.pausedJunctions.add(junctionId);
    console.log(
      `[PAUSED] Junction ${junctionId} — EMV corridor active. ` +
        `Normal optimizer suspended.`,
    );
  }

  /** Resume normal max-pressure optimization once the corridor has cleared. */
  public resume(junctionId: string): void {
    this.pausedJunctions.delete(junctionId);
    console.log(
      `[RESUMED] Junction ${junctionId} — returning to normal mode. ` +
        `Max-pressure recovery begins automatically.`,
    );
  }

  /** Whether a junction is currently paused for an EMV corridor. */
  public isPaused(junctionId: string): boolean {
    return this.pausedJunctions.has(junctionId);
  }

  /**
   * Runs the optimizer for a junction. While paused for an EMV corridor it
   * yields a control-handoff plan; otherwise it delegates to the pure,
   * stateless max-pressure computation.
   */
  public run(
    junctionId: string,
    approaches: ApproachMetrics[],
    downstream: DownstreamDensity[],
    currentPhase: PhaseState,
    confidenceScore: number,
    historicalGreenTime?: number,
  ): ProposedPlan {
    if (this.pausedJunctions.has(junctionId)) {
      return buildEMVOverridePlan(junctionId);
    }
    return runMaxPressureOptimizer(
      junctionId,
      approaches,
      downstream,
      currentPhase,
      confidenceScore,
      historicalGreenTime,
    );
  }
}
