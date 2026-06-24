// This code represents the digital boundaries and data contracts (types.ts) for your Layer 3 engine.

// ============================================================
// 1. Vehicle Weights & Detection
// ============================================================

export const VEHICLE_WEIGHTS = {
  Motorcycle: 0.5,
  Car: 1.0,
  AutoRickshaw: 1.2,
  MiniTruck: 2.0,
  Bus: 3.0,
  HeavyTruck: 4.0,
  Ambulance: 10.0,
} as const;

export type VehicleType = keyof typeof VEHICLE_WEIGHTS;

export interface VehicleDetection {
  type: VehicleType;
  count: number;
}

// defines the traffic state for a specific direction
export interface ApproachData {
  approachId: "NORTH" | "SOUTH" | "EAST" | "WEST";
  spatialOccupancyPct: number; // needed for Max-Pressure
  detections: VehicleDetection[];
  waitingTimeSeconds: number; // needed for the Priority Score
  arrivalRatePerMin: number;
}

// ─── Member 1 Input: Metrics for Scoring (Normal-Mode Architect)
export interface ApproachMetrics {
  direction: string;
  detections: VehicleDetection[];
  avgWaitingTime: number;
  arrivalRate: number;
  queueLength: number;
  roadCapacity: number;
  hasBus: boolean;
  hasEmergencyVehicle: boolean;
  lastGreenSeconds: number;
}

// ─── Member 1 Output: Scored Approaches (Normal-Mode Architect)
export interface ScoredApproach {
  direction: string;
  priorityScore: number;
  personFlow: number;
  spillbackBoost: boolean;
  starvationOverride: boolean;
}

// ANPR plate read from Layer 2 (for Challan). Optional on the payload until the
// perception service emits them; the challan store ingests any that arrive.
export interface PlateEvent {
  plate: string;
  approachId: "NORTH" | "SOUTH" | "EAST" | "WEST";
  violation: "RED_LIGHT" | "NO_HELMET" | "WRONG_LANE" | "SPEEDING" | "STOP_LINE";
  speedKmph?: number;
  confidence: number; // 0..1
  evidenceUrl?: string;
}

// ── Bus Lane Violation Detection (from /predict/buslane) ──────
// Mirrors the response shape of GatiShakti-ML's bus lane endpoint.

export interface BusLaneViolation {
  type: string;       // Vehicle class name: "Car", "Bike", "Bicycle"
  bbox: number[];     // [x1, y1, x2, y2] bounding box in image coordinates
}

export interface BusLaneResult {
  unauthorizedCount: number;
  confidenceScore: number;
  violations: BusLaneViolation[];
  annotatedImage: string;  // base64-encoded annotated image with lane outline + violation boxes
}

export interface Layer2Payload {
  junctionId: string;
  timestamp: string;
  cvConfidenceScore: number; // 0.0 to 1.0
  approaches: ApproachData[];
  /** ANPR plate reads + evidence (optional until Layer 2 emits them). */
  plateEvents?: PlateEvent[];
}

// ============================================================
// Member 1: Normal-Mode Architect Scoring Logic
// ============================================================

// ─── Scoring Constants ────────────────────────────────────
export const SCORING_CONSTANTS = {
  WAITING_TIME_FACTOR: 0.5,
  QUEUE_FACTOR: 0.8,
  SPILLBACK_THRESHOLD: 0.85, // If queue > 85% of capacity
  SPILLBACK_BOOST: 15,
  STARVATION_THRESHOLD: 45, // seconds since last green
  STARVATION_BOOST: 20,
  BUS_BONUS: 3,
} as const;

// ─── Helper Functions for Scoring ─────────────────────────
export function calculatePersonFlow(detections: VehicleDetection[]): number {
  return detections.reduce((sum, detection) => {
    const weight = VEHICLE_WEIGHTS[detection.type] ?? 1.0;
    return sum + detection.count * weight;
  }, 0);
}

export function detectSpillback(
  queueLength: number,
  roadCapacity: number,
): boolean {
  return queueLength / roadCapacity > SCORING_CONSTANTS.SPILLBACK_THRESHOLD;
}

export function detectStarvation(lastGreenSeconds: number): boolean {
  return lastGreenSeconds > SCORING_CONSTANTS.STARVATION_THRESHOLD;
}

// ─── Main Scoring Function ──────────────────────────────
export function scoreAllApproaches(
  approaches: ApproachMetrics[],
): ScoredApproach[] {
  return approaches.map((approach) => {
    // Step 1: Base priority from person flow
    const personFlow = calculatePersonFlow(approach.detections);

    // Step 2: Waiting time component
    const waitingComponent =
      approach.avgWaitingTime * SCORING_CONSTANTS.WAITING_TIME_FACTOR;

    // Step 3: Queue utilization component
    const queueUtilization = Math.min(
      approach.queueLength / approach.roadCapacity,
      1.0,
    );
    const queueComponent =
      queueUtilization * 100 * SCORING_CONSTANTS.QUEUE_FACTOR;

    // Step 4: Arrival rate component
    const arrivalComponent = approach.arrivalRate * 2;

    // Step 5: Bus bonus (priority to public transport)
    const busBonus = approach.hasBus ? SCORING_CONSTANTS.BUS_BONUS : 0;

    // Base priority score
    let priorityScore =
      personFlow +
      waitingComponent +
      queueComponent +
      arrivalComponent +
      busBonus;

    // Step 6: Spillback detection and boost
    const spillbackDetected = detectSpillback(
      approach.queueLength,
      approach.roadCapacity,
    );
    if (spillbackDetected) {
      priorityScore += SCORING_CONSTANTS.SPILLBACK_BOOST;
    }

    // Step 7: Starvation prevention and boost
    const starvationDetected = detectStarvation(approach.lastGreenSeconds);
    if (starvationDetected) {
      priorityScore += SCORING_CONSTANTS.STARVATION_BOOST;
    }

    return {
      direction: approach.direction,
      priorityScore,
      personFlow,
      spillbackBoost: spillbackDetected,
      starvationOverride: starvationDetected,
    };
  });
}

// ============================================================
// 3. Emergency Dispatch System (EMVS)
// ============================================================
export type PriorityClass = "CRITICAL" | "HIGH" | "NORMAL";

// Used in the mathematical formula to resolve conflicts if two ambulances arrive at once
export const PRIORITY_CLASS_MULTIPLIER: Record<PriorityClass, number> = {
  CRITICAL: 3,
  HIGH: 2,
  NORMAL: 1,
};

// Live EMV device telemetry (Layer 1, second sensing stream). NOT covered by
// the token signature — it is continuous and checked for consistency against
// the signed claims by the EmvVerifier at the Layer 3 gate.
export interface EmvGpsTrack {
  lat: number;
  lng: number;
  headingDeg: number; // 0 = north, 90 = east
  speedMps: number;
  timestamp: number; // epoch ms when the fix was taken
}

// A signed, time-bound, route-scoped, revocable corridor token (Architecture
// v2.0 §5). The first block is the SIGNED claim set; `signature` is the Ed25519
// signature over those claims; `gpsTrack` is the live, unsigned telemetry.
export interface EmergencyToken {
  // ─── signed claims ──────────────────────────────────────
  emvId: string;
  priorityClass: PriorityClass;
  etaSeconds: number;
  targetPhaseId: string; // Which phase they need to turn green
  routeJunctions: string[]; // route scope: junctions this token is valid for
  issuedAt: number; // epoch ms — issued at dispatch
  expiresAt: number; // epoch ms — time-bound expiry
  tokenId: string; // unique id, used for revocation
  // ─── trust envelope ─────────────────────────────────────
  signature: string; // base64 Ed25519 signature over the canonical claims
  gpsTrack: EmvGpsTrack; // live telemetry (unsigned)
}

// ============================================================
// 4. Historical Fallback Database
// ============================================================
export interface HistoricalTimingPlan {
  phaseId: string;
  recommendedGreenTime: number;
  historicalDemand: number;
}

// ============================================================
// 5. Optimization Proposal (Normal-Mode Architect Output)
// ============================================================
export interface OptimizationProposal {
  approachId: "NORTH" | "SOUTH" | "EAST" | "WEST";
  priorityScore: number; // Person-centric weighted vehicle count
  proposedGreenTime: number; // Calculated via Max-Pressure formula
  method: "MAX_PRESSURE";
  timestamp: string;
}

// ============================================================
// 6. Emergency Response (Emergency Pathfinder Output)
// ============================================================
export interface EmergencyResponse {
  emvId: string;
  targetPhaseId: "NORTH" | "SOUTH" | "EAST" | "WEST";
  conflictIndex: number; // Priority Class * 100 - ETA
  requiredGreenDuration: number; // How long this phase needs green
  executionUrgency: "CRITICAL" | "HIGH" | "NORMAL";
  timestamp: string;
}

// ============================================================
// 7. Actuation Command (Output to Layer 4 - Hardware)
// ============================================================
export interface ActuationCommand {
  junctionId: string;
  commandId: string;
  targetPhaseId: string;
  durationSeconds: number;
  clearanceIntervals: {
    yellowSeconds: number;
    allRedSeconds: number;
  };
  executionMode:
    | "NORMAL_MAX_PRESSURE"
    | "GREEN_CORRIDOR"
    | "SAFE_DEFAULT"
    | "HISTORICAL_FALLBACK"
    | "MANUAL_OVERRIDE";
}
