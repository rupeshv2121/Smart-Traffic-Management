// ============================================================
// snapshot.ts — Layer 5 view of the dashboard data contract.
//
// MIRROR of Layer-3_STM/src/dashboard/snapshot.ts (the source of truth).
// Keep the two in sync: if the gateway adds a field, add it here too.
// ============================================================

export type PerceptionSource = "LIVE_CV" | "MOCK_FALLBACK";

export type ApproachId = "NORTH" | "SOUTH" | "EAST" | "WEST";

export type PriorityClass = "CRITICAL" | "HIGH" | "NORMAL";

export interface ApproachSnapshot {
  approachId: ApproachId;
  spatialOccupancyPct: number;
  totalVehicles: number;
  waitingTimeSeconds: number;
  isGreen: boolean;
}

export interface EmergencySnapshot {
  emvId: string;
  priorityClass: PriorityClass;
  targetPhaseId: string;
  etaSeconds: number;
}

export interface CycleSnapshot {
  cycle: number;
  timestamp: string;
  junctionId: string;
  perception: {
    source: PerceptionSource;
    cvConfidenceScore: number;
    approaches: ApproachSnapshot[];
  };
  emergency: EmergencySnapshot | null;
  decision: {
    executionPath: string;
    targetPhaseId: string;
    durationSeconds: number;
    executionMode: string;
    clearanceIntervals: { yellowSeconds: number; allRedSeconds: number };
    safetyValidationPassed: boolean;
    confidenceScore: number;
    reasonChain: string[];
  };
}
