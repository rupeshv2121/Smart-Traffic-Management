// ============================================================
// snapshot.ts — the Layer 5 (Dashboard) data contract
//
// One CycleSnapshot is produced by the live loop every pipeline cycle and
// pushed to subscribed dashboards over SSE (see dashboard-gateway.ts). It is a
// flattened, UI-friendly projection of the orchestrator's internal state — the
// dashboard never imports Layer-3 internals, it consumes only this shape.
//
// SOURCE OF TRUTH: this file. The Layer-5 frontend mirrors it in
// Layer-5/src/types/snapshot.ts — keep the two in sync.
// ============================================================

import type { OrchestratorResult } from "../stm-orchestrator";
import type { Layer2Payload, EmergencyToken } from "../types/types";

/** Where this cycle's perception came from. */
export type PerceptionSource = "LIVE_CV" | "MOCK_FALLBACK";

/** Per-approach state, pre-summed for direct rendering. */
export interface ApproachSnapshot {
  approachId: "NORTH" | "SOUTH" | "EAST" | "WEST";
  spatialOccupancyPct: number;
  totalVehicles: number;
  waitingTimeSeconds: number;
  /** Convenience flag: is this the phase Layer 3 chose to drive green. */
  isGreen: boolean;
}

/** Active emergency corridor, or null when none. */
export interface EmergencySnapshot {
  emvId: string;
  priorityClass: EmergencyToken["priorityClass"];
  targetPhaseId: string;
  etaSeconds: number;
}

/** Everything the live-ops dashboard needs for one cycle. */
export interface CycleSnapshot {
  cycle: number;
  /** ISO-8601 UTC; the frontend formats for display. */
  timestamp: string;
  junctionId: string;

  perception: {
    source: PerceptionSource;
    cvConfidenceScore: number;
    approaches: ApproachSnapshot[];
  };

  emergency: EmergencySnapshot | null;

  decision: {
    executionPath: string; // NORMAL_MODE | EMERGENCY_MODE | FALLBACK_MODE
    targetPhaseId: string;
    durationSeconds: number;
    executionMode: string;
    clearanceIntervals: { yellowSeconds: number; allRedSeconds: number };
    safetyValidationPassed: boolean;
    confidenceScore: number;
    reasonChain: string[];
  };
}

/** Build a CycleSnapshot from raw cycle inputs/outputs (no UI logic leaks into the loop). */
export function buildSnapshot(args: {
  cycle: number;
  layer2: Layer2Payload;
  source: PerceptionSource;
  emergency: EmergencyToken | null;
  result: OrchestratorResult;
}): CycleSnapshot {
  const { cycle, layer2, source, emergency, result } = args;
  const greenPhase = result.finalCommand.targetPhaseId;

  return {
    cycle,
    timestamp: new Date().toISOString(),
    junctionId: layer2.junctionId,
    perception: {
      source,
      cvConfidenceScore: layer2.cvConfidenceScore,
      approaches: layer2.approaches.map((a) => ({
        approachId: a.approachId,
        spatialOccupancyPct: a.spatialOccupancyPct,
        totalVehicles: a.detections.reduce((s, d) => s + d.count, 0),
        waitingTimeSeconds: a.waitingTimeSeconds,
        isGreen: a.approachId === greenPhase,
      })),
    },
    emergency: emergency
      ? {
          emvId: emergency.emvId,
          priorityClass: emergency.priorityClass,
          targetPhaseId: emergency.targetPhaseId,
          etaSeconds: emergency.etaSeconds,
        }
      : null,
    decision: {
      executionPath: result.executionPath,
      targetPhaseId: result.finalCommand.targetPhaseId,
      durationSeconds: result.finalCommand.durationSeconds,
      executionMode: result.finalCommand.executionMode,
      clearanceIntervals: result.finalCommand.clearanceIntervals,
      safetyValidationPassed: result.safetyValidationPassed,
      confidenceScore: result.confidenceScore,
      reasonChain: result.reasonChain,
    },
  };
}
