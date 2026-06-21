"use strict";
// ============================================================
// max-pressure-optimizer.ts
// Member 2 — Core Optimization Engineer
//
// RESPONSIBILITY:
//   Selects which phase gets green signal
//   Calculates how long green should last
//   Handles confidence fallback
//   Exposes pause/resume for Member 3 (EMV team)
//
// USED BY:
//   Member 3 → calls pauseOptimizer / resumeOptimizer
//   Member 4 → receives ProposedPlan from us
//   Member 5 → provides confidenceScore input
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.pauseOptimizer = pauseOptimizer;
exports.resumeOptimizer = resumeOptimizer;
exports.runMaxPressureOptimizer = runMaxPressureOptimizer;
const types_1 = require("./types/types");
// ─── Constants ───────────────────────────────────────────────
const MIN_GREEN = 15;
const MAX_GREEN = 90;
const YELLOW_TIME = 5;
const ALL_RED_TIME = 2;
const SCALING_FACTOR = 1.5;
const EXTENSION_SEC = 10;
const CONF_THRESHOLD = 0.7;
const DEFAULT_HISTORICAL_GREEN = 30;
// ─── EMV Pause/Resume System ─────────────────────────────────
const pausedJunctions = new Set();
function pauseOptimizer(junctionId) {
    pausedJunctions.add(junctionId);
    console.log(`[PAUSED] Junction ${junctionId} — EMV corridor active. ` +
        `Normal optimizer suspended.`);
}
function resumeOptimizer(junctionId) {
    pausedJunctions.delete(junctionId);
    console.log(`[RESUMED] Junction ${junctionId} — returning to normal mode. ` +
        `Max-pressure recovery begins automatically.`);
}
// ─── Pressure Calculation ─────────────────────────────────────
function calculatePressure(scored, downstream) {
    const ds = downstream.find((d) => d.direction.toUpperCase() === scored.direction);
    const downstreamDemand = ds ? ds.occupancyPct : 0;
    return scored.priorityScore - downstreamDemand;
}
// ─── Green Time Calculation ───────────────────────────────────
function calculateGreenTime(priorityScore) {
    const raw = MIN_GREEN + priorityScore * SCALING_FACTOR;
    return Math.round(Math.max(MIN_GREEN, Math.min(MAX_GREEN, raw)));
}
// ─── Adaptive Extension Check ─────────────────────────────────
function shouldExtendGreen(phase) {
    return (phase.currentDensity === "high" &&
        phase.phaseElapsedSeconds >= phase.currentGreenDuration &&
        phase.currentGreenDuration < MAX_GREEN);
}
// ─── Build EMV Override Plan ──────────────────────────────────
function buildEMVOverridePlan(junctionId) {
    return {
        junctionId,
        timestamp: new Date().toISOString(),
        dataSource: "EMV_OVERRIDE",
        targetPhaseId: "PHASE_EMV_CONTROLLED",
        greenDuration: 0,
        yellowDuration: 0,
        allRedDuration: 0,
        pressureSnapshot: {},
        priorityScores: {},
        personFlows: {},
        spillbackFlags: {},
        starvationFlags: {},
        extendGreen: false,
        winningDirection: "EMV_CONTROLLED",
    };
}
// ─── Build Historical Fallback Plan ───────────────────────────
function buildHistoricalFallback(junctionId, historicalGreenTime = DEFAULT_HISTORICAL_GREEN) {
    console.log(`[FALLBACK] Junction ${junctionId}: ` +
        `low confidence → using historical timing (${historicalGreenTime}s)`);
    return {
        junctionId,
        timestamp: new Date().toISOString(),
        dataSource: "HISTORICAL",
        targetPhaseId: "PHASE_HISTORICAL_DEFAULT",
        greenDuration: historicalGreenTime,
        yellowDuration: YELLOW_TIME,
        allRedDuration: ALL_RED_TIME,
        pressureSnapshot: {},
        priorityScores: {},
        personFlows: {},
        spillbackFlags: {},
        starvationFlags: {},
        extendGreen: false,
        winningDirection: "HISTORICAL",
    };
}
// ─── Main Optimizer ───────────────────────────────────────────
function runMaxPressureOptimizer(junctionId, approaches, downstream, currentPhase, confidenceScore, historicalGreenTime) {
    // ─── Check 1: EMV Override ──────────────────────────────
    if (pausedJunctions.has(junctionId)) {
        return buildEMVOverridePlan(junctionId);
    }
    // ─── Check 2: Confidence Gate ───────────────────────────
    if (confidenceScore < CONF_THRESHOLD) {
        return buildHistoricalFallback(junctionId, historicalGreenTime);
    }
    // ─── Step 1+2: Score all approaches ─────────────────────
    const scoredApproaches = (0, types_1.scoreAllApproaches)(approaches);
    // ─── Step 3: Calculate pressure per approach ────────────
    const pressureMap = {};
    const scoreMap = {};
    const flowMap = {};
    const spillbackMap = {};
    const starvationMap = {};
    scoredApproaches.forEach((scored) => {
        pressureMap[scored.direction] = calculatePressure(scored, downstream);
        scoreMap[scored.direction] = scored.priorityScore;
        flowMap[scored.direction] = scored.personFlow;
        spillbackMap[scored.direction] = scored.spillbackBoost;
        starvationMap[scored.direction] = scored.starvationOverride;
    });
    // ─── Select Winning Phase ────────────────────────────────
    let winningDir = "";
    let highestPressure = -Infinity;
    Object.entries(pressureMap).forEach(([dir, pressure]) => {
        if (pressure > highestPressure) {
            highestPressure = pressure;
            winningDir = dir;
        }
    });
    // ─── Step 4: Calculate Green Duration ───────────────────
    const winningScore = scoreMap[winningDir] ?? 0;
    let greenDuration = calculateGreenTime(winningScore);
    let extendGreen = false;
    // ─── Step 5: Adaptive Extension ─────────────────────────
    if (currentPhase.currentPhaseId === `PHASE_${winningDir}_GREEN` &&
        shouldExtendGreen(currentPhase)) {
        greenDuration = Math.min(currentPhase.currentGreenDuration + EXTENSION_SEC, MAX_GREEN);
        extendGreen = true;
        console.log(`[EXTEND] ${winningDir}: ` +
            `extending green by ${EXTENSION_SEC}s → ${greenDuration}s total`);
    }
    console.log(`[OPTIMIZER] Junction ${junctionId}: ` +
        `${winningDir} selected | ` +
        `Pressure: ${highestPressure.toFixed(2)} | ` +
        `Green: ${greenDuration}s | ` +
        `People: ${flowMap[winningDir]}`);
    return {
        junctionId,
        timestamp: new Date().toISOString(),
        dataSource: "LIVE",
        targetPhaseId: `PHASE_${winningDir}_GREEN`,
        greenDuration,
        yellowDuration: YELLOW_TIME,
        allRedDuration: ALL_RED_TIME,
        pressureSnapshot: pressureMap,
        priorityScores: scoreMap,
        personFlows: flowMap,
        spillbackFlags: spillbackMap,
        starvationFlags: starvationMap,
        extendGreen,
        winningDirection: winningDir,
    };
}
//# sourceMappingURL=max-pressure-optimizer.js.map