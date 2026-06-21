"use strict";
// STM Orchestrator: Master Coordinator for Members 1-4
// Chains: Layer 2 Data → Member 1 (Optimization) → Member 2 (Emergency) →
//         Member 3 (Safety) → Member 4 (Resilience) → Hardware Actuation
Object.defineProperty(exports, "__esModule", { value: true });
exports.STMOrchestrator = void 0;
// This file acts as the central nervous system for your entire traffic management engine. It perfectly encapsulates the "Decide" and "Guard" flow we established, explicitly wiring together the work of your 4-to-5 team members into a single, cohesive 30-second execution loop.
const config_1 = require("./config");
const max_pressure_optimizer_1 = require("./max-pressure-optimizer");
const resilience_handler_1 = require("./resilience-handler");
const safety_supervisor_1 = require("./safety-supervisor");
const types_1 = require("./types/types");
const CYCLE_SECONDS = config_1.PIPELINE_CYCLE_SECONDS;
const ROAD_CAPACITY = 100;
/**
 * STM Orchestrator: Master Coordination Layer
 *
 * Flow:
 * 1. Receives Layer 2 perception data + optional Emergency token
 * 2. Calls Member 1 (Normal-Mode Architect) to generate optimization proposal
 * 3. Calls Member 2 (Emergency Pathfinder) if emergency exists
 * 4. Selects proposal (emergency overrides normal mode)
 * 5. Calls Member 3 (Invariant Guardian) to validate against safety interlocks
 * 6. Calls Member 4 (Data & Resilience) to enforce fallback if needed
 * 7. Returns final ActuationCommand to hardware
 */
class STMOrchestrator {
    constructor(config) {
        this.config = config;
        this.safetyValidator = new safety_supervisor_1.SafetySupervisor(config.safetyConfig);
        this.resilienceHandler = new resilience_handler_1.ResilienceHandler(config.resilienceThresholds);
        this.lastValidTimestamp = new Date().toISOString();
        // Initialize phase state for Member 2
        this.currentPhaseState = {
            currentPhaseId: "PHASE_NORTH_GREEN",
            phaseElapsedSeconds: 0,
            currentGreenDuration: 30,
            currentDensity: "medium",
        };
        this.lastGreenTracker = {
            NORTH: 0,
            SOUTH: 0,
            EAST: 0,
            WEST: 0,
        };
        this.emvCorridorActive = false;
    }
    /**
     * Main entry point: Evaluates all inputs and produces final actuation command.
     */
    orchestrateActuation(layer2Data, emergencyToken, historicalPlans) {
        const reasonChain = [];
        const commandId = `CMD-${Date.now()}`;
        // ===== STAGE 1: Data Staleness Check =====
        const dataAge = this.calculateDataAgeSeconds(layer2Data.timestamp);
        const maxAge = this.config.maxDataAgeSeconds ?? 10;
        if (dataAge > maxAge) {
            reasonChain.push(`STALE_DATA: Layer 2 data is ${dataAge}s old (threshold: ${maxAge}s)`);
            return this.produceFallbackCommand(commandId, layer2Data.junctionId, historicalPlans, "HISTORICAL_FALLBACK", reasonChain, 1.0);
        }
        // ===== STAGE 2: Resilience Check (Member 4 Entry Point) =====
        // This determines if we trust the AI optimization or force historical fallback
        const resilienceDecision = this.resilienceHandler.evaluateConfidenceAndDecide(layer2Data, historicalPlans);
        reasonChain.push(`Resilience Check: ${resilienceDecision.action}`);
        if (resilienceDecision.action === "SWITCH_TO_HISTORICAL_FALLBACK") {
            reasonChain.push(`Confidence too low: ${(resilienceDecision.confidenceScore * 100).toFixed(2)}%`);
            return this.produceFallbackCommand(commandId, layer2Data.junctionId, historicalPlans, "HISTORICAL_FALLBACK", reasonChain, resilienceDecision.confidenceScore);
        }
        if (resilienceDecision.action === "MAINTAIN_FALLBACK") {
            reasonChain.push(`Continuing fallback: Confidence still below threshold`);
            return this.produceFallbackCommand(commandId, layer2Data.junctionId, historicalPlans, "HISTORICAL_FALLBACK", reasonChain, resilienceDecision.confidenceScore);
        }
        // ===== STAGE 3: Optimization Decision =====
        this.tickLastGreenTracker();
        let selectedProposal = null;
        let executionPath = "NORMAL_MODE";
        if (emergencyToken) {
            if (!this.emvCorridorActive) {
                (0, max_pressure_optimizer_1.pauseOptimizer)(layer2Data.junctionId);
                this.emvCorridorActive = true;
            }
            reasonChain.push(`Emergency detected: ${emergencyToken.emvId}`);
            selectedProposal = this.generateEmergencyResponse(emergencyToken);
            executionPath = "EMERGENCY_MODE";
            this.currentPhaseState = {
                currentPhaseId: `PHASE_${emergencyToken.targetPhaseId}_GREEN`,
                phaseElapsedSeconds: 0,
                currentGreenDuration: selectedProposal.requiredGreenDuration,
                currentDensity: "high",
            };
            this.lastGreenTracker[emergencyToken.targetPhaseId] = 0;
            reasonChain.push(`Using EMERGENCY_MODE with phase ${emergencyToken.targetPhaseId} (conflict index: ${selectedProposal.conflictIndex})`);
        }
        else {
            if (this.emvCorridorActive) {
                (0, max_pressure_optimizer_1.resumeOptimizer)(layer2Data.junctionId);
                this.emvCorridorActive = false;
                reasonChain.push(`EMV corridor ended — resuming normal optimization`);
            }
            reasonChain.push(`Calling Member 2 (Max-Pressure Optimizer)`);
            const approachMetrics = this.convertLayer2ToApproachMetrics(layer2Data);
            const downstreamDensity = this.generateDownstreamDensity(layer2Data);
            const historicalGreen = this.getHistoricalGreenTime(historicalPlans);
            const optimizedPlan = (0, max_pressure_optimizer_1.runMaxPressureOptimizer)(layer2Data.junctionId, approachMetrics, downstreamDensity, this.currentPhaseState, resilienceDecision.confidenceScore, historicalGreen);
            reasonChain.push(`Member 1 scored approaches | Member 2 selected ${optimizedPlan.winningDirection}`);
            selectedProposal = this.convertProposedPlanToOptimization(optimizedPlan);
            // Update phase state for next cycle
            this.updatePhaseState(optimizedPlan);
        }
        // ===== STAGE 4: Safety Validation (Member 3 Entry Point) =====
        const currentDirection = this.extractDirectionFromPhaseId(this.currentPhaseState.currentPhaseId);
        const proposedDirection = "targetPhaseId" in selectedProposal
            ? selectedProposal.targetPhaseId
            : selectedProposal.approachId;
        const currentState = {
            phaseId: currentDirection,
            activeGreens: [currentDirection],
            pedestrianWalkActive: false,
        };
        const activeTimers = {
            currentPhaseDuration: this.currentPhaseState.phaseElapsedSeconds,
            pedestrianWalkDuration: 0,
        };
        const proposedState = {
            phaseId: proposedDirection,
            activeGreens: [proposedDirection],
        };
        const safetyResult = this.safetyValidator.validateProposedActuation(currentState, proposedState, activeTimers);
        reasonChain.push(`Safety Check: ${safetyResult.isSafe ? "PASSED" : "FAILED"} - ${safetyResult.command.action}`);
        if (!safetyResult.isSafe) {
            if (safetyResult.command.action === "FORCE_FALLBACK") {
                reasonChain.push(`Safety override: Forcing fallback - ${safetyResult.command.reason}`);
                return this.produceFallbackCommand(commandId, layer2Data.junctionId, historicalPlans, "SAFE_DEFAULT", reasonChain, resilienceDecision.confidenceScore);
            }
        }
        // ===== STAGE 5: Build Final Actuation Command =====
        const targetPhase = "targetPhaseId" in selectedProposal
            ? selectedProposal.targetPhaseId
            : selectedProposal.approachId;
        const proposedDuration = "requiredGreenDuration" in selectedProposal
            ? selectedProposal.requiredGreenDuration
            : selectedProposal.proposedGreenTime;
        const finalCommand = {
            junctionId: layer2Data.junctionId,
            commandId,
            targetPhaseId: targetPhase,
            durationSeconds: proposedDuration,
            clearanceIntervals: {
                yellowSeconds: safetyResult.command.yellowSeconds || config_1.MIN_YELLOW_SECONDS,
                allRedSeconds: safetyResult.command.allRedSeconds || 2,
            },
            executionMode: executionPath === "EMERGENCY_MODE"
                ? "GREEN_CORRIDOR"
                : "NORMAL_MAX_PRESSURE",
        };
        // ===== STAGE 6: Resilience Enforcement (Member 4 Final Check) =====
        const enforcedCommand = this.resilienceHandler.hijackAndEnforceHistorical(finalCommand, historicalPlans);
        if (enforcedCommand.executionMode === "HISTORICAL_FALLBACK") {
            reasonChain.push(`Resilience enforcement: Overridden to historical timing`);
        }
        return {
            finalCommand: enforcedCommand,
            executionPath,
            safetyValidationPassed: safetyResult.isSafe,
            confidenceScore: resilienceDecision.confidenceScore,
            reasonChain,
        };
    }
    /**
     * Produces a fallback command using historical data
     */
    produceFallbackCommand(commandId, junctionId, historicalPlans, mode, reasonChain, confidenceScore) {
        // Use first available phase from historical data
        const fallbackPhase = historicalPlans[0] || {
            phaseId: "NORTH",
            recommendedGreenTime: 45,
            historicalDemand: 60,
        };
        const command = {
            junctionId,
            commandId,
            targetPhaseId: fallbackPhase.phaseId,
            durationSeconds: fallbackPhase.recommendedGreenTime,
            clearanceIntervals: {
                yellowSeconds: config_1.MIN_YELLOW_SECONDS,
                allRedSeconds: 2,
            },
            executionMode: mode === "SAFE_DEFAULT" ? "SAFE_DEFAULT" : "HISTORICAL_FALLBACK",
        };
        return {
            finalCommand: command,
            executionPath: "FALLBACK_MODE",
            safetyValidationPassed: true,
            confidenceScore,
            reasonChain,
        };
    }
    convertLayer2ToApproachMetrics(layer2Data) {
        return layer2Data.approaches.map((approach) => {
            const totalVehicles = approach.detections.reduce((sum, d) => sum + d.count, 0);
            const queueLength = Math.min(Math.round((approach.spatialOccupancyPct / 100) * ROAD_CAPACITY) ||
                totalVehicles, ROAD_CAPACITY);
            return {
                direction: approach.approachId,
                detections: approach.detections,
                avgWaitingTime: approach.waitingTimeSeconds,
                arrivalRate: approach.arrivalRatePerMin,
                queueLength,
                roadCapacity: ROAD_CAPACITY,
                hasBus: approach.detections.some((d) => d.type === "Bus" && d.count > 0),
                hasEmergencyVehicle: approach.detections.some((d) => d.type === "Ambulance" && d.count > 0),
                lastGreenSeconds: this.lastGreenTracker[approach.approachId] ?? 0,
            };
        });
    }
    generateDownstreamDensity(layer2Data) {
        return layer2Data.approaches.map((approach) => ({
            direction: approach.approachId,
            occupancyPct: approach.spatialOccupancyPct,
        }));
    }
    getHistoricalGreenTime(historicalPlans) {
        if (historicalPlans.length === 0)
            return 30;
        const total = historicalPlans.reduce((sum, plan) => sum + plan.recommendedGreenTime, 0);
        return Math.round(total / historicalPlans.length);
    }
    convertProposedPlanToOptimization(plan) {
        const direction = (["NORTH", "SOUTH", "EAST", "WEST"].includes(plan.winningDirection)
            ? plan.winningDirection
            : (this.config.defaultPhaseIfNoProposal ?? "NORTH"));
        return {
            approachId: direction,
            priorityScore: plan.priorityScores[direction] ?? 0,
            proposedGreenTime: plan.greenDuration,
            method: "MAX_PRESSURE",
            timestamp: plan.timestamp,
        };
    }
    updatePhaseState(plan) {
        if (plan.dataSource !== "LIVE")
            return;
        this.lastGreenTracker[plan.winningDirection] = 0;
        const samePhase = this.currentPhaseState.currentPhaseId === plan.targetPhaseId;
        const density = plan.greenDuration >= 60
            ? "high"
            : plan.greenDuration >= 35
                ? "medium"
                : "low";
        this.currentPhaseState = {
            currentPhaseId: plan.targetPhaseId,
            phaseElapsedSeconds: samePhase
                ? this.currentPhaseState.phaseElapsedSeconds + CYCLE_SECONDS
                : 0,
            currentGreenDuration: plan.greenDuration,
            currentDensity: density,
        };
    }
    tickLastGreenTracker() {
        for (const dir of Object.keys(this.lastGreenTracker)) {
            this.lastGreenTracker[dir] = (this.lastGreenTracker[dir] ?? 0) + CYCLE_SECONDS;
        }
    }
    extractDirectionFromPhaseId(phaseId) {
        const match = phaseId.match(/PHASE_(NORTH|SOUTH|EAST|WEST)_GREEN/);
        if (match?.[1])
            return match[1];
        if (["NORTH", "SOUTH", "EAST", "WEST"].includes(phaseId))
            return phaseId;
        return this.config.defaultPhaseIfNoProposal ?? "NORTH";
    }
    generateEmergencyResponse(emergency) {
        const priorityMultiplier = types_1.PRIORITY_CLASS_MULTIPLIER[emergency.priorityClass];
        const conflictIndex = priorityMultiplier * 100 - emergency.etaSeconds;
        const phaseId = emergency.targetPhaseId;
        const requiredGreenDuration = Math.min(90, Math.max(30, emergency.etaSeconds + 25));
        return {
            emvId: emergency.emvId,
            targetPhaseId: phaseId,
            conflictIndex,
            requiredGreenDuration,
            executionUrgency: emergency.priorityClass,
            timestamp: new Date().toISOString(),
        };
    }
    /**
     * Calculate age of perception data in seconds
     */
    calculateDataAgeSeconds(timestamp) {
        const dataTime = new Date(timestamp).getTime();
        const now = new Date().getTime();
        return (now - dataTime) / 1000;
    }
    /**
     * Get orchestrator state for monitoring
     */
    getOrchestrationState() {
        return {
            resilience: this.resilienceHandler.getState(),
            lastValidTimestamp: this.lastValidTimestamp,
        };
    }
}
exports.STMOrchestrator = STMOrchestrator;
//# sourceMappingURL=stm-orchestrator.js.map