"use strict";
// This code represents the digital boundaries and data contracts (types.ts) for your Layer 3 engine.
Object.defineProperty(exports, "__esModule", { value: true });
exports.PRIORITY_CLASS_MULTIPLIER = exports.SCORING_CONSTANTS = exports.VEHICLE_WEIGHTS = void 0;
exports.calculatePersonFlow = calculatePersonFlow;
exports.detectSpillback = detectSpillback;
exports.detectStarvation = detectStarvation;
exports.scoreAllApproaches = scoreAllApproaches;
// ============================================================
// 1. Vehicle Weights & Detection
// ============================================================
exports.VEHICLE_WEIGHTS = {
    Motorcycle: 0.5,
    Car: 1.0,
    AutoRickshaw: 1.2,
    MiniTruck: 2.0,
    Bus: 3.0,
    HeavyTruck: 4.0,
    Ambulance: 10.0,
};
// ============================================================
// Member 1: Normal-Mode Architect Scoring Logic
// ============================================================
// ─── Scoring Constants ────────────────────────────────────
exports.SCORING_CONSTANTS = {
    WAITING_TIME_FACTOR: 0.5,
    QUEUE_FACTOR: 0.8,
    SPILLBACK_THRESHOLD: 0.85, // If queue > 85% of capacity
    SPILLBACK_BOOST: 15,
    STARVATION_THRESHOLD: 45, // seconds since last green
    STARVATION_BOOST: 20,
    BUS_BONUS: 3,
};
// ─── Helper Functions for Scoring ─────────────────────────
function calculatePersonFlow(detections) {
    return detections.reduce((sum, detection) => {
        const weight = exports.VEHICLE_WEIGHTS[detection.type] ?? 1.0;
        return sum + detection.count * weight;
    }, 0);
}
function detectSpillback(queueLength, roadCapacity) {
    return queueLength / roadCapacity > exports.SCORING_CONSTANTS.SPILLBACK_THRESHOLD;
}
function detectStarvation(lastGreenSeconds) {
    return lastGreenSeconds > exports.SCORING_CONSTANTS.STARVATION_THRESHOLD;
}
// ─── Main Scoring Function ──────────────────────────────
function scoreAllApproaches(approaches) {
    return approaches.map((approach) => {
        // Step 1: Base priority from person flow
        const personFlow = calculatePersonFlow(approach.detections);
        // Step 2: Waiting time component
        const waitingComponent = approach.avgWaitingTime * exports.SCORING_CONSTANTS.WAITING_TIME_FACTOR;
        // Step 3: Queue utilization component
        const queueUtilization = Math.min(approach.queueLength / approach.roadCapacity, 1.0);
        const queueComponent = queueUtilization * 100 * exports.SCORING_CONSTANTS.QUEUE_FACTOR;
        // Step 4: Arrival rate component
        const arrivalComponent = approach.arrivalRate * 2;
        // Step 5: Bus bonus (priority to public transport)
        const busBonus = approach.hasBus ? exports.SCORING_CONSTANTS.BUS_BONUS : 0;
        // Base priority score
        let priorityScore = personFlow +
            waitingComponent +
            queueComponent +
            arrivalComponent +
            busBonus;
        // Step 6: Spillback detection and boost
        const spillbackDetected = detectSpillback(approach.queueLength, approach.roadCapacity);
        if (spillbackDetected) {
            priorityScore += exports.SCORING_CONSTANTS.SPILLBACK_BOOST;
        }
        // Step 7: Starvation prevention and boost
        const starvationDetected = detectStarvation(approach.lastGreenSeconds);
        if (starvationDetected) {
            priorityScore += exports.SCORING_CONSTANTS.STARVATION_BOOST;
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
// Used in the mathematical formula to resolve conflicts if two ambulances arrive at once
exports.PRIORITY_CLASS_MULTIPLIER = {
    CRITICAL: 3,
    HIGH: 2,
    NORMAL: 1,
};
//# sourceMappingURL=types.js.map