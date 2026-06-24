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

import {
  classCountsFromDetections,
  congestionLevel,
  type ClassCounts,
  type CongestionLevel,
} from "./congestion";
import { LIVE_JUNCTION } from "./junctions";
import { calculatePersonFlow } from "../types/types";
import type { OrchestratorResult } from "../stm-orchestrator";
import type { LadderState } from "../resilience-handler";
import type { CorridorSnapshot } from "../emv/corridor-manager";
import type { ActuationCommand, BusLaneResult, Layer2Payload, EmergencyToken } from "../types/types";

/** Where this cycle's perception came from. */
export type PerceptionSource = "LIVE_CV" | "MOCK_FALLBACK";

/** High-level timing plan the decision falls under (doc contract + MANUAL). */
export type PlanType =
  | "MAX_PRESSURE"
  | "STARVATION"
  | "TOD_FALLBACK"
  | "EMERGENCY"
  | "MANUAL";

/** Per-approach state, pre-summed for direct rendering. */
export interface ApproachSnapshot {
  approachId: "NORTH" | "SOUTH" | "EAST" | "WEST";
  spatialOccupancyPct: number;
  totalVehicles: number;
  waitingTimeSeconds: number;
  /** Convenience flag: is this the phase Layer 3 chose to drive green. */
  isGreen: boolean;
  /** Queue length in metres (derived from occupancy when not measured). */
  queueLengthM: number;
  /** 5-step congestion ramp for this approach. */
  congestionLevel: CongestionLevel;
  /** car/bike/auto/bus/truck split. */
  classCounts: ClassCounts;
}

/** Active emergency corridor, or null when none. */
export interface EmergencySnapshot {
  emvId: string;
  priorityClass: EmergencyToken["priorityClass"];
  targetPhaseId: string;
  etaSeconds: number;
}

/** Optimisation telemetry that justified the decision (doc contract). */
export interface OptimizationMetrics {
  /** Total person-weighted demand (PCU) across all approaches. */
  totalPressurePcu: number;
  /** PCU served by the chosen green phase this cycle. */
  servedPcu: number;
  /** Whether the starvation guard influenced this cycle. */
  starvationGuardActive: boolean;
}

export type SignalColor = "RED" | "GREEN" | "YELLOW";
export type ControllerType = "NTCIP" | "GPIO" | "VENDOR" | "SIMULATED";

/** Layer 4 (Communication & Control) read-back — stm.l4.controller.v1. */
export interface ControllerSnapshot {
  controllerType: ControllerType;
  /** Actual light state per approach as reported by the controller. */
  signalState: Record<"NORTH" | "SOUTH" | "EAST" | "WEST", SignalColor>;
  /** Did the controller apply the command, and the round-trip time. */
  commandAck: { applied: boolean; rttMs: number };
  junctionHealth: {
    edgeStatus: "ONLINE" | "DEGRADED" | "OFFLINE";
    brokerConnected: boolean;
    lastHeartbeat: string;
  };
}

/** Everything the live-ops dashboard needs for one cycle. */
export interface CycleSnapshot {
  cycle: number;
  /** ISO-8601 UTC; the frontend formats for display. */
  timestamp: string;
  junctionId: string;
  /** Operator code (e.g. JN-ITO). */
  code: string;
  name: string;
  zone: string;
  lat: number;
  lng: number;
  /** Max approach congestion, normalised 0–1. */
  congestionScore: number;

  perception: {
    source: PerceptionSource;
    cvConfidenceScore: number;
    approaches: ApproachSnapshot[];
  };

  emergency: EmergencySnapshot | null;

  /** Multi-junction Green-Corridor state (routing, reservations, sequencing). */
  corridor: CorridorSnapshot;

  /** 4-state resilience ladder + the link health behind it. */
  resilience: {
    ladderState: LadderState;
    brokerConnected: boolean;
    heartbeatAgeMs: number;
    edgeComputeOk: boolean;
  };

  controller: ControllerSnapshot;

  /** Bus lane violation detection results (from /predict/buslane), if available. */
  busLane?: {
    unauthorizedCount: number;
    confidenceScore: number;
    violations: { type: string; bbox: number[] }[];
    annotatedImage: string;
  };

  decision: {
    executionPath: string; // NORMAL_MODE | EMERGENCY_MODE | FALLBACK_MODE
    targetPhaseId: string;
    durationSeconds: number;
    executionMode: string;
    planType: PlanType;
    optimizationMetrics: OptimizationMetrics;
    clearanceIntervals: { yellowSeconds: number; allRedSeconds: number };
    safetyValidationPassed: boolean;
    confidenceScore: number;
    reasonChain: string[];
  };
}

/** Crude but stable queue-length estimate (metres) from occupancy. */
function queueLengthFromOccupancy(occupancyPct: number): number {
  // Assume a ~120 m approach storage at full occupancy.
  return Math.round((occupancyPct / 100) * 120);
}

function planTypeFor(executionMode: string, reasonChain: string[]): PlanType {
  switch (executionMode) {
    case "MANUAL_OVERRIDE":
      return "MANUAL";
    case "GREEN_CORRIDOR":
      return "EMERGENCY";
    case "HISTORICAL_FALLBACK":
    case "SAFE_DEFAULT":
      return "TOD_FALLBACK";
    case "NORMAL_MAX_PRESSURE":
    default:
      return reasonChain.some((r) => /starv/i.test(r)) ? "STARVATION" : "MAX_PRESSURE";
  }
}

/** Build a CycleSnapshot from raw cycle inputs/outputs (no UI logic leaks into the loop). */
export function buildSnapshot(args: {
  cycle: number;
  layer2: Layer2Payload;
  source: PerceptionSource;
  emergency: EmergencyToken | null;
  result: OrchestratorResult;
  corridor: CorridorSnapshot;
  busLane?: BusLaneResult | null;
}): CycleSnapshot {
  const { cycle, layer2, source, emergency, result, corridor, busLane } = args;
  const greenPhase = result.finalCommand.targetPhaseId;

  const approaches: ApproachSnapshot[] = layer2.approaches.map((a) => ({
    approachId: a.approachId,
    spatialOccupancyPct: a.spatialOccupancyPct,
    totalVehicles: a.detections.reduce((s, d) => s + d.count, 0),
    waitingTimeSeconds: a.waitingTimeSeconds,
    isGreen: a.approachId === greenPhase,
    queueLengthM: queueLengthFromOccupancy(a.spatialOccupancyPct),
    congestionLevel: congestionLevel(a.spatialOccupancyPct),
    classCounts: classCountsFromDetections(a.detections),
  }));

  const congestionScore =
    approaches.reduce((m, a) => Math.max(m, a.spatialOccupancyPct), 0) / 100;

  const totalPressurePcu = Math.round(
    layer2.approaches.reduce((s, a) => s + calculatePersonFlow(a.detections), 0),
  );
  const greenApproach = layer2.approaches.find((a) => a.approachId === greenPhase);
  const servedPcu = greenApproach
    ? Math.round(calculatePersonFlow(greenApproach.detections))
    : 0;
  const mode = (result.finalCommand as ActuationCommand).executionMode;

  // Layer 4 controller read-back (simulated hardware). Green phase shows GREEN,
  // all others RED; health follows the perception source.
  const phases: ("NORTH" | "SOUTH" | "EAST" | "WEST")[] = ["NORTH", "SOUTH", "EAST", "WEST"];
  const signalState = phases.reduce(
    (acc, p) => ((acc[p] = p === greenPhase ? "GREEN" : "RED"), acc),
    {} as Record<"NORTH" | "SOUTH" | "EAST" | "WEST", "RED" | "GREEN" | "YELLOW">,
  );
  // Edge status follows the resilience ladder: a total fault is OFFLINE, a lost
  // broker / degraded sensing / mock perception is DEGRADED, otherwise ONLINE.
  const edgeStatus: "ONLINE" | "DEGRADED" | "OFFLINE" =
    result.ladderState === "TOTAL_FAILSAFE"
      ? "OFFLINE"
      : result.ladderState !== "FULL_ADAPTIVE" || source !== "LIVE_CV"
        ? "DEGRADED"
        : "ONLINE";
  const controller: CycleSnapshot["controller"] = {
    controllerType: "SIMULATED",
    signalState,
    commandAck: { applied: result.safetyValidationPassed, rttMs: 28 + (cycle % 6) * 5 },
    junctionHealth: {
      edgeStatus,
      // Real link health from the resilience LinkMonitor (no longer hardcoded).
      brokerConnected: result.link.brokerConnected,
      lastHeartbeat: new Date(Date.now() - result.link.heartbeatAgeMs).toISOString(),
    },
  };

  return {
    cycle,
    timestamp: new Date().toISOString(),
    junctionId: layer2.junctionId,
    code: LIVE_JUNCTION.code,
    name: LIVE_JUNCTION.name,
    zone: LIVE_JUNCTION.zone,
    lat: LIVE_JUNCTION.lat,
    lng: LIVE_JUNCTION.lng,
    congestionScore,
    perception: {
      source,
      cvConfidenceScore: layer2.cvConfidenceScore,
      approaches,
    },
    emergency: emergency
      ? {
          emvId: emergency.emvId,
          priorityClass: emergency.priorityClass,
          targetPhaseId: emergency.targetPhaseId,
          etaSeconds: emergency.etaSeconds,
        }
      : null,
    corridor,
    ...(busLane ? {
      busLane: {
        unauthorizedCount: busLane.unauthorizedCount,
        confidenceScore: busLane.confidenceScore,
        violations: busLane.violations,
        annotatedImage: busLane.annotatedImage,
      },
    } : {}),
    resilience: {
      ladderState: result.ladderState,
      brokerConnected: result.link.brokerConnected,
      heartbeatAgeMs: result.link.heartbeatAgeMs,
      edgeComputeOk: result.link.edgeComputeOk,
    },
    controller,
    decision: {
      executionPath: result.executionPath,
      targetPhaseId: result.finalCommand.targetPhaseId,
      durationSeconds: result.finalCommand.durationSeconds,
      executionMode: mode,
      planType: planTypeFor(mode, result.reasonChain),
      optimizationMetrics: {
        totalPressurePcu,
        servedPcu,
        starvationGuardActive: result.reasonChain.some((r) => /starv/i.test(r)),
      },
      clearanceIntervals: result.finalCommand.clearanceIntervals,
      safetyValidationPassed: result.safetyValidationPassed,
      confidenceScore: result.confidenceScore,
      reasonChain: result.reasonChain,
    },
  };
}
