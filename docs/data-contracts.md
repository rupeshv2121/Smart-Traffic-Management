# 09 · Data Contracts

> Every schema that crosses a layer boundary, with field-level definitions, ownership and the file that is the
> source of truth. If a document and its source file disagree, the file wins and the document is a defect.

| Contract | Direction | Source of truth | Mirrored in |
|---|---|---|---|
| `Layer2Payload` | L2 → L3 | `Layer-3_STM/src/types/types.ts` | `GatiShakti-ML/app.py` (Pydantic) |
| `EmergencyToken` | L1 → L3 | `Layer-3_STM/src/types/types.ts` | — |
| `ActuationCommand` | L3 → L4 | `Layer-3_STM/src/types/types.ts` + [L3-L4 contract](L3-L4-actuation-contract.md) | L4 implementation |
| `CycleSnapshot` | L3 → L5 | `Layer-3_STM/src/dashboard/snapshot.ts` | `Layer-5/src/types/snapshot.ts` |
| `CitySnapshot` | L3 → L5 | `Layer-3_STM/src/dashboard/city.ts` | `Layer-5/src/types/snapshot.ts` |
| `CorridorSnapshot` | L3 → L5 | `Layer-3_STM/src/emv/corridor-manager.ts` | inside `CycleSnapshot` |
| REST DTOs | L3 ⇄ L5 | gateway + stores | `Layer-5/src/lib/api.ts` |
| Bridge messages | L5 ⇄ Sim | `Layer-5/src/pages/SimulationPage.tsx` | `SimulationScene.tsx` |

---

## 1. `Layer2Payload` — Layer 2 → Layer 3

```typescript
interface Layer2Payload {
  junctionId: string;         // e.g. "DEL_DL_ITO_01"
  timestamp: string;          // ISO-8601 UTC, when perception was built
  cvConfidenceScore: number;  // 0.0–1.0, calibrated reliability (NOT raw box confidence)
  approaches: ApproachData[]; // one per compass direction present
  plateEvents?: PlateEvent[]; // ANPR reads; optional
}

interface ApproachData {
  approachId: "NORTH" | "SOUTH" | "EAST" | "WEST";
  spatialOccupancyPct: number;   // 5–95, clamped
  detections: VehicleDetection[];
  waitingTimeSeconds: number;    // heuristic from a still frame
  arrivalRatePerMin: number;     // heuristic from a still frame
}

interface VehicleDetection {
  type: VehicleType;             // key of VEHICLE_WEIGHTS
  count: number;
}

interface PlateEvent {
  plate: string;
  approachId: "NORTH" | "SOUTH" | "EAST" | "WEST";
  violation: "RED_LIGHT" | "NO_HELMET" | "WRONG_LANE" | "SPEEDING" | "STOP_LINE";
  speedKmph?: number;            // present on SPEEDING
  confidence: number;            // 0–1
  evidenceUrl?: string;
}
```

### Field semantics

| Field | Consumed by | Notes |
|---|---|---|
| `timestamp` | Staleness gate (Stage 1) | Age > 10 s forces historical fallback. Should be stamped at *capture*, not at payload build, once real cameras are wired |
| `cvConfidenceScore` | Resilience gate (Stage 2) | Critical threshold 0.70, warning 0.80. Calibrated as `0.5 + 0.5·mean(box confidences)`; empty-but-clear frame yields 0.90 |
| `spatialOccupancyPct` | Queue length, downstream penalty | Clamped [5, 95] so downstream arithmetic stays stable |
| `detections` | Person-flow scoring | Guaranteed non-empty (`[{Car, 0}]` when nothing detected) |
| `waitingTimeSeconds` | Priority score (×0.5) | Estimate: `min(120, vehicleCount × 4)` |
| `arrivalRatePerMin` | Priority score (×2) | Estimate: `min(40, vehicleCount × 2)` |
| `plateEvents` | Challan queue | Never enters the control path |

### Vehicle taxonomy and weights

```typescript
export const VEHICLE_WEIGHTS = {
  Motorcycle: 0.5, Car: 1.0, AutoRickshaw: 1.2, MiniTruck: 2.0,
  Bus: 3.0, HeavyTruck: 4.0, Ambulance: 10.0,
} as const;
```

`AutoRickshaw` and `MiniTruck` are not currently produced by the COCO-trained model. `Ambulance` is **never**
emitted from vision — emergencies enter only via the signed-token channel.

### Example

```json
{
  "junctionId": "DEL_DL_ITO_01",
  "timestamp": "2026-09-05T09:14:30.412Z",
  "cvConfidenceScore": 0.8421,
  "approaches": [
    { "approachId": "NORTH", "spatialOccupancyPct": 62,
      "detections": [{"type":"Car","count":18},{"type":"Motorcycle","count":11},{"type":"Bus","count":1}],
      "waitingTimeSeconds": 120, "arrivalRatePerMin": 40 },
    { "approachId": "SOUTH", "spatialOccupancyPct": 31,
      "detections": [{"type":"Car","count":9}], "waitingTimeSeconds": 36, "arrivalRatePerMin": 18 },
    { "approachId": "EAST",  "spatialOccupancyPct": 78,
      "detections": [{"type":"Car","count":22},{"type":"HeavyTruck","count":3}],
      "waitingTimeSeconds": 100, "arrivalRatePerMin": 40 },
    { "approachId": "WEST",  "spatialOccupancyPct": 15,
      "detections": [{"type":"Car","count":4}], "waitingTimeSeconds": 16, "arrivalRatePerMin": 8 }
  ],
  "plateEvents": [
    { "plate": "DL3CQR4482", "approachId": "NORTH", "violation": "NO_HELMET", "confidence": 0.912 }
  ]
}
```

---

## 2. `EmergencyToken` — Layer 1 → Layer 3

```typescript
interface EmergencyToken {
  // ─── SIGNED CLAIMS ─────────────────────────────────────────
  emvId: string;                         // vehicle identity
  priorityClass: "CRITICAL" | "HIGH" | "NORMAL";
  etaSeconds: number;                    // claimed time to the junction
  targetPhaseId: string;                 // approach to drive green
  routeJunctions: string[];              // route scope
  issuedAt: number;                      // epoch ms
  expiresAt: number;                     // epoch ms
  tokenId: string;                       // unique; revocation key
  // ─── TRUST ENVELOPE ────────────────────────────────────────
  signature: string;                     // base64 Ed25519 over the canonical claims
  gpsTrack: EmvGpsTrack;                 // live telemetry — DELIBERATELY UNSIGNED
}

interface EmvGpsTrack {
  lat: number; lng: number;
  headingDeg: number;                    // 0 = north, 90 = east
  speedMps: number;
  timestamp: number;                     // epoch ms of the fix
}
```

**Canonical signing string** — pinned order and delimiters; never JSON key ordering:

```
emv-v1|<emvId>|<priorityClass>|<etaSeconds>|<targetPhaseId>|<routeJunctions.join(",")>|<issuedAt>|<expiresAt>|<tokenId>
```

**Priority multipliers:** `CRITICAL` 3 · `HIGH` 2 · `NORMAL` 1.
**Conflict index** (used for logging and ordering): `multiplier × 100 − etaSeconds`.

### Example

```json
{
  "emvId": "AMB-2041",
  "priorityClass": "CRITICAL",
  "etaSeconds": 35,
  "targetPhaseId": "EAST",
  "routeJunctions": ["DEL_DL_ITO_01", "DEL_DL_IG_04", "DEL_DL_AIIMS_05"],
  "issuedAt": 1757062470000,
  "expiresAt": 1757062565000,
  "tokenId": "TKN-1757062470000-3-418822",
  "signature": "MEUCIQD...base64...",
  "gpsTrack": { "lat": 28.6338, "lng": 77.2354, "headingDeg": 245, "speedMps": 12, "timestamp": 1757062470000 }
}
```

---

## 3. `ActuationCommand` — Layer 3 → Layer 4

```typescript
interface ActuationCommand {
  junctionId: string;
  commandId: string;                     // `CMD-${Date.now()}` in L3; globally unique
  targetPhaseId: string;                 // NORTH | SOUTH | EAST | WEST
  durationSeconds: number;
  clearanceIntervals: { yellowSeconds: number; allRedSeconds: number };
  executionMode:
    | "NORMAL_MAX_PRESSURE"
    | "GREEN_CORRIDOR"
    | "SAFE_DEFAULT"
    | "HISTORICAL_FALLBACK"
    | "MANUAL_OVERRIDE";
}
```

The wire form adds `issuedAt` (ISO-8601 UTC) and `schemaVersion` (semver). Full field table, mode resolution,
clearance-ownership rules, MQTT settings and the NTCIP mapping:
[Layer 4](layer-4-communication-and-control.md).

---

## 4. `CycleSnapshot` — Layer 3 → Layer 5

The flattened, UI-ready projection broadcast once per cycle. **Source of truth:**
`Layer-3_STM/src/dashboard/snapshot.ts`.

```typescript
interface CycleSnapshot {
  cycle: number;
  timestamp: string;                     // ISO-8601 UTC
  junctionId: string;
  code: string;                          // operator code, e.g. "JN-ITO"
  name: string;                          // "ITO Crossing"
  zone: string;                          // "Central"
  lat: number; lng: number;
  congestionScore: number;               // max approach occupancy, normalised 0–1

  perception: {
    source: "LIVE_CV" | "MOCK_FALLBACK";
    cvConfidenceScore: number;
    approaches: ApproachSnapshot[];
  };

  emergency: EmergencySnapshot | null;
  corridor: CorridorSnapshot;

  resilience: {
    ladderState: "FULL_ADAPTIVE" | "DEGRADED_SENSING" | "LOCALLY_AUTONOMOUS" | "TOTAL_FAILSAFE";
    brokerConnected: boolean;
    heartbeatAgeMs: number;
    edgeComputeOk: boolean;
  };

  controller: ControllerSnapshot;

  busLane?: {
    unauthorizedCount: number;
    confidenceScore: number;
    violations: { type: string; bbox: number[] }[];
    annotatedImage: string;              // base64 JPEG
  };

  decision: {
    executionPath: string;               // NORMAL_MODE | EMERGENCY_MODE | FALLBACK_MODE | OVERRIDE_MODE
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
```

### Nested types

```typescript
interface ApproachSnapshot {
  approachId: "NORTH" | "SOUTH" | "EAST" | "WEST";
  spatialOccupancyPct: number;
  totalVehicles: number;                 // pre-summed for direct rendering
  waitingTimeSeconds: number;
  isGreen: boolean;                      // is this the phase L3 chose
  queueLengthM: number;                  // occupancy × 120 m storage
  congestionLevel: CongestionLevel;
  classCounts: ClassCounts;
}

interface EmergencySnapshot {
  emvId: string;
  priorityClass: "CRITICAL" | "HIGH" | "NORMAL";
  targetPhaseId: string;
  etaSeconds: number;
}

interface OptimizationMetrics {
  totalPressurePcu: number;              // person-weighted demand across all approaches
  servedPcu: number;                     // PCU served by the chosen phase
  starvationGuardActive: boolean;
}

interface ControllerSnapshot {
  controllerType: "NTCIP" | "GPIO" | "VENDOR" | "SIMULATED";
  signalState: Record<"NORTH"|"SOUTH"|"EAST"|"WEST", "RED"|"GREEN"|"YELLOW">;
  commandAck: { applied: boolean; rttMs: number };
  junctionHealth: {
    edgeStatus: "ONLINE" | "DEGRADED" | "OFFLINE";
    brokerConnected: boolean;
    lastHeartbeat: string;               // ISO-8601
  };
}

type PlanType = "MAX_PRESSURE" | "STARVATION" | "TOD_FALLBACK" | "EMERGENCY" | "MANUAL";
type CongestionLevel = "CLEAR" | "SMOOTH" | "MODERATE" | "HEAVY" | "GRIDLOCK";
interface ClassCounts { car: number; bike: number; auto: number; bus: number; truck: number; }
```

### Derivations

| Field | Derivation |
|---|---|
| `queueLengthM` | `round(occupancyPct / 100 × 120)` — assumes ~120 m approach storage |
| `congestionLevel` | `<20 CLEAR · <40 SMOOTH · <60 MODERATE · <80 HEAVY · else GRIDLOCK` |
| `congestionScore` | `max(approach occupancy) / 100` |
| `classCounts` | Collapses the Layer-3 taxonomy: MiniTruck + HeavyTruck → `truck`; Ambulance excluded (it is an EMV, not civilian traffic) |
| `planType` | `MANUAL_OVERRIDE`→MANUAL · `GREEN_CORRIDOR`→EMERGENCY · `HISTORICAL_FALLBACK`/`SAFE_DEFAULT`→TOD_FALLBACK · otherwise MAX_PRESSURE, or STARVATION if the reason chain mentions starvation |
| `totalPressurePcu` | `Σ calculatePersonFlow(approach.detections)` |
| `servedPcu` | Person flow of the green approach |
| `edgeStatus` | `TOTAL_FAILSAFE`→OFFLINE · ladder ≠ FULL_ADAPTIVE or source ≠ LIVE_CV → DEGRADED · else ONLINE |

---

## 5. `CorridorSnapshot` — nested in `CycleSnapshot`

```typescript
interface CorridorSnapshot {
  status: "IDLE" | "CORRIDOR_ACTIVE" | "CONFLICT" | "ARRIVED";
  tiState: "STANDBY" | "MONITORING" | "DEVIATION" | "COMPLETED";
  active: CorridorView | null;           // the granted corridor
  conflicts: CorridorView[];             // held corridors awaiting their turn
  all: CorridorView[];
  reservedJunctions: number;             // junctions currently held green
}

interface CorridorView {
  emvId: string;
  tokenId: string;
  priorityClass: "CRITICAL" | "HIGH" | "NORMAL";
  etaSeconds: number;
  targetPhaseId: string;
  route: string[];                       // ordered junction CODES (e.g. ["JN-ITO","JN-IG"])
  legs: CorridorLeg[];
  currentIndex: number;
  granted: boolean;
  heldReason: string | null;             // e.g. "held behind AMB-2041 (CRITICAL, ETA 35s)"
  replans: number;                       // D* Lite re-plans; > 0 ⇒ DEVIATION
  status: "IDLE" | "CORRIDOR_ACTIVE" | "CONFLICT" | "ARRIVED";
  compliance: number;                    // cleared legs / total legs, 3 dp
}

interface CorridorLeg {
  junctionId: string;
  code: string;
  index: number;
  state: "RESERVED" | "CLEARED" | "PENDING" | "ABANDONED";
}
```

**Invariant:** at most one `CorridorView` may have `granted === true` at any instant.

---

## 6. `CitySnapshot` — Layer 3 → Layer 5

```typescript
interface CitySnapshot {
  generatedAt: string;                   // ISO-8601
  totalJunctions: number;
  nodesOnline: number;
  activeCorridors: number;
  totalVehicles: number;
  junctions: JunctionSummary[];
  incidents: CityIncident[];
}

interface JunctionSummary {
  id: string; code: string; name: string; zone: string;
  lat: number; lng: number;
  live: boolean;                         // true only for the orchestrated junction
  activePhase: "NS" | "EW";
  planType: PlanType;
  congestionScore: number;               // 0–1
  congestionLevel: CongestionLevel;
  vehicleCount: number;
  emergencyActive: boolean;
}

interface CityIncident {
  id: string; junctionId: string; junctionCode: string;
  kind: "GRIDLOCK" | "EMERGENCY" | "SAFETY" | "DEGRADED";
  severity: "critical" | "warning" | "info";
  message: string;
  ts: string;
}
```

### The junction registry

`Layer-3_STM/src/dashboard/junctions.ts`. One live junction plus eight peers, all real Delhi crossings.

| ID | Code | Name | Zone | Lat | Lng | Live |
|---|---|---|---|---|---|:--:|
| `DEL_DL_ITO_01` | `JN-ITO` | ITO Crossing | Central | 28.6304 | 77.2177 | ✔ |
| `DEL_DL_CP_02` | `JN-CP` | Connaught Place | New Delhi | 28.6315 | 77.2167 | |
| `DEL_DL_MH_03` | `JN-MH` | Mandi House | Central | 28.6258 | 77.2344 | |
| `DEL_DL_IG_04` | `JN-IG` | India Gate C-Hexagon | New Delhi | 28.6129 | 77.2295 | |
| `DEL_DL_AIIMS_05` | `JN-AIIMS` | AIIMS Crossing | South | 28.5672 | 77.2100 | |
| `DEL_DL_DK_06` | `JN-DK` | Dhaula Kuan | South West | 28.5916 | 77.1610 | |
| `DEL_DL_ASH_07` | `JN-ASH` | Ashram Chowk | South East | 28.5733 | 77.2588 | |
| `DEL_DL_MC_08` | `JN-MC` | Moolchand | South | 28.5639 | 77.2360 | |
| `DEL_DL_PB_09` | `JN-PB` | Punjabi Bagh Chowk | West | 28.6680 | 77.1340 | |

Peers are orchestrated through the real M1–M4 pipeline on their own mock perception
(`multi/junctions-controller.ts`) but never enter the live junction's control path.

---

## 7. Internal Layer-3 contracts

These do not cross a service boundary but are the interfaces between pipeline stages.

```typescript
interface ApproachMetrics {              // scoring input
  direction: string;
  detections: VehicleDetection[];
  avgWaitingTime: number;
  arrivalRate: number;
  queueLength: number;
  roadCapacity: number;                  // 100
  hasBus: boolean;
  hasEmergencyVehicle: boolean;
  lastGreenSeconds: number;
}

interface ScoredApproach {               // scoring output
  direction: string;
  priorityScore: number;
  personFlow: number;
  spillbackBoost: boolean;
  starvationOverride: boolean;
}

interface ProposedPlan {                 // optimiser output
  junctionId: string; timestamp: string;
  dataSource: "LIVE" | "HISTORICAL" | "EMV_OVERRIDE";
  targetPhaseId: string;                 // "PHASE_<DIR>_GREEN"
  greenDuration: number; yellowDuration: number; allRedDuration: number;
  pressureSnapshot: Record<string, number>;
  priorityScores:   Record<string, number>;
  personFlows:      Record<string, number>;
  spillbackFlags:   Record<string, boolean>;
  starvationFlags:  Record<string, boolean>;
  extendGreen: boolean;
  winningDirection: string;
}

interface HistoricalTimingPlan {
  phaseId: string;
  recommendedGreenTime: number;
  historicalDemand: number;
}

interface OrchestratorResult {
  finalCommand: ActuationCommand;
  executionPath: string;
  safetyValidationPassed: boolean;
  confidenceScore: number;
  reasonChain: string[];
  ladderState: LadderState;
  link: LinkSnapshot;
}

interface SafetyValidationResult {
  isSafe: boolean;
  command: {
    action: "ACTUATE_OPTIMIZED_PLAN" | "EXECUTE_PHASE_TRANSITION"
          | "MAINTAIN_CURRENT_STATE" | "FORCE_FALLBACK";
    targetPhaseId: string;
    yellowSeconds?: number; allRedSeconds?: number; reason?: string;
  };
}
```

### Scoring constants

```typescript
export const SCORING_CONSTANTS = {
  WAITING_TIME_FACTOR: 0.5,
  QUEUE_FACTOR: 0.8,
  SPILLBACK_THRESHOLD: 0.85,   SPILLBACK_BOOST: 15,
  STARVATION_THRESHOLD: 45,    STARVATION_BOOST: 20,
  BUS_BONUS: 3,
} as const;
```

---

## 8. REST DTOs (Layer 3 ⇄ Layer 5)

```typescript
interface ManualOverride {
  phaseId: "NORTH" | "SOUTH" | "EAST" | "WEST";
  durationSeconds: number;               // clamped [10, 120]
  requestedBy: string; reason: string;
  issuedAt: number; expiresAt: number;
}

interface AuditEntry {
  id: string; ts: string; actor: string;
  action: "DECISION" | "OVERRIDE_REQUESTED" | "OVERRIDE_APPLIED" | "OVERRIDE_DEFERRED"
        | "OVERRIDE_CLEARED" | "SAFETY_BLOCK" | "EMERGENCY";
  junctionId: string; detail: string;
  outcome: "ok" | "blocked" | "info";
}

interface Challan {
  id: string; plate: string;
  junctionCode: string; junctionName: string;
  violation: "RED_LIGHT" | "NO_HELMET" | "WRONG_LANE" | "SPEEDING" | "STOP_LINE";
  ts: string; speedKmph?: number;
  fineRupees: number;                    // 1000 · 1000 · 1500 · 2000 · 500
  status: "PENDING" | "ISSUED" | "REJECTED";
  confidence: number;
  resolvedBy?: string; resolvedAt?: string;
}

interface AnalyticsAggregate {
  cycles: number;
  avgGreenSeconds?: number; avgVehiclesPerCycle?: number;
  safetyPassRate?: number; avgConfidencePct?: number; avgCongestionPct?: number;
  modeDistribution?: Record<string, number>;
  planDistribution?: Record<string, number>;
}

interface AnalyticsSeries {
  windowHours: number; buckets: number; bucketMinutes: number; samples: number;
  coveredFrom: string | null; coveredTo: string | null;
  points: AnalyticsSeriesPoint[];
}
interface AnalyticsSeriesPoint {
  ts: string; throughputPcu: number; avgWaitSeconds: number;
  congestion: number; avgConfidencePct: number; safetyPassPct: number; samples: number;
}

interface EdgeNode {
  id: string; name: string; zone: string;
  status: "ONLINE" | "DEGRADED" | "OFFLINE";
  lastHeartbeat: string; junctionsServed: number; cpuPct: number; uptimePct: number;
}
interface AppUser {
  id: string; name: string; role: Role; zone: string;
  status: "ACTIVE" | "SUSPENDED"; lastSeen: string;
}
interface Zone { id: string; name: string; junctions: number; nodes: number; }

interface LoginResult {
  token: string;
  user: { sub: string; name: string; role: Role; iat: number; exp: number };
}
```

---

## 9. Simulator bridge messages (Layer 5 ⇄ Simulator)

### Layer 5 → simulator

```typescript
{ type: "SIGNAL_STATE_UPDATE", signals: Record<"NORTH"|"SOUTH"|"EAST"|"WEST", "red"|"green"|"yellow"> }
{ type: "EMERGENCY_UPDATE", active: boolean, direction?: "NS"|"EW",
  emvId?: string, etaSeconds?: number, targetPhase?: string, priorityClass?: string }
{ type: "VEHICLE_COUNT_UPDATE", counts: Record<string, number> }
{ type: "CORRIDOR_UPDATE", active: { route: string[] } | false }
{ type: "CITY_STATE_UPDATE", junctions: JunctionSummary[] }
```

### Simulator → Layer 5

```typescript
{ type: "SIM_READY" }
{ type: "LANE_DATA_UPDATE", data: {
    intersectionId: string;
    lanes: { laneId: string; laneName: string; signal: string;
             queueCount: number; enteredCount: number; ambulanceDetected: boolean }[];
    timestamp: number;
} }
{ type: "DISPATCH_AMBULANCE", direction: "NS" | "EW" }
{ type: "INTERSECTION_SELECTED", intersectionId: string }
```

---

## 10. Contract change procedure

1. Edit the source-of-truth file named in the table at the top of this document.
2. Apply the identical change to every mirror **in the same commit** (`Layer-5/src/types/snapshot.ts`,
   `GatiShakti-ML/app.py` Pydantic models, the Layer-4 implementation).
3. Update this document and the layer document that owns the contract.
4. For `ActuationCommand`, bump `schemaVersion`; a major bump requires both L3 and L4 sign-off per the
   [L3-L4 contract](L3-L4-actuation-contract.md).
5. Run `npm run build` in `Layer-3_STM` and `Layer-5` — both must typecheck clean; run `npm run test` in
   `Layer-3_STM`.

There is no runtime schema negotiation. Drift surfaces as silently missing fields in the UI, which is why the
same-commit rule is normative.
