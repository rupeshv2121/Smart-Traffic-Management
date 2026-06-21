# Layer-3 STM (Signal Timing Module)

## 🎯 Project Overview

**Layer-3 STM** is a traffic signal control orchestration system that manages intelligent decision-making for traffic light timing at intersections. It's built in TypeScript and uses a **Member-based pipeline architecture** where each "Member" handles a specific responsibility.

### Repository
- **Name**: `layer-3_stm`
- **Type**: TypeScript/Node.js
- **Purpose**: Intelligent traffic signal timing with safety guarantees and resilience handling

---

## 🏗️ Architecture Overview - "The 4 Members Pipeline"

The system is designed as a **4-member collaboration pipeline**:

```
Layer 2 Data (Perception) 
    ↓
Member 4: Confidence Gate (Resilience entry)
    ↓
Member 1: Scoring (Normal-Mode Architect)
    ↓
Member 2: Max-Pressure Optimizer + Emergency Pathfinder
    ↓
Member 3: Safety Supervisor (Invariant Guardian)
    ↓
Member 4: Resilience Enforcement
    ↓
Layer 4 (Hardware Actuation — console.log mock)
```

### Member Responsibilities

| Member | File | Role | Status |
|--------|------|------|--------|
| **1** | `types/types.ts` | Person-centric scoring (`scoreAllApproaches`) | ✅ DONE |
| **2** | `max-pressure-optimizer.ts` + `stm-orchestrator.ts` | Max-pressure optimizer + Green Corridor / Conflict Index | ✅ DONE |
| **3** | `safety-supervisor.ts` | Validate safety constraints & enforce clearance intervals | ✅ DONE |
| **4** | `resilience-handler.ts` | Monitor confidence scores & hijack to fallback if needed | ✅ DONE |
| **Orchestrator** | `stm-orchestrator.ts` | Wires all members into a 30-second execution loop | ✅ DONE |

---

## 📂 Project Structure & Reading Order

### Entry Points

| Command | File | Purpose |
|---------|------|---------|
| `npm run test` | `src/index.ts` | One-shot integration + Phase 4 chaos tests |
| `npm run dev` | `src/main.ts` | Continuous 30-second live pipeline |
| `npm run sim` | `src/continuous-simulator.ts` | Dev-only M1+M2 optimizer (bypasses orchestrator) |

**Start with `npm run test`** to verify all scenarios pass, then `npm run dev` for the live demo loop.

---

### Core Files (Read in This Order)

#### 1. **Types & Data Structures** 
**File**: `src/types/types.ts`

**What it defines**:
- `Layer2Payload` - Input from camera perception system
- `ActuationCommand` - Output to hardware
- `EmergencyToken` - Emergency vehicle signals
- `OptimizationProposal` - Member 2 optimizer output (via adapter)
- `EmergencyResponse` - Member 2 emergency output
- `HistoricalTimingPlan` - Fallback database

**Key constants**:
- `VEHICLE_WEIGHTS` - Weight multipliers for different vehicle types (Car=1.0, Bus=3.0, Ambulance=10.0)

**Read this second** - understand the data contracts

---

#### 2. **Master Orchestrator** 
**File**: `src/stm-orchestrator.ts`

**What it does**:
- Coordinates all 4 members
- Implements the decision pipeline
- Manages data flow between stages

**Key method**: `orchestrateActuation()`
- Stage 1: Check if Layer 2 data is stale (>10 seconds old)
- Stage 2: Resilience check (Member 4 entry)
- Stage 3: Member 1 scoring + Member 2 optimization (or emergency corridor)
- Stage 4: Safety validation (Member 3 entry)
- Stage 5: Build final command
- Stage 6: Resilience enforcement (Member 4 final)

**Adapter methods** in the orchestrator translate data between member formats (e.g. `Layer2Payload` → `ApproachMetrics`, `ProposedPlan` → `OptimizationProposal`).

**Read this third** - understand the orchestration flow

---

#### 3. **Safety Supervisor** 
**File**: `src/safety-supervisor.ts` ✅ COMPLETE

**What it does** (Member 3):
- Prevents conflicting green lights simultaneously
- Enforces minimum green time before phase change
- Validates clearance intervals (yellow & all-red times)
- Protects pedestrian walk phases

**Key rules**:
```
Rule 1: No conflicting phases active at same time
Rule 2: Phase transitions must include:
        - Minimum green time (minGreenEnforced)
        - Yellow clearance (minYellowSeconds)
        - All-red clearance (minAllRedSeconds)
Rule 3: Don't interrupt pedestrian walk phases prematurely
```

**Configuration** (from `src/config.ts`):
```javascript
safetyConfig = {
    minYellowSeconds: 5,
    minAllRedSeconds: 2,
    minPedestrianWalkSeconds: 8,
    minGreenEnforced: 10,
    conflictMatrix: {
        NORTH: ["SOUTH"],  // NORTH conflicts with SOUTH
        SOUTH: ["NORTH"],
        EAST: ["WEST"],
        WEST: ["EAST"],
    }
}
```

**Read this fourth** - understand safety constraints

---

#### 4. **Resilience Handler** 
**File**: `src/resilience-handler.ts` ✅ COMPLETE

**What it does** (Member 4):
- Monitors CV (Computer Vision) confidence score from cameras
- If confidence < 70% (critical threshold), **HIJACKS** the system
- Forces fallback to historical database timings
- Graceful degradation when perception fails

**Decision logic**:
```
if (confidence < 70%)  → SWITCH_TO_HISTORICAL_FALLBACK
else if (confidence < 80%) → USE_OPTIMIZED_PLAN (but warn)
else → USE_OPTIMIZED_PLAN (normal operation)
```

**Key thresholds** (configurable):
- `criticalLowerBound: 0.70` (70%) - Below this, force fallback
- `warningThreshold: 0.80` (80%) - Monitor closely

**Read this fifth** - understand resilience & fallback

---

#### 5. **Mock Data Generator** 
**File**: `src/mock-data/mock_generator.ts`

**What it does**:
- Generates fake Layer 2 perception data for testing
- Creates random vehicle detections per approach
- Generates historical timing plans
- Can simulate emergency tokens

**Used in**: `main.ts` (continuous loop) and `index.ts` (integration tests)

**Read this last** - for understanding test data generation

---

## 🔄 Complete Data Flow (With Real Scenario)

### Scenario: Normal Operations (High Confidence, No Emergency)

```
INPUT: Layer 2 Data
├─ junctionId: "DEL_DL_ITO_01"
├─ timestamp: "2026-06-21T00:40:54Z"
├─ cvConfidenceScore: 0.88 (88%) ✅ HIGH
└─ approaches: [
   ├─ NORTH: 45% occupancy, 8 buses, 12 cars
   ├─ SOUTH: 30% occupancy, ...
   ├─ EAST: 60% occupancy, ...
   └─ WEST: 35% occupancy, ...

STAGE 1: Data Staleness Check
├─ Data age: 0.5 seconds (< 10s max) ✅ FRESH
└─ → Continue to Stage 2

STAGE 2: Resilience Check (Member 4)
├─ Confidence: 88% > 70% threshold ✅ 
├─ → USE_OPTIMIZED_PLAN (fallback not active)
└─ → Continue to Stage 3

STAGE 3: Optimization Decision
├─ Emergency token? NO
├─ → Use Member 1 (Normal Mode)
├─ Member 1 analyzes approaches, finds EAST has highest occupancy (60%)
├─ Proposes: "EAST phase, 45 seconds green"
└─ Execution Path: NORMAL_MODE

STAGE 4: Safety Validation (Member 3)
├─ Check conflicting phases: 
│  └─ EAST doesn't conflict with itself ✅
├─ Check phase transition:
│  ├─ Currently: NORTH is green
│  └─ Proposed: EAST
│  ├─ NORTH conflicts with SOUTH? YES, but SOUTH not active ✅
│  ├─ Min green enforced (10s) met? YES ✅
│  └─ Insert clearances: Yellow=5s, AllRed=2s ✅
└─ Safety: PASSED

STAGE 5: Build Final Command
├─ targetPhaseId: "EAST"
├─ durationSeconds: 45
├─ executionMode: "NORMAL_MAX_PRESSURE"
├─ clearanceIntervals:
│  ├─ yellowSeconds: 5
│  └─ allRedSeconds: 2
└─ commandId: "CMD-1719000054996"

STAGE 6: Resilience Enforcement (Member 4)
├─ Fallback active? NO
└─ → Return proposed command as-is ✅

OUTPUT: ActuationCommand
├─ Command: Switch EAST green for 45 seconds
├─ Insert 5s yellow before cut-off
├─ Insert 2s all-red after
└─ Mode: NORMAL_MAX_PRESSURE (AI-optimized)
```

---

### Scenario: Emergency Mode (EMV Detected)

```
INPUT: 
├─ Layer 2 Data (88% confidence)
└─ Emergency Token:
   ├─ emvId: "AMB-0042" (Ambulance)
   ├─ priorityClass: "CRITICAL"
   ├─ etaSeconds: 35
   └─ targetPhaseId: "EAST"

STAGES 1-2: Same as above (data fresh, confidence OK)

STAGE 3: Optimization Decision
├─ Emergency token? YES ✅
├─ → Use Member 2 (Emergency Mode)
├─ Member 2 calculates:
│  ├─ Conflict Index = (CRITICAL multiplier × 100) - ETA
│  ├─ = (3 × 100) - 35 = 265
│  └─ Urgency: CRITICAL
├─ Proposes: "EAST phase, 60 seconds green" (extended for corridor)
└─ Execution Path: EMERGENCY_MODE

STAGE 4: Safety Validation (Member 3)
├─ Same checks, but emergency overrides some constraints
└─ Safety: PASSED (with emergency override)

STAGES 5-6: Same as normal mode

OUTPUT: ActuationCommand
├─ Command: Switch EAST green for 60 seconds (extended)
├─ executionMode: "GREEN_CORRIDOR" (emergency mode)
└─ Full clearances applied
```

---

### Scenario: Low Confidence Hijack (Fallback Activated)

```
INPUT: Layer 2 Data
├─ cvConfidenceScore: 0.62 (62%) ❌ LOW
└─ (Cameras have poor visibility - rain, glare, etc.)

STAGE 1: Data Staleness Check
└─ Data is fresh ✅

STAGE 2: Resilience Check (Member 4) 🔴 HIJACK
├─ Confidence: 62% < 70% critical threshold ❌
├─ ACTION: SWITCH_TO_HISTORICAL_FALLBACK
├─ Mark: isFallbackActive = true
├─ Reason: "CONFIDENCE_CRITICAL: 62.00% < 70% threshold"
└─ → EARLY EXIT (Skip Stages 3-6)

OUTPUT: Fallback Command (Immediate)
├─ Source: Historical Database
├─ Timing: Use proven historical patterns
├─ Example:
│  ├─ Phase: NORTH (first in historical data)
│  ├─ Duration: 45 seconds (historical recommendation)
│  └─ Mode: "HISTORICAL_FALLBACK"
└─ Safety: GUARANTEED (pre-tested timings)

Result: System degrades gracefully to safe, predictable behavior
```

---

## 🧪 Test Scenarios (`npm run test`)

The project runs 4 integration scenarios plus 2 Phase 4 chaos tests:

| # | Scenario | Input | Expected Result |
|---|----------|-------|-----------------|
| **1** | Normal Operation | Confidence 88% | NORMAL_MODE, optimized phase |
| **2** | Emergency Mode | Confidence 88% + EMV | EMERGENCY_MODE, GREEN_CORRIDOR |
| **3** | Low Confidence Hijack | Confidence 62% | HISTORICAL_FALLBACK |
| **4** | Stale Data | Data age 11s (>10s limit) | HISTORICAL_FALLBACK |
| **C1** | Chaos: Conflicting Greens | NORTH+SOUTH simultaneous | Safety gate FORCE_FALLBACK |
| **C2** | Chaos: Smog | Confidence 55% | Member 4 hijack activated |

### Run Commands
```bash
npm run test             # Integration + chaos tests (one-shot)
npm run dev              # Continuous 30-second pipeline
npm run build            # Compile to JavaScript
npm start                # Run compiled continuous pipeline
npm run sim              # Dev-only optimizer simulator
```

---

## ✅ Implementation Status

All four members and the orchestrator are complete:

- **Member 1** — `scoreAllApproaches()` in `types/types.ts`
- **Member 2** — `runMaxPressureOptimizer()` in `max-pressure-optimizer.ts` + `generateEmergencyResponse()` in orchestrator
- **Member 3** — `SafetySupervisor.validateProposedActuation()`
- **Member 4** — `ResilienceHandler.evaluateConfidenceAndDecide()` + `hijackAndEnforceHistorical()`
- **Mocks** — Layer 2 cameras, historical DB, EMVS dispatch, console actuation (Layer 4)

---

## 📊 Key Concepts

### Confidence Score
- From Layer 2 (camera perception system)
- Range: 0.0 to 1.0 (0% to 100%)
- **Critical threshold: 70%** - Below this, force fallback
- **Warning threshold: 80%** - Monitor closely

### Clearance Intervals
- **Yellow**: Warning period when signal changes from green to red (5 seconds)
- **All-Red**: Safety gap where all conflicting phases are red (typically 2-3 seconds)

### Execution Modes
1. **NORMAL_MAX_PRESSURE**: AI-optimized timing
2. **GREEN_CORRIDOR**: Emergency mode (extended green for EMV)
3. **HISTORICAL_FALLBACK**: Using pre-calculated timings from database
4. **SAFE_DEFAULT**: Hardcoded safe fallback if system fails

### Vehicle Weights
- Motorcycle: 0.5 (light, quick)
- Car: 1.0 (baseline)
- AutoRickshaw: 1.2
- MiniTruck: 2.0
- Bus: 3.0 (heavier)
- HeavyTruck: 4.0 (very heavy)
- **Ambulance: 10.0** (emergency - highest priority)

---

## 🛠️ Development Workflow

### To Add a Feature:
1. Update **types.ts** if new data structures needed
2. Implement logic in the appropriate member file
3. Update **stm-orchestrator.ts** to call new methods
4. Test in **index.ts** with scenarios
5. Run: `npm run dev`

### To Debug:
- `reasonChain` array in `OrchestratorResult` shows decision audit trail
- `executionPath` shows which mode was used (NORMAL, EMERGENCY, FALLBACK)
- Enable console.log in individual member functions

---

## 📝 Configuration Reference

From `src/config.ts`:
```javascript
const safetyConfig = {
    minYellowSeconds: 5,          // Minimum yellow light duration
    minAllRedSeconds: 2,          // Minimum all-red safety gap
    minPedestrianWalkSeconds: 8,  // Minimum pedestrian walk duration
    minGreenEnforced: 10,         // Minimum green before transition
    conflictMatrix: {             // Which phases conflict
        NORTH: ["SOUTH"],
        SOUTH: ["NORTH"],
        EAST: ["WEST"],
        WEST: ["EAST"],
    },
};

const resilienceThresholds = {
    criticalLowerBound: 0.70,     // Hijack threshold (70%)
    warningThreshold: 0.80,       // Warning zone (80%)
};

const maxDataAgeSeconds = 10;     // Force fallback if data older
const defaultPhaseIfNoProposal = "NORTH";  // Safe default
```

---

## 🎓 Learning Path

### For New Team Members:
1. **Day 1**: Read this guide + run `npm run test`
2. **Day 2**: Trace through `stm-orchestrator.ts` and `config.ts`
3. **Day 3**: Study `safety-supervisor.ts` and `resilience-handler.ts`
4. **Day 4**: Run `npm run dev` and observe the 30-second live loop
5. **Day 5**: Extend mocks or tune scoring constants in `types.ts`

### For Understanding Safety:
→ Read `safety-supervisor.ts` first

### For Understanding Resilience:
→ Read `resilience-handler.ts` first

### For Implementing Features:
→ Update the relevant member file, then wire through `stm-orchestrator.ts`

---

## 🚀 Next Steps (Production)

1. Connect real Layer 2 camera API instead of mock generator
2. Connect Layer 4 hardware actuation instead of `console.log`
3. Add multi-EMV tie-breaker when two ambulances conflict
4. Deploy to a real junction with safety validation
5. Monitor confidence scores in production

---

## 📞 Quick Reference

| Term | Definition |
|------|-----------|
| **Layer 2** | Perception/camera system that inputs data |
| **Layer 3** | This project - signal timing orchestration |
| **Layer 4** | Hardware - the actual traffic lights |
| **Member 1-4** | Four specialized decision-making modules |
| **EMV** | Emergency Vehicle (ambulance, fire truck) |
| **Hijack** | When Member 4 forces historical fallback |
| **Max-Pressure** | Algorithm that prioritizes based on queue buildup |
| **Conflict Index** | Priority measure for emergency routing |
| **Green Corridor** | Coordinated green lights for emergency vehicles |