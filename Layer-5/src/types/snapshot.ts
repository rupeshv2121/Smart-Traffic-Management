// ============================================================
// snapshot.ts — Layer 5 view of the dashboard data contract.
//
// MIRROR of Layer-3_STM/src/dashboard/{snapshot,city,congestion}.ts (the
// source of truth). Keep in sync: if the gateway adds a field, add it here too.
// ============================================================

export type PerceptionSource = "LIVE_CV" | "MOCK_FALLBACK";

export type ApproachId = "NORTH" | "SOUTH" | "EAST" | "WEST";

export type PriorityClass = "CRITICAL" | "HIGH" | "NORMAL";

export type PlanType =
  | "MAX_PRESSURE"
  | "STARVATION"
  | "TOD_FALLBACK"
  | "EMERGENCY"
  | "MANUAL";

/** Fixed 5-step congestion ramp, low → high. */
export type CongestionLevel = "CLEAR" | "SMOOTH" | "MODERATE" | "HEAVY" | "GRIDLOCK";

export interface ClassCounts {
  car: number;
  bike: number;
  auto: number;
  bus: number;
  truck: number;
}

export interface ApproachSnapshot {
  approachId: ApproachId;
  spatialOccupancyPct: number;
  totalVehicles: number;
  waitingTimeSeconds: number;
  isGreen: boolean;
  queueLengthM: number;
  congestionLevel: CongestionLevel;
  classCounts: ClassCounts;
}

export interface EmergencySnapshot {
  emvId: string;
  priorityClass: PriorityClass;
  targetPhaseId: string;
  etaSeconds: number;
}

export interface OptimizationMetrics {
  totalPressurePcu: number;
  servedPcu: number;
  starvationGuardActive: boolean;
}

export type SignalColor = "RED" | "GREEN" | "YELLOW";
export type ControllerType = "NTCIP" | "GPIO" | "VENDOR" | "SIMULATED";

// ── Green-Corridor (EMVS / TI) ───────────────────────────────
// Mirror of Layer-3_STM/src/emv/corridor-manager.ts.

export type CorridorStatus = "IDLE" | "CORRIDOR_ACTIVE" | "CONFLICT" | "ARRIVED";
export type LegState = "RESERVED" | "CLEARED" | "PENDING" | "ABANDONED";
export type TiState = "STANDBY" | "MONITORING" | "DEVIATION" | "COMPLETED";

export interface CorridorLeg {
  junctionId: string;
  code: string;
  index: number;
  state: LegState;
}

export interface CorridorView {
  emvId: string;
  tokenId: string;
  priorityClass: PriorityClass;
  etaSeconds: number;
  targetPhaseId: string;
  /** Ordered junction codes along the planned route. */
  route: string[];
  legs: CorridorLeg[];
  currentIndex: number;
  granted: boolean;
  heldReason: string | null;
  replans: number;
  status: CorridorStatus;
  /** 0–1: cleared legs / total legs — the TI compliance score. */
  compliance: number;
}

export interface CorridorSnapshot {
  status: CorridorStatus;
  tiState: TiState;
  active: CorridorView | null;
  conflicts: CorridorView[];
  all: CorridorView[];
  reservedJunctions: number;
}

// ── Resilience ladder ────────────────────────────────────────
// Mirror of Layer-3_STM/src/resilience-handler.ts LadderState.

export type LadderState =
  | "FULL_ADAPTIVE"
  | "DEGRADED_SENSING"
  | "LOCALLY_AUTONOMOUS"
  | "TOTAL_FAILSAFE";

export interface ResilienceSnapshot {
  ladderState: LadderState;
  brokerConnected: boolean;
  heartbeatAgeMs: number;
  edgeComputeOk: boolean;
}

export interface ControllerSnapshot {
  controllerType: ControllerType;
  signalState: Record<ApproachId, SignalColor>;
  commandAck: { applied: boolean; rttMs: number };
  junctionHealth: {
    edgeStatus: "ONLINE" | "DEGRADED" | "OFFLINE";
    brokerConnected: boolean;
    lastHeartbeat: string;
  };
}

export interface CycleSnapshot {
  cycle: number;
  timestamp: string;
  junctionId: string;
  code: string;
  name: string;
  zone: string;
  lat: number;
  lng: number;
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
  resilience: ResilienceSnapshot;
  controller: ControllerSnapshot;
  /** Bus lane violation detection results (from /predict/buslane), if available. */
  busLane?: {
    unauthorizedCount: number;
    confidenceScore: number;
    violations: { type: string; bbox: number[] }[];
    annotatedImage: string;
  };
  decision: {
    executionPath: string;
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

// ── City map (Command Dashboard) ─────────────────────────────

export type CityPhase = "NS" | "EW";

export interface JunctionSummary {
  id: string;
  code: string;
  name: string;
  zone: string;
  lat: number;
  lng: number;
  live: boolean;
  activePhase: CityPhase;
  planType: PlanType;
  congestionScore: number;
  congestionLevel: CongestionLevel;
  vehicleCount: number;
  emergencyActive: boolean;
}

export type IncidentKind = "GRIDLOCK" | "EMERGENCY" | "SAFETY" | "DEGRADED";

export interface CityIncident {
  id: string;
  junctionId: string;
  junctionCode: string;
  kind: IncidentKind;
  severity: "critical" | "warning" | "info";
  message: string;
  ts: string;
}

export interface CitySnapshot {
  generatedAt: string;
  totalJunctions: number;
  nodesOnline: number;
  activeCorridors: number;
  totalVehicles: number;
  junctions: JunctionSummary[];
  incidents: CityIncident[];
}
