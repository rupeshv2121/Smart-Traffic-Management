// ============================================================
// live.ts — Layer 3 STM continuous loop driven by LIVE perception
//
// DATA FLOW (every 30 seconds):
// GatiShakti-ML /perception/layer2 (real YOLO)  →  Member 4 gate
// → Member 1 → Member 2 → Member 3 → Member 4 enforce → Layer 4 console
//
// If the perception service is unreachable, the loop degrades gracefully to
// the MockDataGenerator so the STM keeps running (resilience-by-design).
// ============================================================

import {
  JUNCTION_ID,
  MIN_YELLOW_SECONDS,
  PERCEPTION_URL,
  PIPELINE_CYCLE_MS,
  PIPELINE_CYCLE_SECONDS,
  orchestratorConfig,
} from "./config";
import { Layer2Bridge } from "./layer2-bridge";
import { MockDataGenerator } from "./mock-data/mock_generator";
import { STMOrchestrator } from "./stm-orchestrator";
import type { Layer2Payload } from "./types/types";

const bridge = new Layer2Bridge(PERCEPTION_URL, JUNCTION_ID);
// The mock generator still supplies the NON-perception inputs (the EMVS
// emergency channel and the historical-timing database), plus a perception
// fallback if the live CV service drops out.
const generator = new MockDataGenerator();
const orchestrator = new STMOrchestrator(orchestratorConfig);
const historicalData = generator.getHistoricalData();

console.log("╔════════════════════════════════════════════════════════════╗");
console.log("║     LAYER 3 STM — LIVE PIPELINE (real CV perception)       ║");
console.log("║  GatiShakti-ML → M1 → M2 → M3 → M4 → Layer 4               ║");
console.log("╚════════════════════════════════════════════════════════════╝\n");

console.log("📡 Pipeline Configuration:");
console.log(`   • Perception Service: ${PERCEPTION_URL}`);
console.log(`   • Junction: ${JUNCTION_ID}`);
console.log(`   • Cycle Interval: Every ${PIPELINE_CYCLE_SECONDS} seconds`);
console.log("   • Confidence Threshold: 70%");
console.log("   • Max Data Age: 10 seconds");
console.log(`   • Yellow Clearance: ${MIN_YELLOW_SECONDS}s`);
console.log("   • Conflict Matrix: NORTH↔SOUTH, EAST↔WEST\n");

let cycleCount = 0;

async function acquireLayer2(): Promise<{ data: Layer2Payload; source: string }> {
  try {
    const data = await bridge.fetchLayer2();
    return { data, source: "LIVE_CV" };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.log(
      `\n⚠️  Perception service unavailable (${reason}) — falling back to mock perception.`,
    );
    return { data: generator.getLayer2Data(), source: "MOCK_FALLBACK" };
  }
}

async function runPipeline() {
  cycleCount++;
  const timestamp = new Date().toLocaleTimeString();

  console.log("\n" + "═".repeat(70));
  console.log(`CYCLE #${cycleCount} — ${timestamp}`);
  console.log("═".repeat(70));

  const { data: layer2Data, source } = await acquireLayer2();

  console.log(`\n📡 LAYER 2 (Perception · ${source}):`);
  console.log(`   Junction: ${layer2Data.junctionId}`);
  console.log(
    `   Confidence: ${(layer2Data.cvConfidenceScore * 100).toFixed(1)}%`,
  );
  console.log(
    `   Detections: ${layer2Data.approaches
      .map((a) => {
        const vehicles = a.detections.reduce((s, d) => s + d.count, 0);
        return `${a.approachId}(${a.spatialOccupancyPct}% · ${vehicles}veh)`;
      })
      .join(", ")}`,
  );

  const emergencyToken = generator.triggerEmergency();

  if (emergencyToken) {
    console.log(
      `\n🚨 EMERGENCY DETECTED: ${emergencyToken.emvId} (${emergencyToken.priorityClass})`,
    );
    console.log(
      `   Target: ${emergencyToken.targetPhaseId} phase | ETA: ${emergencyToken.etaSeconds}s`,
    );
  }

  const orchestrationResult = orchestrator.orchestrateActuation(
    layer2Data,
    emergencyToken,
    historicalData,
  );

  console.log("\n👤 MEMBER 1 (Normal-Mode Architect):");
  const member1Status =
    orchestrationResult.executionPath === "NORMAL_MODE"
      ? "✅ Scoring approaches with person-centric weights"
      : "⏭️  Bypassed (Emergency/Fallback)";
  console.log(`   Status: ${member1Status}`);

  console.log("\n👤 MEMBER 2 (Optimizer + Emergency Pathfinder):");
  if (orchestrationResult.executionPath === "EMERGENCY_MODE") {
    console.log(
      `   Status: ✅ GREEN CORRIDOR — Prioritizing ${orchestrationResult.finalCommand.targetPhaseId}`,
    );
  } else if (orchestrationResult.executionPath === "NORMAL_MODE") {
    console.log(
      `   Status: ✅ MAX-PRESSURE — Selected ${orchestrationResult.finalCommand.targetPhaseId}`,
    );
  } else {
    console.log(`   Status: ⏭️  Bypassed (Low Confidence / Stale Data)`);
  }

  console.log("\n👤 MEMBER 3 (Invariant Guardian):");
  console.log(
    `   Conflict Check: ${orchestrationResult.safetyValidationPassed ? "✅ PASSED" : "❌ FAILED"}`,
  );
  console.log(
    `   Target Phase: ${orchestrationResult.finalCommand.targetPhaseId}`,
  );
  console.log(
    `   Clearances: Yellow=${orchestrationResult.finalCommand.clearanceIntervals.yellowSeconds}s, AllRed=${orchestrationResult.finalCommand.clearanceIntervals.allRedSeconds}s`,
  );

  console.log("\n👤 MEMBER 4 (Data & Resilience):");
  const resilienceStatus =
    orchestrationResult.executionPath === "FALLBACK_MODE"
      ? `✅ HIJACKED — Confidence ${(layer2Data.cvConfidenceScore * 100).toFixed(1)}% triggered fallback`
      : `✅ Passed — Using ${orchestrationResult.executionPath}`;
  console.log(`   Status: ${resilienceStatus}`);

  console.log("\n📋 Decision Chain:");
  orchestrationResult.reasonChain.forEach((reason, idx) => {
    console.log(`   ${idx + 1}. ${reason}`);
  });

  console.log("\n🚦 LAYER 4 (Actuation — Mock Hardware):");
  console.log(
    `[Actuate] SUCCESS: Executing Phase ${orchestrationResult.finalCommand.targetPhaseId} | Duration: ${orchestrationResult.finalCommand.durationSeconds}s | Mode: ${orchestrationResult.finalCommand.executionMode}`,
  );
  console.log(
    `[Actuate] Enforcing Clearances → Yellow: ${orchestrationResult.finalCommand.clearanceIntervals.yellowSeconds}s, All-Red: ${orchestrationResult.finalCommand.clearanceIntervals.allRedSeconds}s`,
  );

  const statusIcon =
    orchestrationResult.executionPath === "NORMAL_MODE"
      ? "🟢"
      : orchestrationResult.executionPath === "EMERGENCY_MODE"
        ? "🚨"
        : "⚠️";
  console.log(
    `   ${statusIcon} ${orchestrationResult.safetyValidationPassed ? "SAFE TO EXECUTE" : "SAFETY VIOLATION — BLOCKED"}`,
  );
}

async function main() {
  console.log("═".repeat(70));
  console.log("🔌 Checking perception service health...");
  const healthy = await bridge.isHealthy();
  console.log(
    healthy
      ? `✅ Perception service is UP at ${PERCEPTION_URL}`
      : `⚠️  Perception service not reachable at ${PERCEPTION_URL} — will retry each cycle and use mock fallback meanwhile.`,
  );
  console.log("🔄 Starting 30-second optimization cycle...\n");

  await runPipeline();
  const pipelineInterval = setInterval(() => {
    void runPipeline();
  }, PIPELINE_CYCLE_MS);

  process.on("SIGINT", () => {
    clearInterval(pipelineInterval);
    generator.endEmergencyCorridor();
    console.log("\n\n✋ Live pipeline stopped. Goodbye!");
    process.exit(0);
  });
}

void main();
