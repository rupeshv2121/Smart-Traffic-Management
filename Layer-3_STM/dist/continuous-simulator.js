"use strict";
// ============================================================
// continuous-simulator.ts — DEV-ONLY standalone M1+M2 loop
//
// ⚠️  This file bypasses the orchestrator and is for isolated
//     optimizer debugging only. For the full Layer-3 pipeline
//     (all 4 members), use: npm run dev  or  npm run test
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
const max_pressure_optimizer_1 = require("./max-pressure-optimizer");
const JUNCTION_ID = "JN-042";
const CYCLE_SECONDS = 8;
const DIRECTIONS = ["NORTH", "SOUTH", "EAST", "WEST"];
const lastGreenTracker = {
    NORTH: 0,
    SOUTH: 0,
    EAST: 0,
    WEST: 0,
};
let currentPhase = {
    currentPhaseId: "PHASE_NORTH_GREEN",
    phaseElapsedSeconds: 0,
    currentGreenDuration: 30,
    currentDensity: "medium",
};
let cycleCount = 0;
function rand(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randomDensity() {
    const index = rand(0, 2);
    const options = ["low", "medium", "high"];
    return options[index] ?? "medium";
}
function generateMockApproaches() {
    return DIRECTIONS.map((dir) => {
        const motorcycle = rand(0, 15);
        const car = rand(0, 20);
        const auto_rickshaw = rand(0, 10);
        const mini_truck = rand(0, 5);
        const bus = rand(0, 3);
        const heavy_truck = rand(0, 2);
        const detections = [
            { type: "Motorcycle", count: motorcycle },
            { type: "Car", count: car },
            { type: "AutoRickshaw", count: auto_rickshaw },
            { type: "MiniTruck", count: mini_truck },
            { type: "Bus", count: bus },
            { type: "HeavyTruck", count: heavy_truck },
        ].filter((d) => d.count > 0);
        const totalVehicles = motorcycle + car + auto_rickshaw + mini_truck + bus + heavy_truck;
        const roadCapacity = 100;
        const queueLength = Math.min(totalVehicles, roadCapacity);
        lastGreenTracker[dir] =
            (lastGreenTracker[dir] ?? 0) +
                CYCLE_SECONDS;
        return {
            direction: dir,
            detections,
            avgWaitingTime: rand(5, 120),
            arrivalRate: rand(2, 25),
            queueLength,
            roadCapacity,
            hasBus: bus > 0,
            hasEmergencyVehicle: false, // EMV handled separately by pause/resume
            lastGreenSeconds: lastGreenTracker[dir] ?? 0,
        };
    });
}
function generateMockDownstream() {
    return DIRECTIONS.map((dir) => ({
        direction: dir,
        occupancyPct: rand(10, 85),
    }));
}
function generateMockConfidence() {
    return Math.random() > 0.9
        ? parseFloat((Math.random() * 0.3 + 0.3).toFixed(2))
        : parseFloat((Math.random() * 0.2 + 0.8).toFixed(2));
}
function printCycle(plan, confidence) {
    cycleCount++;
    const time = new Date().toLocaleTimeString();
    console.log("\n" + "═".repeat(60));
    console.log(`  CYCLE #${cycleCount}  |  ${time}  |  Confidence: ${confidence}`);
    console.log("═".repeat(60));
    if (plan.dataSource === "EMV_OVERRIDE") {
        console.log("  🚨 EMV CORRIDOR ACTIVE — Optimizer paused");
        return;
    }
    if (plan.dataSource === "HISTORICAL") {
        console.log("  ⚠️  LOW CONFIDENCE — Using historical fallback");
        console.log(`  🟢 Default green: ${plan.greenDuration}s`);
        return;
    }
    console.log(`  🏆 WINNER     : ${plan.winningDirection}`);
    console.log(`  🟢 GREEN      : ${plan.greenDuration}s`);
    console.log(`  🔄 EXTENDED   : ${plan.extendGreen ? "YES" : "NO"}`);
    lastGreenTracker[plan.winningDirection] = 0;
    console.log("\n  Scores:");
    Object.entries(plan.priorityScores).forEach(([dir, score]) => {
        const isWinner = dir === plan.winningDirection;
        const flag = isWinner ? " 🏆" : "";
        const spillback = plan.spillbackFlags[dir] ? " ⚠️SPILLBACK" : "";
        const starved = plan.starvationFlags[dir] ? " ⚠️STARVED" : "";
        console.log(`    ${dir.padEnd(8)}: ${score.toFixed(1)}${flag}${spillback}${starved}`);
    });
}
function runOneCycle() {
    const approaches = generateMockApproaches();
    const downstream = generateMockDownstream();
    const confidence = generateMockConfidence();
    const plan = (0, max_pressure_optimizer_1.runMaxPressureOptimizer)(JUNCTION_ID, approaches, downstream, currentPhase, confidence);
    printCycle(plan, confidence);
    if (plan.dataSource === "LIVE") {
        currentPhase = {
            currentPhaseId: plan.targetPhaseId,
            phaseElapsedSeconds: 0,
            currentGreenDuration: plan.greenDuration,
            currentDensity: randomDensity(),
        };
    }
}
console.clear();
console.log("═".repeat(60));
console.log("  🚦 LAYER 3 — CONTINUOUS LIVE SIMULATION");
console.log("  Junction: " + JUNCTION_ID);
console.log("  Updates every " + CYCLE_SECONDS + " seconds");
console.log("  Press Ctrl+C to stop");
console.log("═".repeat(60));
runOneCycle();
setInterval(runOneCycle, CYCLE_SECONDS * 1000);
// ─── Simulated EMV corridor event ──────────────────────────
// This demonstrates Member 3's pause/resume hooks working
// independently of normal vehicle scoring above
setTimeout(() => {
    console.log("\n🚨🚨🚨 SIMULATING EMERGENCY CORRIDOR EVENT 🚨🚨🚨");
    (0, max_pressure_optimizer_1.pauseOptimizer)(JUNCTION_ID);
    setTimeout(() => {
        console.log("\n✅ EMERGENCY CORRIDOR ENDED — Resuming normal operation\n");
        (0, max_pressure_optimizer_1.resumeOptimizer)(JUNCTION_ID);
    }, 15000);
}, 30000);
//# sourceMappingURL=continuous-simulator.js.map