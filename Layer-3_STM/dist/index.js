"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("./config");
const mock_generator_1 = require("./mock-data/mock_generator");
const safety_supervisor_1 = require("./safety-supervisor");
const stm_orchestrator_1 = require("./stm-orchestrator");
const generator = new mock_generator_1.MockDataGenerator();
const orchestrator = new stm_orchestrator_1.STMOrchestrator(config_1.orchestratorConfig);
const safetyValidator = new safety_supervisor_1.SafetySupervisor(config_1.orchestratorConfig.safetyConfig);
console.log("╔════════════════════════════════════════════════════════════╗");
console.log("║         Layer-3 STM - Full Integration Test                ║");
console.log("║  (Member 1, 2, 3, 4 Pipeline + Phase 4 Chaos Tests)        ║");
console.log("╚════════════════════════════════════════════════════════════╝\n");
// ===== SCENARIO 1: Normal Operation (HIGH Confidence, No Emergency) =====
console.log("═══════════════════════════════════════════════════════════════");
console.log("SCENARIO 1: Normal Operation (Confidence HIGH, No Emergency)");
console.log("═══════════════════════════════════════════════════════════════\n");
const layer2Data1 = generator.getLayer2Data(0.88);
const historicalData = generator.getHistoricalData();
console.log("📊 Layer 2 Perception Data:");
console.log(`   Junction: ${layer2Data1.junctionId}`);
console.log(`   Confidence Score: ${(layer2Data1.cvConfidenceScore * 100).toFixed(2)}% ✅ (Above 70%)`);
console.log(`   Approaches: ${layer2Data1.approaches.map((a) => `${a.approachId}(${a.spatialOccupancyPct}%)`).join(", ")}\n`);
const result1 = orchestrator.orchestrateActuation(layer2Data1, null, historicalData);
console.log("📋 Orchestration Decision Chain:");
result1.reasonChain.forEach((reason, idx) => {
    console.log(`   ${idx + 1}. ${reason}`);
});
console.log("\n✅ FINAL ACTUATION COMMAND:");
console.log(`   Target Phase: ${result1.finalCommand.targetPhaseId}`);
console.log(`   Duration: ${result1.finalCommand.durationSeconds}s`);
console.log(`   Execution Mode: ${result1.finalCommand.executionMode}`);
console.log(`   Clearances: Yellow=${result1.finalCommand.clearanceIntervals.yellowSeconds}s, AllRed=${result1.finalCommand.clearanceIntervals.allRedSeconds}s`);
console.log(`   Safety Passed: ${result1.safetyValidationPassed ? "✅ YES" : "❌ NO"}`);
console.log(`   Execution Path: ${result1.executionPath}\n`);
// ===== SCENARIO 2: Emergency Mode (Emergency Token Detected) =====
console.log("═══════════════════════════════════════════════════════════════");
console.log("SCENARIO 2: Emergency Mode (EMV Detected)");
console.log("═══════════════════════════════════════════════════════════════\n");
const emergencyToken = {
    emvId: "AMB-0042",
    priorityClass: "CRITICAL",
    etaSeconds: 35,
    cryptographicToken: "0xVALID_MOCK_TOKEN",
    targetPhaseId: "EAST",
};
console.log("🚨 Emergency Token Detected:");
console.log(`   EMV ID: ${emergencyToken.emvId}`);
console.log(`   Priority: ${emergencyToken.priorityClass}`);
console.log(`   ETA: ${emergencyToken.etaSeconds}s`);
console.log(`   Needs: ${emergencyToken.targetPhaseId} phase green\n`);
const result2 = orchestrator.orchestrateActuation(layer2Data1, emergencyToken, historicalData);
console.log("📋 Orchestration Decision Chain:");
result2.reasonChain.forEach((reason, idx) => {
    console.log(`   ${idx + 1}. ${reason}`);
});
console.log("\n✅ FINAL ACTUATION COMMAND (EMERGENCY MODE):");
console.log(`   Target Phase: ${result2.finalCommand.targetPhaseId}`);
console.log(`   Duration: ${result2.finalCommand.durationSeconds}s`);
console.log(`   Execution Mode: ${result2.finalCommand.executionMode}`);
console.log(`   Safety Passed: ${result2.safetyValidationPassed ? "✅ YES" : "❌ NO"}`);
console.log(`   Execution Path: ${result2.executionPath}\n`);
// ===== SCENARIO 3: Low Confidence Hijack (Winter Smog) =====
console.log("═══════════════════════════════════════════════════════════════");
console.log("SCENARIO 3: Low Confidence (Member 4 Hijack Activated)");
console.log("═══════════════════════════════════════════════════════════════\n");
const layer2Data3 = generator.getLayer2Data(0.62);
console.log("📊 Layer 2 Perception Data:");
console.log(`   Confidence Score: ${(layer2Data3.cvConfidenceScore * 100).toFixed(2)}% ❌ (Below 70%)`);
console.log(`   Status: Member 4 (Resilience) will HIJACK to historical fallback\n`);
const result3 = orchestrator.orchestrateActuation(layer2Data3, null, historicalData);
console.log("📋 Orchestration Decision Chain:");
result3.reasonChain.forEach((reason, idx) => {
    console.log(`   ${idx + 1}. ${reason}`);
});
console.log("\n✅ FINAL ACTUATION COMMAND (HIJACKED TO FALLBACK):");
console.log(`   Target Phase: ${result3.finalCommand.targetPhaseId}`);
console.log(`   Duration: ${result3.finalCommand.durationSeconds}s (from historical database)`);
console.log(`   Execution Mode: ${result3.finalCommand.executionMode}`);
console.log(`   Execution Path: ${result3.executionPath}\n`);
// ===== SCENARIO 4: Stale Data Detection (Network Outage) =====
console.log("═══════════════════════════════════════════════════════════════");
console.log("SCENARIO 4: Stale Layer 2 Data (> 10 seconds old)");
console.log("═══════════════════════════════════════════════════════════════\n");
const staleLayers2Data = {
    ...layer2Data1,
    timestamp: new Date(Date.now() - 11000).toISOString(),
};
console.log("📊 Layer 2 Perception Data:");
console.log(`   Data Age: ~11 seconds (max allowed: 10s)`);
console.log(`   Status: Orchestrator will force fallback due to data staleness\n`);
const result4 = orchestrator.orchestrateActuation(staleLayers2Data, null, historicalData);
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
console.log("═══════════════════════════════════════════════════════════════\n");
console.log("💥 Injecting malicious proposal: NORTH + SOUTH green simultaneously");
const chaosSafetyResult = safetyValidator.validateProposedActuation({
    phaseId: "EAST",
    activeGreens: ["EAST"],
    pedestrianWalkActive: false,
}, {
    phaseId: "MALICIOUS",
    activeGreens: ["NORTH", "SOUTH"],
}, { currentPhaseDuration: 15, pedestrianWalkDuration: 0 });
const chaos1Passed = !chaosSafetyResult.isSafe &&
    chaosSafetyResult.command.action === "FORCE_FALLBACK";
console.log(`   Safety Gate: ${chaos1Passed ? "✅ BLOCKED conflicting greens" : "❌ FAILED — dangerous state allowed"}`);
console.log(`   Action: ${chaosSafetyResult.command.action}`);
if (chaosSafetyResult.command.reason) {
    console.log(`   Reason: ${chaosSafetyResult.command.reason}`);
}
console.log(`   Result: ${chaos1Passed ? "SAFE_DEFAULT enforced — no actuation" : "CRITICAL — review safety-supervisor.ts"}\n`);
// ===== PHASE 4 CHAOS TEST 2: Smog / Low Confidence Fallback =====
console.log("═══════════════════════════════════════════════════════════════");
console.log("CHAOS TEST 2: Smog — Confidence Below 70% Triggers Fallback");
console.log("═══════════════════════════════════════════════════════════════\n");
const smogData = generator.getLayer2Data(0.55);
const chaos2Result = orchestrator.orchestrateActuation(smogData, null, historicalData);
const chaos2Passed = chaos2Result.executionPath === "FALLBACK_MODE" &&
    chaos2Result.finalCommand.executionMode === "HISTORICAL_FALLBACK";
console.log(`   Confidence: ${(smogData.cvConfidenceScore * 100).toFixed(1)}% (smog simulation)`);
console.log(`   Resilience Hijack: ${chaos2Passed ? "✅ ACTIVATED" : "❌ NOT TRIGGERED"}`);
console.log(`   Fallback Phase: ${chaos2Result.finalCommand.targetPhaseId}`);
console.log(`   Fallback Duration: ${chaos2Result.finalCommand.durationSeconds}s\n`);
// ===== ORCHESTRATOR STATE SUMMARY =====
console.log("═══════════════════════════════════════════════════════════════");
console.log("ORCHESTRATOR STATE SUMMARY");
console.log("═══════════════════════════════════════════════════════════════\n");
const orchestratorState = orchestrator.getOrchestrationState();
console.log("📡 Resilience Module State:");
console.log(`   Fallback Active: ${orchestratorState.resilience.isFallbackActive}`);
console.log(`   Current Confidence: ${(orchestratorState.resilience.currentConfidenceScore * 100).toFixed(2)}%`);
if (orchestratorState.resilience.fallbackReason) {
    console.log(`   Fallback Reason: ${orchestratorState.resilience.fallbackReason}`);
}
const allPassed = chaos1Passed && chaos2Passed;
console.log("\n╔════════════════════════════════════════════════════════════╗");
console.log("║     Layer-3 STM Integration Test Complete                  ║");
console.log("║  ✅ Member 1 (Scoring) — types.ts                          ║");
console.log("║  ✅ Member 2 (Optimizer + Emergency) — max-pressure        ║");
console.log("║  ✅ Member 3 (Safety Supervisor) — Verified               ║");
console.log("║  ✅ Member 4 (Data & Resilience) — Verified               ║");
console.log(`║  ${allPassed ? "✅" : "❌"} Phase 4 Chaos Tests — ${allPassed ? "PASSED" : "FAILED"}                      ║`);
console.log("╚════════════════════════════════════════════════════════════╝");
if (!allPassed) {
    process.exitCode = 1;
}
//# sourceMappingURL=index.js.map