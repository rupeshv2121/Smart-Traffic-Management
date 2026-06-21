import { orchestratorConfig } from "./config";
import {
  DownstreamDensity,
  MaxPressureOptimizer,
  PhaseState,
  runMaxPressureOptimizer,
} from "./max-pressure-optimizer";
import { MockDataGenerator } from "./mock-data/mock_generator";
import { SafetySupervisor } from "./safety-supervisor";
import { STMOrchestrator } from "./stm-orchestrator";
import { ApproachMetrics, Layer2Payload } from "./types/types";

const generator = new MockDataGenerator();
const orchestrator = new STMOrchestrator(orchestratorConfig);
const safetyValidator = new SafetySupervisor(orchestratorConfig.safetyConfig);

console.log("╔════════════════════════════════════════════════════════════╗");
console.log("║         Layer-3 STM - Full Integration Test                ║");
console.log("║  (Member 1, 2, 3, 4 Pipeline + Phase 4 Chaos Tests)        ║");
console.log("╚════════════════════════════════════════════════════════════╝\n");

// ===== SCENARIO 1: Normal Operation (HIGH Confidence, No Emergency) =====
console.log("═══════════════════════════════════════════════════════════════");
console.log("SCENARIO 1: Normal Operation (Confidence HIGH, No Emergency)");
console.log(
  "═══════════════════════════════════════════════════════════════\n",
);

const layer2Data1 = generator.getLayer2Data(0.88);
const historicalData = generator.getHistoricalData();

console.log("📊 Layer 2 Perception Data:");
console.log(`   Junction: ${layer2Data1.junctionId}`);
console.log(
  `   Confidence Score: ${(layer2Data1.cvConfidenceScore * 100).toFixed(2)}% ✅ (Above 70%)`,
);
console.log(
  `   Approaches: ${layer2Data1.approaches.map((a) => `${a.approachId}(${a.spatialOccupancyPct}%)`).join(", ")}\n`,
);

const result1 = orchestrator.orchestrateActuation(
  layer2Data1,
  null,
  historicalData,
);

console.log("📋 Orchestration Decision Chain:");
result1.reasonChain.forEach((reason, idx) => {
  console.log(`   ${idx + 1}. ${reason}`);
});

console.log("\n✅ FINAL ACTUATION COMMAND:");
console.log(`   Target Phase: ${result1.finalCommand.targetPhaseId}`);
console.log(`   Duration: ${result1.finalCommand.durationSeconds}s`);
console.log(`   Execution Mode: ${result1.finalCommand.executionMode}`);
console.log(
  `   Clearances: Yellow=${result1.finalCommand.clearanceIntervals.yellowSeconds}s, AllRed=${result1.finalCommand.clearanceIntervals.allRedSeconds}s`,
);
console.log(
  `   Safety Passed: ${result1.safetyValidationPassed ? "✅ YES" : "❌ NO"}`,
);
console.log(`   Execution Path: ${result1.executionPath}\n`);

// ===== SCENARIO 2: Emergency Mode (Emergency Token Detected) =====
console.log("═══════════════════════════════════════════════════════════════");
console.log("SCENARIO 2: Emergency Mode (EMV Detected)");
console.log(
  "═══════════════════════════════════════════════════════════════\n",
);

const emergencyToken = {
  emvId: "AMB-0042",
  priorityClass: "CRITICAL" as const,
  etaSeconds: 35,
  cryptographicToken: "0xVALID_MOCK_TOKEN",
  targetPhaseId: "EAST" as const,
};

console.log("🚨 Emergency Token Detected:");
console.log(`   EMV ID: ${emergencyToken.emvId}`);
console.log(`   Priority: ${emergencyToken.priorityClass}`);
console.log(`   ETA: ${emergencyToken.etaSeconds}s`);
console.log(`   Needs: ${emergencyToken.targetPhaseId} phase green\n`);

const result2 = orchestrator.orchestrateActuation(
  layer2Data1,
  emergencyToken,
  historicalData,
);

console.log("📋 Orchestration Decision Chain:");
result2.reasonChain.forEach((reason, idx) => {
  console.log(`   ${idx + 1}. ${reason}`);
});

console.log("\n✅ FINAL ACTUATION COMMAND (EMERGENCY MODE):");
console.log(`   Target Phase: ${result2.finalCommand.targetPhaseId}`);
console.log(`   Duration: ${result2.finalCommand.durationSeconds}s`);
console.log(`   Execution Mode: ${result2.finalCommand.executionMode}`);
console.log(
  `   Safety Passed: ${result2.safetyValidationPassed ? "✅ YES" : "❌ NO"}`,
);
console.log(`   Execution Path: ${result2.executionPath}\n`);

// ===== SCENARIO 3: Low Confidence Hijack (Winter Smog) =====
console.log("═══════════════════════════════════════════════════════════════");
console.log("SCENARIO 3: Low Confidence (Member 4 Hijack Activated)");
console.log(
  "═══════════════════════════════════════════════════════════════\n",
);

const layer2Data3 = generator.getLayer2Data(0.62);

console.log("📊 Layer 2 Perception Data:");
console.log(
  `   Confidence Score: ${(layer2Data3.cvConfidenceScore * 100).toFixed(2)}% ❌ (Below 70%)`,
);
console.log(
  `   Status: Member 4 (Resilience) will HIJACK to historical fallback\n`,
);

const result3 = orchestrator.orchestrateActuation(
  layer2Data3,
  null,
  historicalData,
);

console.log("📋 Orchestration Decision Chain:");
result3.reasonChain.forEach((reason, idx) => {
  console.log(`   ${idx + 1}. ${reason}`);
});

console.log("\n✅ FINAL ACTUATION COMMAND (HIJACKED TO FALLBACK):");
console.log(`   Target Phase: ${result3.finalCommand.targetPhaseId}`);
console.log(
  `   Duration: ${result3.finalCommand.durationSeconds}s (from historical database)`,
);
console.log(`   Execution Mode: ${result3.finalCommand.executionMode}`);
console.log(`   Execution Path: ${result3.executionPath}\n`);

// ===== SCENARIO 4: Stale Data Detection (Network Outage) =====
console.log("═══════════════════════════════════════════════════════════════");
console.log("SCENARIO 4: Stale Layer 2 Data (> 10 seconds old)");
console.log(
  "═══════════════════════════════════════════════════════════════\n",
);

const staleLayers2Data = {
  ...layer2Data1,
  timestamp: new Date(Date.now() - 11000).toISOString(),
};

console.log("📊 Layer 2 Perception Data:");
console.log(`   Data Age: ~11 seconds (max allowed: 10s)`);
console.log(
  `   Status: Orchestrator will force fallback due to data staleness\n`,
);

const result4 = orchestrator.orchestrateActuation(
  staleLayers2Data,
  null,
  historicalData,
);

console.log("📋 Orchestration Decision Chain:");
result4.reasonChain.forEach((reason, idx) => {
  console.log(`   ${idx + 1}. ${reason}`);
});

console.log("\n✅ FINAL ACTUATION COMMAND (STALE DATA FALLBACK):");
console.log(`   Target Phase: ${result4.finalCommand.targetPhaseId}`);
console.log(`   Execution Mode: ${result4.finalCommand.executionMode}`);
console.log(`   Execution Path: ${result4.executionPath}\n`);

// ===== PHASE 4 CHAOS TEST 1: Conflicting Greens (Safety Block) =====
console.log("═══════════════════════════════════════════════════════════════");
console.log("CHAOS TEST 1: Conflicting Greens — Safety Gate Must Block");
console.log(
  "═══════════════════════════════════════════════════════════════\n",
);

console.log(
  "💥 Injecting malicious proposal: NORTH + SOUTH green simultaneously",
);

const chaosSafetyResult = safetyValidator.validateProposedActuation(
  {
    phaseId: "EAST",
    activeGreens: ["EAST"],
    pedestrianWalkActive: false,
  },
  {
    phaseId: "MALICIOUS",
    activeGreens: ["NORTH", "SOUTH"],
  },
  { currentPhaseDuration: 15, pedestrianWalkDuration: 0 },
);

const chaos1Passed =
  !chaosSafetyResult.isSafe &&
  chaosSafetyResult.command.action === "FORCE_FALLBACK";

console.log(
  `   Safety Gate: ${chaos1Passed ? "✅ BLOCKED conflicting greens" : "❌ FAILED — dangerous state allowed"}`,
);
console.log(`   Action: ${chaosSafetyResult.command.action}`);
if (chaosSafetyResult.command.reason) {
  console.log(`   Reason: ${chaosSafetyResult.command.reason}`);
}
console.log(
  `   Result: ${chaos1Passed ? "SAFE_DEFAULT enforced — no actuation" : "CRITICAL — review safety-supervisor.ts"}\n`,
);

// ===== PHASE 4 CHAOS TEST 2: Smog / Low Confidence Fallback =====
console.log("═══════════════════════════════════════════════════════════════");
console.log("CHAOS TEST 2: Smog — Confidence Below 70% Triggers Fallback");
console.log(
  "═══════════════════════════════════════════════════════════════\n",
);

const smogData = generator.getLayer2Data(0.55);
const chaos2Result = orchestrator.orchestrateActuation(
  smogData,
  null,
  historicalData,
);

const chaos2Passed =
  chaos2Result.executionPath === "FALLBACK_MODE" &&
  chaos2Result.finalCommand.executionMode === "HISTORICAL_FALLBACK";

console.log(
  `   Confidence: ${(smogData.cvConfidenceScore * 100).toFixed(1)}% (smog simulation)`,
);
console.log(
  `   Resilience Hijack: ${chaos2Passed ? "✅ ACTIVATED" : "❌ NOT TRIGGERED"}`,
);
console.log(`   Fallback Phase: ${chaos2Result.finalCommand.targetPhaseId}`);
console.log(
  `   Fallback Duration: ${chaos2Result.finalCommand.durationSeconds}s\n`,
);

// ===========================================================================
//  ASSERTED REGRESSION SCENARIOS — coverage for the three fixes
//  #1 Safety soft-interlock holds | #2 EMV preemption | #3 Max-pressure
// ===========================================================================
console.log(
  "\n═══════════════════════════════════════════════════════════════",
);
console.log(
  "ASSERTED REGRESSION SCENARIOS (Fix #1 Safety / #2 EMV / #3 Max-Pressure)",
);
console.log(
  "═══════════════════════════════════════════════════════════════\n",
);

const assertions: { name: string; passed: boolean; detail?: string }[] = [];
function assert(name: string, passed: boolean, detail = "") {
  assertions.push({ name, passed, detail });
  console.log(
    `   ${passed ? "✅ PASS" : "❌ FAIL"} — ${name}${detail ? `  (${detail})` : ""}`,
  );
}

// ─── Fix #1: Safety Supervisor honours soft interlocks ──────────────────────
console.log("🔒 Fix #1 — Minimum-green & pedestrian holds (Member 3 direct):");

const minGreenHold = safetyValidator.validateProposedActuation(
  { phaseId: "NORTH", activeGreens: ["NORTH"], pedestrianWalkActive: false },
  { phaseId: "EAST", activeGreens: ["EAST"] },
  { currentPhaseDuration: 5, pedestrianWalkDuration: 0 },
);
assert(
  "Min-green not met → MAINTAIN_CURRENT_STATE (no premature switch)",
  !minGreenHold.isSafe &&
    minGreenHold.command.action === "MAINTAIN_CURRENT_STATE" &&
    minGreenHold.command.reason === "MINIMUM_GREEN_NOT_MET",
  minGreenHold.command.action,
);

const pedHold = safetyValidator.validateProposedActuation(
  { phaseId: "NORTH", activeGreens: ["NORTH"], pedestrianWalkActive: true },
  { phaseId: "NORTH", activeGreens: ["NORTH"] },
  { currentPhaseDuration: 30, pedestrianWalkDuration: 3 },
);
assert(
  "Pedestrian walk active → MAINTAIN_CURRENT_STATE",
  !pedHold.isSafe &&
    pedHold.command.action === "MAINTAIN_CURRENT_STATE" &&
    pedHold.command.reason === "PEDESTRIAN_WALK_ACTIVE",
  pedHold.command.action,
);

// End-to-end: orchestrator must HOLD instead of executing the optimiser switch.
// We force the hold with an exaggerated minGreenEnforced so the (correct)
// steady-state behaviour does not mask the path under test.
console.log("\n🔒 Fix #1 — Orchestrator honours the hold (end-to-end):");
const holdConfig = {
  ...orchestratorConfig,
  safetyConfig: { ...orchestratorConfig.safetyConfig, minGreenEnforced: 999 },
};
const holdOrchestrator = new STMOrchestrator(holdConfig);
const holdData: Layer2Payload = {
  junctionId: "DEL_HOLD_TEST",
  timestamp: new Date().toISOString(),
  cvConfidenceScore: 0.9,
  approaches: [
    {
      approachId: "NORTH",
      spatialOccupancyPct: 5,
      detections: [{ type: "Car", count: 1 }],
      waitingTimeSeconds: 0,
      arrivalRatePerMin: 0,
    },
    {
      approachId: "SOUTH",
      spatialOccupancyPct: 5,
      detections: [{ type: "Car", count: 1 }],
      waitingTimeSeconds: 0,
      arrivalRatePerMin: 0,
    },
    {
      approachId: "EAST",
      spatialOccupancyPct: 10,
      detections: [{ type: "Car", count: 200 }],
      waitingTimeSeconds: 100,
      arrivalRatePerMin: 25,
    },
    {
      approachId: "WEST",
      spatialOccupancyPct: 5,
      detections: [{ type: "Car", count: 1 }],
      waitingTimeSeconds: 0,
      arrivalRatePerMin: 0,
    },
  ],
};
const holdResult = holdOrchestrator.orchestrateActuation(
  holdData,
  null,
  historicalData,
);
assert(
  "Orchestrator HOLDS current NORTH when min-green unmet (does not switch to EAST)",
  holdResult.finalCommand.targetPhaseId === "NORTH" &&
    holdResult.reasonChain.some((r) => r.includes("Safety hold")),
  `target=${holdResult.finalCommand.targetPhaseId}`,
);

// ─── Fix #2: EMV preemption overrides soft interlocks, keeps hard invariant ──
console.log(
  "\n🚨 Fix #2 — EMV preemption overrides soft interlocks, keeps hard invariant:",
);

const emvMinGreen = safetyValidator.validateProposedActuation(
  { phaseId: "NORTH", activeGreens: ["NORTH"], pedestrianWalkActive: false },
  { phaseId: "EAST", activeGreens: ["EAST"] },
  { currentPhaseDuration: 2, pedestrianWalkDuration: 0 },
  { emergencyOverride: true },
);
assert(
  "EMV overrides minimum-green → transition granted WITH clearances",
  emvMinGreen.isSafe &&
    emvMinGreen.command.action === "EXECUTE_PHASE_TRANSITION" &&
    (emvMinGreen.command.yellowSeconds ?? 0) >=
      orchestratorConfig.safetyConfig.minYellowSeconds &&
    (emvMinGreen.command.allRedSeconds ?? 0) >=
      orchestratorConfig.safetyConfig.minAllRedSeconds,
  emvMinGreen.command.reason,
);

const emvOpposing = safetyValidator.validateProposedActuation(
  { phaseId: "NORTH", activeGreens: ["NORTH"], pedestrianWalkActive: false },
  { phaseId: "SOUTH", activeGreens: ["SOUTH"] },
  { currentPhaseDuration: 30, pedestrianWalkDuration: 0 },
  { emergencyOverride: true },
);
assert(
  "EMV overrides opposing-phase block → transition granted (not fallback)",
  emvOpposing.isSafe &&
    emvOpposing.command.action === "EXECUTE_PHASE_TRANSITION",
  emvOpposing.command.action,
);

const normalOpposing = safetyValidator.validateProposedActuation(
  { phaseId: "NORTH", activeGreens: ["NORTH"], pedestrianWalkActive: false },
  { phaseId: "SOUTH", activeGreens: ["SOUTH"] },
  { currentPhaseDuration: 30, pedestrianWalkDuration: 0 },
);
assert(
  "Control: without EMV, opposing-phase jump → FORCE_FALLBACK",
  !normalOpposing.isSafe && normalOpposing.command.action === "FORCE_FALLBACK",
  normalOpposing.command.action,
);

const emvHardConflict = safetyValidator.validateProposedActuation(
  { phaseId: "EAST", activeGreens: ["EAST"], pedestrianWalkActive: false },
  { phaseId: "MALICIOUS", activeGreens: ["NORTH", "SOUTH"] },
  { currentPhaseDuration: 30, pedestrianWalkDuration: 0 },
  { emergencyOverride: true },
);
assert(
  "EMV CANNOT bypass conflicting-greens invariant → FORCE_FALLBACK",
  !emvHardConflict.isSafe &&
    emvHardConflict.command.action === "FORCE_FALLBACK",
  emvHardConflict.command.action,
);

console.log(
  "\n🚨 Fix #2 — Green corridor granted despite phase conflict (end-to-end):",
);
const emvOrchestrator = new STMOrchestrator(orchestratorConfig);
const emvData = generator.getLayer2Data(0.9);
const emvConflictToken = {
  emvId: "AMB-9001",
  priorityClass: "CRITICAL" as const,
  etaSeconds: 30,
  cryptographicToken: "0xVALID_MOCK_TOKEN",
  targetPhaseId: "SOUTH" as const, // SOUTH conflicts with the default current NORTH
};
const emvResult = emvOrchestrator.orchestrateActuation(
  emvData,
  emvConflictToken,
  historicalData,
);
assert(
  "Pipeline grants GREEN_CORRIDOR even when EMV phase conflicts with current",
  emvResult.executionPath === "EMERGENCY_MODE" &&
    emvResult.finalCommand.executionMode === "GREEN_CORRIDOR" &&
    emvResult.finalCommand.targetPhaseId === "SOUTH",
  `${emvResult.executionPath}/${emvResult.finalCommand.executionMode}`,
);

// ─── Fix #3: True max-pressure downstream normalisation ─────────────────────
console.log("\n📈 Fix #3 — True max-pressure downstream normalisation:");

const mpCurrentPhase: PhaseState = {
  currentPhaseId: "PHASE_NORTH_GREEN",
  phaseElapsedSeconds: 30,
  currentGreenDuration: 30,
  currentDensity: "medium",
};

function mkApproach(dir: string, cars: number, lastGreen = 0): ApproachMetrics {
  return {
    direction: dir,
    detections: [{ type: "Car", count: cars }],
    avgWaitingTime: 0,
    arrivalRate: 0,
    queueLength: 0,
    roadCapacity: 100,
    hasBus: false,
    hasEmergencyVehicle: false,
    lastGreenSeconds: lastGreen,
  };
}

const mpDownstream: DownstreamDensity[] = [
  { direction: "NORTH", occupancyPct: 50 },
  { direction: "SOUTH", occupancyPct: 50 },
  { direction: "EAST", occupancyPct: 95 }, // jammed downstream
  { direction: "WEST", occupancyPct: 0 }, // clear downstream
];

// EAST has the highest raw priority but its downstream is jammed (95%);
// WEST is lower priority but its downstream is clear. WEST must win now.
const mpPlan = runMaxPressureOptimizer(
  "MP_TEST",
  [
    mkApproach("NORTH", 5),
    mkApproach("SOUTH", 5),
    mkApproach("EAST", 100),
    mkApproach("WEST", 60),
  ],
  mpDownstream,
  mpCurrentPhase,
  0.9,
);
assert(
  "Jammed downstream suppresses high-priority EAST → WEST wins",
  mpPlan.winningDirection === "WEST",
  `winner=${mpPlan.winningDirection}`,
);

// Starvation bypass: EAST is starved (lastGreen 60s) AND downstream jammed,
// but must still win because starvation bypasses the downstream damping.
const mpStarvedPlan = runMaxPressureOptimizer(
  "MP_STARVE_TEST",
  [
    mkApproach("NORTH", 5),
    mkApproach("SOUTH", 5),
    mkApproach("EAST", 50, 60),
    mkApproach("WEST", 60),
  ],
  mpDownstream,
  mpCurrentPhase,
  0.9,
);
assert(
  "Starved EAST bypasses downstream damping and is served despite jam",
  mpStarvedPlan.winningDirection === "EAST" &&
    mpStarvedPlan.starvationFlags.EAST === true,
  `winner=${mpStarvedPlan.winningDirection}`,
);

// ─── Fix #4: Per-instance EMV pause state (no shared global leak) ────────────
console.log("\n🧩 Fix #4 — Optimizer pause state is isolated per instance:");

const optimizerA = new MaxPressureOptimizer();
const optimizerB = new MaxPressureOptimizer();
optimizerA.pause("JN-ISOLATION");
assert(
  "Pausing one optimizer does NOT pause a separate instance (same junction id)",
  optimizerA.isPaused("JN-ISOLATION") === true &&
    optimizerB.isPaused("JN-ISOLATION") === false,
  `A=${optimizerA.isPaused("JN-ISOLATION")}, B=${optimizerB.isPaused("JN-ISOLATION")}`,
);

const isoApproaches = [mkApproach("NORTH", 10), mkApproach("EAST", 40)];
const planPaused = optimizerA.run(
  "JN-ISOLATION",
  isoApproaches,
  mpDownstream,
  mpCurrentPhase,
  0.9,
);
const planLive = optimizerB.run(
  "JN-ISOLATION",
  isoApproaches,
  mpDownstream,
  mpCurrentPhase,
  0.9,
);
assert(
  "Paused instance yields EMV_OVERRIDE while the other still computes LIVE",
  planPaused.dataSource === "EMV_OVERRIDE" && planLive.dataSource === "LIVE",
  `paused=${planPaused.dataSource}, other=${planLive.dataSource}`,
);

optimizerA.resume("JN-ISOLATION");
assert(
  "Resume clears the pause for that instance",
  optimizerA.isPaused("JN-ISOLATION") === false,
  `A=${optimizerA.isPaused("JN-ISOLATION")}`,
);

// ─── Fix #5: EMV corridor reconciled even on fallback cycles (no stuck state) ─
console.log(
  "\n♻️  Fix #5 — EMV corridor is torn down even when the next cycle falls back:",
);

const corridorOrchestrator = new STMOrchestrator(orchestratorConfig);

// Cycle 1: an emergency opens the corridor.
corridorOrchestrator.orchestrateActuation(
  generator.getLayer2Data(0.9),
  {
    emvId: "AMB-7777",
    priorityClass: "CRITICAL" as const,
    etaSeconds: 30,
    cryptographicToken: "0xVALID_MOCK_TOKEN",
    targetPhaseId: "EAST" as const,
  },
  historicalData,
);
const corridorOpened =
  corridorOrchestrator.getOrchestrationState().emvCorridorActive;
assert(
  "Emergency cycle opens the EMV corridor",
  corridorOpened === true,
  `active=${corridorOpened}`,
);

// Cycle 2: no emergency + LOW confidence forces a fallback early-return at
// Stage 2. The corridor must still be torn down (previously it leaked active,
// because the resume only ran in the non-fallback optimisation branch).
corridorOrchestrator.orchestrateActuation(
  generator.getLayer2Data(0.55),
  null,
  historicalData,
);
const corridorClosed =
  corridorOrchestrator.getOrchestrationState().emvCorridorActive;
assert(
  "No-emergency fallback cycle tears the corridor down (not stuck active)",
  corridorClosed === false,
  `active=${corridorClosed}`,
);

// ===== ORCHESTRATOR STATE SUMMARY =====
console.log("═══════════════════════════════════════════════════════════════");
console.log("ORCHESTRATOR STATE SUMMARY");
console.log(
  "═══════════════════════════════════════════════════════════════\n",
);

const orchestratorState = orchestrator.getOrchestrationState();
console.log("📡 Resilience Module State:");
console.log(
  `   Fallback Active: ${orchestratorState.resilience.isFallbackActive}`,
);
console.log(
  `   Current Confidence: ${(orchestratorState.resilience.currentConfidenceScore * 100).toFixed(2)}%`,
);
if (orchestratorState.resilience.fallbackReason) {
  console.log(
    `   Fallback Reason: ${orchestratorState.resilience.fallbackReason}`,
  );
}

const assertionsPassed = assertions.every((a) => a.passed);
const failedCount = assertions.filter((a) => !a.passed).length;
console.log(
  `\n📊 Asserted regression scenarios: ${assertions.length - failedCount}/${assertions.length} passed`,
);
if (failedCount > 0) {
  console.log("   Failures:");
  assertions
    .filter((a) => !a.passed)
    .forEach((a) => console.log(`     ❌ ${a.name}`));
}

const chaosPassed = chaos1Passed && chaos2Passed;
const allPassed = chaosPassed && assertionsPassed;

console.log("\n╔════════════════════════════════════════════════════════════╗");
console.log("║     Layer-3 STM Integration Test Complete                  ║");
console.log("║  ✅ Member 1 (Scoring) — types.ts                          ║");
console.log("║  ✅ Member 2 (Optimizer + Emergency) — max-pressure        ║");
console.log("║  ✅ Member 3 (Safety Supervisor) — Verified               ║");
console.log("║  ✅ Member 4 (Data & Resilience) — Verified               ║");
console.log(
  `║  ${chaosPassed ? "✅" : "❌"} Phase 4 Chaos Tests — ${chaosPassed ? "PASSED" : "FAILED"}                      ║`,
);
console.log(
  `║  ${assertionsPassed ? "✅" : "❌"} Regression Scenarios (#1/#2/#3) — ${assertionsPassed ? "PASSED" : "FAILED"}        ║`,
);
console.log("╚════════════════════════════════════════════════════════════╝");

if (!allPassed) {
  process.exitCode = 1;
}
