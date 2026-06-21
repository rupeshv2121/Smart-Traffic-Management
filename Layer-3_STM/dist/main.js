"use strict";
// ============================================================
// main.ts — Layer 3 STM continuous execution loop (Phase 3)
//
// DATA FLOW (every 30 seconds):
// Mock Generator → Member 4 gate → Member 1 → Member 2
// → Member 3 → Member 4 enforce → Layer 4 console actuation
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("./config");
const mock_generator_1 = require("./mock-data/mock_generator");
const stm_orchestrator_1 = require("./stm-orchestrator");
const generator = new mock_generator_1.MockDataGenerator();
const orchestrator = new stm_orchestrator_1.STMOrchestrator(config_1.orchestratorConfig);
const historicalData = generator.getHistoricalData();
console.log("╔════════════════════════════════════════════════════════════╗");
console.log("║       LAYER 3 STM — CONTINUOUS DATA PIPELINE               ║");
console.log("║  Layer 2 → M1 → M2 → M3 → M4 → Layer 4                     ║");
console.log("╚════════════════════════════════════════════════════════════╝\n");
console.log("📡 Pipeline Configuration:");
console.log(`   • Cycle Interval: Every ${config_1.PIPELINE_CYCLE_SECONDS} seconds`);
console.log("   • Confidence Threshold: 70%");
console.log("   • Max Data Age: 10 seconds");
console.log(`   • Yellow Clearance: ${config_1.MIN_YELLOW_SECONDS}s`);
console.log("   • Conflict Matrix: NORTH↔SOUTH, EAST↔WEST\n");
let cycleCount = 0;
function runPipeline() {
    cycleCount++;
    const timestamp = new Date().toLocaleTimeString();
    console.log("\n" + "═".repeat(70));
    console.log(`CYCLE #${cycleCount} — ${timestamp}`);
    console.log("═".repeat(70));
    const layer2Data = generator.getLayer2Data();
    console.log("\n📡 LAYER 2 (Perception):");
    console.log(`   Junction: ${layer2Data.junctionId}`);
    console.log(`   Confidence: ${(layer2Data.cvConfidenceScore * 100).toFixed(1)}%`);
    console.log(`   Detections: ${layer2Data.approaches.map((a) => `${a.approachId}(${a.spatialOccupancyPct}%)`).join(", ")}`);
    const emergencyToken = generator.triggerEmergency();
    if (emergencyToken) {
        console.log(`\n🚨 EMERGENCY DETECTED: ${emergencyToken.emvId} (${emergencyToken.priorityClass})`);
        console.log(`   Target: ${emergencyToken.targetPhaseId} phase | ETA: ${emergencyToken.etaSeconds}s`);
    }
    const orchestrationResult = orchestrator.orchestrateActuation(layer2Data, emergencyToken, historicalData);
    console.log("\n👤 MEMBER 1 (Normal-Mode Architect):");
    const member1Status = orchestrationResult.executionPath === "NORMAL_MODE"
        ? "✅ Scoring approaches with person-centric weights"
        : "⏭️  Bypassed (Emergency/Fallback)";
    console.log(`   Status: ${member1Status}`);
    console.log("\n👤 MEMBER 2 (Optimizer + Emergency Pathfinder):");
    if (orchestrationResult.executionPath === "EMERGENCY_MODE") {
        console.log(`   Status: ✅ GREEN CORRIDOR — Prioritizing ${orchestrationResult.finalCommand.targetPhaseId}`);
    }
    else if (orchestrationResult.executionPath === "NORMAL_MODE") {
        console.log(`   Status: ✅ MAX-PRESSURE — Selected ${orchestrationResult.finalCommand.targetPhaseId}`);
    }
    else {
        console.log(`   Status: ⏭️  Bypassed (Low Confidence / Stale Data)`);
    }
    console.log("\n👤 MEMBER 3 (Invariant Guardian):");
    console.log(`   Conflict Check: ${orchestrationResult.safetyValidationPassed ? "✅ PASSED" : "❌ FAILED"}`);
    console.log(`   Target Phase: ${orchestrationResult.finalCommand.targetPhaseId}`);
    console.log(`   Clearances: Yellow=${orchestrationResult.finalCommand.clearanceIntervals.yellowSeconds}s, AllRed=${orchestrationResult.finalCommand.clearanceIntervals.allRedSeconds}s`);
    console.log("\n👤 MEMBER 4 (Data & Resilience):");
    const resilienceStatus = orchestrationResult.executionPath === "FALLBACK_MODE"
        ? `✅ HIJACKED — Confidence ${(layer2Data.cvConfidenceScore * 100).toFixed(1)}% triggered fallback`
        : `✅ Passed — Using ${orchestrationResult.executionPath}`;
    console.log(`   Status: ${resilienceStatus}`);
    console.log("\n📋 Decision Chain:");
    orchestrationResult.reasonChain.forEach((reason, idx) => {
        console.log(`   ${idx + 1}. ${reason}`);
    });
    console.log("\n🚦 LAYER 4 (Actuation — Mock Hardware):");
    console.log(`[Actuate] SUCCESS: Executing Phase ${orchestrationResult.finalCommand.targetPhaseId} | Duration: ${orchestrationResult.finalCommand.durationSeconds}s | Mode: ${orchestrationResult.finalCommand.executionMode}`);
    console.log(`[Actuate] Enforcing Clearances → Yellow: ${orchestrationResult.finalCommand.clearanceIntervals.yellowSeconds}s, All-Red: ${orchestrationResult.finalCommand.clearanceIntervals.allRedSeconds}s`);
    const statusIcon = orchestrationResult.executionPath === "NORMAL_MODE"
        ? "🟢"
        : orchestrationResult.executionPath === "EMERGENCY_MODE"
            ? "🚨"
            : "⚠️";
    console.log(`   ${statusIcon} ${orchestrationResult.safetyValidationPassed ? "SAFE TO EXECUTE" : "SAFETY VIOLATION — BLOCKED"}`);
}
console.log("═".repeat(70));
console.log("🔄 Starting 30-second optimization cycle...\n");
runPipeline();
const pipelineInterval = setInterval(runPipeline, config_1.PIPELINE_CYCLE_MS);
process.on("SIGINT", () => {
    clearInterval(pipelineInterval);
    generator.endEmergencyCorridor();
    console.log("\n\n✋ Pipeline stopped. Goodbye!");
    process.exit(0);
});
//# sourceMappingURL=main.js.map