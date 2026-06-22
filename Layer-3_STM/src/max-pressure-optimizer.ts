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
// Geometric weight on the downstream term (Wj) — how hard a saturated downstream
// suppresses release. Tuned so a fully-jammed exit (100%) cancels a comparable
// amount of upstream demand.
const DOWNSTREAM_WEIGHT = 1.0;
// Post-corridor recovery: after an EMV corridor dissolves, the held approaches
// accumulated spillback. For RECOVERY_CYCLES cycles they get an explicit demand
// boost (Wr·occupancy) so the optimizer grants them extended green to clear it.
const RECOVERY_CYCLES = 3;
const RECOVERY_BOOST_WEIGHT = 2.0;
const DEFAULT_HISTORICAL_GREEN = 30;

// ─── Pressure Calculation (True Max-Pressure, additive form) ─────────────────
// Classic max-pressure releases the movement whose UPSTREAM demand exceeds what
// the DOWNSTREAM can absorb. We compute the spec's additive differential
//   Pm = max(0, Σ_upstream(Wi·Oi) − Σ_downstream(Wj·Oj))
// where the upstream term is the person-weighted demand score (Wi·Oi already
// folded into priorityScore via VEHICLE_WEIGHTS + queue/wait), and the downstream
// term is a geometric-weighted exit occupancy that subtracts available headroom.
// Starved approaches drop the downstream penalty so they are eventually served;
// during post-corridor recovery the held approaches get an extra demand boost.
function calculatePressure(
  scored: ScoredApproach,
  downstream: DownstreamDensity[],
  recoveryActive: boolean,
): number {
  const ds = downstream.find(
    (d) => d.direction.toUpperCase() === scored.direction,
  );
  const downstreamOccupancyPct = ds ? ds.occupancyPct : 0;

  // Σ_upstream(Wi·Oi): person-weighted demand, plus a recovery boost that lets
  // the high-occupancy held approaches reclaim green after a corridor.
  const recoveryBoost = recoveryActive
    ? RECOVERY_BOOST_WEIGHT * downstreamOccupancyPct
    : 0;
  const upstreamDemand = scored.priorityScore + recoveryBoost;

  // Σ_downstream(Wj·Oj): saturation penalty; starved approaches bypass it.
  const downstreamPenalty = scored.starvationOverride
    ? 0
    : DOWNSTREAM_WEIGHT * downstreamOccupancyPct;

  return Math.max(0, upstreamDemand - downstreamPenalty);
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
  recoveryActive: boolean = false,
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
    pressureMap[scored.direction] = calculatePressure(scored, downstream, recoveryActive);
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
  // Remaining post-corridor recovery cycles per junction (>0 ⇒ boost held
  // approaches so they clear the spillback that built up during the corridor).
  private readonly recoveryCycles = new Map<string, number>();

  /** Suspend normal optimization for a junction while an EMV corridor is active. */
  public pause(junctionId: string): void {
    this.pausedJunctions.add(junctionId);
    console.log(
      `[PAUSED] Junction ${junctionId} — EMV corridor active. ` +
        `Normal optimizer suspended.`,
    );
  }

  /** Resume normal max-pressure optimization once the corridor has cleared, and
   *  arm the explicit post-corridor recovery window for the held approaches. */
  public resume(junctionId: string): void {
    this.pausedJunctions.delete(junctionId);
    this.recoveryCycles.set(junctionId, RECOVERY_CYCLES);
    console.log(
      `[RESUMED] Junction ${junctionId} — returning to normal mode. ` +
        `Post-corridor recovery armed for ${RECOVERY_CYCLES} cycles ` +
        `(held approaches get extra green to clear spillback).`,
    );
  }

  /** Whether a junction is currently paused for an EMV corridor. */
  public isPaused(junctionId: string): boolean {
    return this.pausedJunctions.has(junctionId);
  }

  /** Whether a junction is in its post-corridor recovery window this cycle. */
  public isRecovering(junctionId: string): boolean {
    return (this.recoveryCycles.get(junctionId) ?? 0) > 0;
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

    // Consume one recovery cycle (if armed) and apply the held-approach boost.
    const remaining = this.recoveryCycles.get(junctionId) ?? 0;
    const recoveryActive = remaining > 0;
    if (recoveryActive) {
      if (remaining <= 1) this.recoveryCycles.delete(junctionId);
      else this.recoveryCycles.set(junctionId, remaining - 1);
      console.log(
        `[RECOVERY] Junction ${junctionId} — post-corridor recovery active ` +
          `(${remaining} cycle(s) left): boosting held approaches.`,
      );
    }

    return runMaxPressureOptimizer(
      junctionId,
      approaches,
      downstream,
      currentPhase,
      confidenceScore,
      historicalGreenTime,
      recoveryActive,
    );
  }
}
