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
  DASHBOARD_PORT,
  DATA_DIR,
  EMV_INGEST_PORT,
  JUNCTION_ID,
  JUNCTION_LOCATION,
  MIN_YELLOW_SECONDS,
  PERCEPTION_URL,
  PIPELINE_CYCLE_MS,
  PIPELINE_CYCLE_SECONDS,
  orchestratorConfig,
} from "./config";
import { AuthStore } from "./auth/auth-store";
import { ChallanStore } from "./challan/challan-store";
import { createPersistence, FilePersistence } from "./persistence/persistence";
import { RegistryStore } from "./registry/registry-store";
import { ControlChannel } from "./control/control-channel";
import { deriveFallbackPlans } from "./control/fallback";
import { trace } from "@opentelemetry/api";

import { buildCitySnapshot, liveJunctionSummary } from "./dashboard/city";
import { createHotStore, NullHotStore } from "./hotstore/hot-store";
import { MultiJunctionController } from "./multi/junctions-controller";
import { initTracing, withSpan } from "./observability/tracing";
import {
  DashboardGateway,
  type DispatchParams,
  type DispatchResult,
} from "./dashboard/dashboard-gateway";
import { buildSnapshot } from "./dashboard/snapshot";
import { MockEmvDispatch } from "./emv/emv-dispatch";
import { loadEmvKeys } from "./emv/emv-keys";
import { EmvIngestServer } from "./emv/emv-ingest-server";
import { CorridorManager } from "./emv/corridor-manager";
import { aStarRoute } from "./emv/emv-router";
import { cityGraph } from "./emv/junction-graph";
import { Layer2Bridge } from "./layer2-bridge";
import { MockDataGenerator } from "./mock-data/mock_generator";
import { STMOrchestrator } from "./stm-orchestrator";
import { type BusLaneResult, type Layer2Payload, type PlateEvent } from "./types/types";

const bridge = new Layer2Bridge(PERCEPTION_URL, JUNCTION_ID);
// The mock generator still supplies the historical-timing database and a
// perception fallback if the live CV service drops out. Emergencies now arrive
// over the REAL Layer 1 intake (EmvIngestServer), not the mock trigger.
const generator = new MockDataGenerator();
const orchestrator = new STMOrchestrator(orchestratorConfig);
// Static defaults; the live loop derives real time-of-day plans from persisted
// history each cycle and falls back to these when history is thin.
const fallbackDefaults = generator.getHistoricalData();
// Multi-junction Green-Corridor coordinator (A*/D* Lite routing, reservations,
// pass-detection, and converging-EMV sequencing). Sits above the per-junction
// verifier/orchestrator and feeds the EMVS + TI dashboards.
const corridorManager = new CorridorManager(JUNCTION_ID);
// Default destination when a dispatch omits one: AIIMS (a hospital corridor).
const DEFAULT_EMV_DESTINATION = "DEL_DL_AIIMS_05";
// EMV telemetry intake (Layer 1 second sensing stream). A revoke on the
// endpoint is forwarded into the junction verifier's blocklist AND ends the
// corridor (releases all reservations, promotes any held EMV).
const emvIngest = new EmvIngestServer(EMV_INGEST_PORT, (tokenId) => {
  orchestrator.revokeEmvToken(tokenId);
  corridorManager.endRunByTokenId(tokenId);
});
// Durable store (audit, history, challans, registry) — survives restarts.
// File-backed by default; Postgres/TimescaleDB when DATABASE_URL is set.
// `let` so we can fall back to the file store if a configured DB is unreachable.
let persistence = createPersistence();
// These read the (possibly async-hydrated) store, so they are constructed in
// main() AFTER persistence.init(). Declared here for runPipeline to reference.
let control: ControlChannel;
let challans: ChallanStore;
let registry: RegistryStore;
let dashboard: DashboardGateway;
// In-process EMV dispatch authority (signs tokens for the dashboard dispatch
// endpoint, just like the CLI). The junction still only verifies, never trusts.
const dispatchAuthority = new MockEmvDispatch(
  loadEmvKeys().privateKeyPem,
  JUNCTION_ID,
  JUNCTION_LOCATION,
);

// EMV dispatch with A* routing + safe-sequencing conflict resolution.
// 1. Compute the corridor route ITO → destination (A* over the city graph).
// 2. Issue a signed, route-scoped token and register it with the corridor
//    manager, which sequences converging EMVs by priority then ETA.
// 3. The winner is granted the corridor (submitted to the junction); a loser is
//    HELD (CONFLICT) and promoted automatically the moment the winner clears.
function dispatchEmv(params: DispatchParams): DispatchResult {
  const destination =
    params.destinationJunctionId && cityGraph.has(params.destinationJunctionId)
      ? params.destinationJunctionId
      : DEFAULT_EMV_DESTINATION;
  const route = aStarRoute(JUNCTION_ID, destination) ?? [JUNCTION_ID];

  const token = dispatchAuthority.issue({
    emvId: params.emvId ?? `AMB-${Math.floor(Math.random() * 9999)}`,
    priorityClass: params.priorityClass,
    etaSeconds: params.etaSeconds,
    targetPhaseId: params.targetPhaseId,
    routeJunctions: route,
  });

  const resolution = corridorManager.register(token);
  if (resolution.granted) {
    emvIngest.submit(token);
    return { ok: true, token };
  }
  // Held behind a higher-priority/closer EMV — queued for safe sequencing.
  const active = emvIngest.getActiveToken();
  return {
    ok: false,
    conflict: true,
    active: {
      emvId: active?.emvId ?? resolution.grantedEmvId,
      priorityClass: active?.priorityClass ?? params.priorityClass,
    },
  };
}

// Peer junctions for the Command Dashboard city map, each driven through the
// real M1–M4 orchestrator on its own (mock) perception.
const city = new MultiJunctionController(generator, orchestrator, fallbackDefaults);

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

async function acquireBusLane(): Promise<BusLaneResult | null> {
  try {
    return await bridge.fetchBusLane();
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.log(`\n⚠️  Bus lane detection unavailable (${reason}) — skipping this cycle.`);
    return null;
  }
}

async function runPipeline() {
  cycleCount++;
  // Edge liveness pulse for the resilience ladder (30s silence ⇒ STATE 2).
  orchestrator.recordHeartbeat();
  const timestamp = new Date().toLocaleTimeString();

  console.log("\n" + "═".repeat(70));
  console.log(`CYCLE #${cycleCount} — ${timestamp}`);
  console.log("═".repeat(70));

  const { data: layer2Data, source } = await acquireLayer2();
  const busLaneResult = await acquireBusLane();

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

  if (busLaneResult) {
    console.log(`\n🚌 BUS LANE DETECTION:`);
    console.log(`   Unauthorized vehicles: ${busLaneResult.unauthorizedCount}`);
    console.log(`   Confidence: ${(busLaneResult.confidenceScore * 100).toFixed(1)}%`);
    if (busLaneResult.violations.length > 0) {
      console.log(`   Violators: ${busLaneResult.violations.map(v => v.type).join(", ")}`);
    }
  }

  // ── Green-Corridor coordination: routing · reservations · sequencing ──
  // Pass-detection from the active EMV's GPS, advance corridors along their A*/
  // D* Lite route, promote a HELD EMV when the winner clears, and stop preempting
  // once a vehicle ARRIVES.
  const peekToken = emvIngest.getActiveToken();
  if (peekToken) {
    // Track tokens that arrived over the REAL Layer-1 intake / emv:dispatch CLI
    // (the dashboard path already registers on dispatch). register() is
    // idempotent, so this just ensures every active token has a corridor.
    corridorManager.register(peekToken);
    corridorManager.updateGps(peekToken.emvId, peekToken.gpsTrack);
  }
  corridorManager.tick();
  const grantedToken = corridorManager.grantedToken();
  if (grantedToken) {
    if (grantedToken.tokenId !== emvIngest.getActiveToken()?.tokenId) {
      emvIngest.submit(grantedToken);
    }
  } else if (emvIngest.getActiveToken()) {
    emvIngest.clearActive(); // corridor finished / arrived → resume normal flow
  }
  const corridorSnapshot = corridorManager.snapshot();

  const emergencyToken = emvIngest.getActiveToken();

  if (emergencyToken) {
    console.log(
      `\n🚨 EMERGENCY DETECTED: ${emergencyToken.emvId} (${emergencyToken.priorityClass})`,
    );
    console.log(
      `   Target: ${emergencyToken.targetPhaseId} phase | ETA: ${emergencyToken.etaSeconds}s`,
    );
  }

  // Historical fallback timing, derived from the durable cycle history (the
  // fail-safe loop). Used by the resilience layer when CV confidence is low.
  const historicalData = deriveFallbackPlans(persistence.recentSnapshots(2000), fallbackDefaults);

  const orchestrationResult = orchestrator.orchestrateActuation(
    layer2Data,
    emergencyToken,
    historicalData,
  );

  // ── Operator manual override (Signal Control) ──────────────────────────
  // Emergencies always win; an override requested during a corridor is
  // deferred (and audited). Otherwise we hold the requested phase with the
  // configured clearance minima — a single green phase never conflicts.
  const pendingOverride = control.activeOverride();
  if (pendingOverride && emergencyToken) {
    control.recordDeferred(pendingOverride, "emergency corridor active");
  } else if (pendingOverride) {
    orchestrationResult.finalCommand.targetPhaseId = pendingOverride.phaseId;
    orchestrationResult.finalCommand.durationSeconds = pendingOverride.durationSeconds;
    orchestrationResult.finalCommand.executionMode = "MANUAL_OVERRIDE";
    orchestrationResult.finalCommand.clearanceIntervals = control.clearanceIntervals();
    orchestrationResult.executionPath = "OVERRIDE_MODE";
    orchestrationResult.reasonChain.push(
      `Manual override by ${pendingOverride.requestedBy}: hold ${pendingOverride.phaseId} (${pendingOverride.reason})`,
    );
    control.recordApplied(pendingOverride);
  }

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

  // Layer 5 — push this cycle to any connected dashboards.
  const snapshot = buildSnapshot({
    cycle: cycleCount,
    layer2: layer2Data,
    source: source === "LIVE_CV" ? "LIVE_CV" : "MOCK_FALLBACK",
    emergency: emergencyToken,
    result: orchestrationResult,
    corridor: corridorSnapshot,
    busLane: busLaneResult,
  });
  dashboard.broadcast(snapshot);

  // Layer 5 — refresh and push the city map (live junction + orchestrated peers).
  dashboard.broadcastCity(
    buildCitySnapshot({
      liveSummary: liveJunctionSummary(snapshot),
      peers: city.summaries(),
      safetyValidationPassed: orchestrationResult.safetyValidationPassed,
      source: snapshot.perception.source,
    }),
  );

  // Append-only audit: one record per cycle (EMERGENCY / SAFETY_BLOCK / DECISION).
  const action = emergencyToken
    ? "EMERGENCY"
    : !orchestrationResult.safetyValidationPassed
      ? "SAFETY_BLOCK"
      : "DECISION";
  control.audit(
    "SYSTEM",
    action,
    orchestrationResult.safetyValidationPassed ? "ok" : "blocked",
    `cycle #${cycleCount}: ${snapshot.decision.executionMode} → ${snapshot.decision.targetPhaseId} ` +
      `${snapshot.decision.durationSeconds}s (conf ${(snapshot.perception.cvConfidenceScore * 100).toFixed(0)}%)`,
  );

  // Tag the active cycle span (OTel) with the decision outcome.
  trace.getActiveSpan()?.setAttributes({
    "stm.cycle": cycleCount,
    "stm.mode": snapshot.decision.executionMode,
    "stm.phase": snapshot.decision.targetPhaseId,
    "stm.cvConfidence": snapshot.perception.cvConfidenceScore,
    "stm.safetyPassed": orchestrationResult.safetyValidationPassed,
  });

  // ANPR → challan queue: ingest real plate events if Layer 2 sent any, else
  // synthesise at a low rate so the violation queue stays alive for the demo.
  const plateEvents: PlateEvent[] = [...(layer2Data.plateEvents ?? [])];

  // Bus lane violations → challan queue as WRONG_LANE plate events.
  if (busLaneResult && busLaneResult.violations.length > 0) {
    const series = ["DL3C", "DL8S", "DL1C", "HR26", "UP14", "DL5S"];
    for (const v of busLaneResult.violations) {
      const s = series[Math.floor(Math.random() * series.length)]!;
      const letters = String.fromCharCode(65 + Math.floor(Math.random() * 26), 65 + Math.floor(Math.random() * 26));
      const num = String(1000 + Math.floor(Math.random() * 9000));
      plateEvents.push({
        plate: `${s}${letters}${num}`,
        approachId: "NORTH",
        violation: "WRONG_LANE",
        confidence: busLaneResult.confidenceScore,
      });
    }
  }

  if (plateEvents.length > 0) {
    challans.ingest(plateEvents, snapshot.code, snapshot.name);
  } else {
    challans.maybeSynthesize(snapshot.code, snapshot.name);
  }

  // Keep the live junction's edge node ONLINE with a fresh heartbeat.
  registry.touchHeartbeat("EN-118");
}

async function main() {
  console.log("═".repeat(70));

  // OpenTelemetry tracing (no-op unless OTEL_* env configured).
  initTracing();

  // Resilience ladder chaos toggles (Architecture §6). Default = healthy STATE 0.
  //   BROKER_CONNECTED=false → STATE 2 (locally autonomous, no coordination)
  //   EDGE_FAULT=true        → STATE 3 (total fail-safe → fixed-time default)
  orchestrator.setBrokerConnected(process.env.BROKER_CONNECTED !== "false");
  orchestrator.setEdgeFault(process.env.EDGE_FAULT === "true");
  if (process.env.BROKER_CONNECTED === "false")
    console.log("⚠️  BROKER_CONNECTED=false → resilience STATE 2 (locally autonomous).");
  if (process.env.EDGE_FAULT === "true")
    console.log("⛔ EDGE_FAULT=true → resilience STATE 3 (total fail-safe / fixed-time).");

  // Open the durable store and construct the stores that read from it. Doing
  // this before serving means the Postgres adapter's caches are hydrated.
  // If a configured Postgres/Redis is unreachable, degrade gracefully to the
  // file / in-memory adapters rather than crashing the whole stack.
  try {
    await persistence.init();
  } catch (err) {
    console.warn(
      `⚠️  Persistence init failed (${err instanceof Error ? err.message : err}); ` +
        `falling back to the file store (.data/).`,
    );
    persistence = new FilePersistence(DATA_DIR);
    await persistence.init();
  }

  let hotStore = createHotStore();
  try {
    await hotStore.init();
  } catch (err) {
    console.warn(
      `⚠️  Hot store init failed (${err instanceof Error ? err.message : err}); ` +
        `using in-memory live state only.`,
    );
    hotStore = new NullHotStore();
  }

  control = new ControlChannel(JUNCTION_ID, persistence);
  challans = new ChallanStore(persistence);
  registry = new RegistryStore(persistence);
  const auth = new AuthStore(persistence);
  dashboard = new DashboardGateway(DASHBOARD_PORT, control, {
    persistence,
    challans,
    registry,
    auth,
    hotStore,
    dispatch: dispatchEmv,
    fallbackDefaults,
  });

  console.log("🔌 Checking perception service health...");
  const healthy = await bridge.isHealthy();
  console.log(
    healthy
      ? `✅ Perception service is UP at ${PERCEPTION_URL}`
      : `⚠️  Perception service not reachable at ${PERCEPTION_URL} — will retry each cycle and use mock fallback meanwhile.`,
  );

  await emvIngest.start();
  console.log(
    `🚑 EMV intake listening on http://localhost:${EMV_INGEST_PORT} ` +
      `(POST /emergency/token). Send one with: npm run emv:dispatch -- EAST 35 CRITICAL`,
  );

  await dashboard.start();
  console.log(
    `📊 Layer 5 dashboard feed on http://localhost:${DASHBOARD_PORT}/events ` +
      `(SSE). Start the UI with: cd ../Layer-5 && npm run dev`,
  );
  console.log("🔄 Starting 30-second optimization cycle...\n");

  await withSpan("pipeline.cycle", () => runPipeline());
  const pipelineInterval = setInterval(() => {
    void withSpan("pipeline.cycle", () => runPipeline());
  }, PIPELINE_CYCLE_MS);

  process.on("SIGINT", () => {
    clearInterval(pipelineInterval);
    emvIngest.stop();
    dashboard.stop();
    console.log("\n\n✋ Live pipeline stopped. Goodbye!");
    process.exit(0);
  });
}

void main();
