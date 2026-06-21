// STM Orchestrator: Master Coordinator for Members 1-4
// Chains: Layer 2 Data → Member 1 (Optimization) → Member 2 (Emergency) →
//         Member 3 (Safety) → Member 4 (Resilience) → Hardware Actuation

// This file acts as the central nervous system for your entire traffic management engine. It perfectly encapsulates the "Decide" and "Guard" flow we established, explicitly wiring together the work of your 4-to-5 team members into a single, cohesive 30-second execution loop.

import {
  MIN_YELLOW_SECONDS,
  PIPELINE_CYCLE_SECONDS,
} from "./config";
import {
  DownstreamDensity,
  MaxPressureOptimizer,
  PhaseState,
  ProposedPlan,
} from "./max-pressure-optimizer";
import { ConfidenceThresholds, ResilienceHandler } from "./resilience-handler";
import { SafetyConfig, SafetySupervisor } from "./safety-supervisor";
import {
  ActuationCommand,
  ApproachMetrics,
  EmergencyResponse,
  EmergencyToken,
  HistoricalTimingPlan,
  Layer2Payload,
  OptimizationProposal,
  PRIORITY_CLASS_MULTIPLIER,
} from "./types/types";

const CYCLE_SECONDS = PIPELINE_CYCLE_SECONDS;
const ROAD_CAPACITY = 100;

export interface OrchestratorConfig {
  safetyConfig: SafetyConfig;
  resilienceThresholds?: ConfidenceThresholds;
  maxDataAgeSeconds?: number; // How old Layer 2 data can be before forcing fallback
  defaultPhaseIfNoProposal?: string;
}

export interface OrchestratorResult {
  finalCommand: ActuationCommand;
  executionPath: string; // Debug info: "NORMAL_MODE" | "EMERGENCY_MODE" | "FALLBACK_MODE"
  safetyValidationPassed: boolean;
  confidenceScore: number;
  reasonChain: string[]; // Audit trail of decisions
}

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
export class STMOrchestrator {
  private safetyValidator: SafetySupervisor;
  private resilienceHandler: ResilienceHandler;
  private optimizer: MaxPressureOptimizer;
  private config: OrchestratorConfig;
  private lastValidTimestamp: string;
  private currentPhaseState: PhaseState;
  private lastGreenTracker: Record<string, number>;
  private emvCorridorActive: boolean;

  constructor(config: OrchestratorConfig) {
    this.config = config;
    this.safetyValidator = new SafetySupervisor(config.safetyConfig);
    this.resilienceHandler = new ResilienceHandler(config.resilienceThresholds);
    this.optimizer = new MaxPressureOptimizer();
    this.lastValidTimestamp = new Date().toISOString();
    // Initialize phase state for Member 2.
    // Assume the junction was already running NORTH for a full cycle before the
    // controller booted, so the first optimisation can transition cleanly
    // without tripping the minimum-green interlock.
    this.currentPhaseState = {
      currentPhaseId: "PHASE_NORTH_GREEN",
      phaseElapsedSeconds: CYCLE_SECONDS,
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
  public orchestrateActuation(
    layer2Data: Layer2Payload,
    emergencyToken: EmergencyToken | null,
    historicalPlans: HistoricalTimingPlan[],
  ): OrchestratorResult {
    const reasonChain: string[] = [];
    const commandId = `CMD-${Date.now()}`;

    // ===== STAGE 0: EMV Corridor Reconciliation =====
    // Tear the corridor down up-front whenever there is no emergency this cycle,
    // so it is always cleaned up — even when the pipeline later short-circuits
    // to a fallback (stale data / low confidence) before reaching the optimiser.
    // Without this, a corridor opened in a prior cycle would stay "active"
    // indefinitely across fallback cycles.
    if (!emergencyToken && this.emvCorridorActive) {
      this.optimizer.resume(layer2Data.junctionId);
      this.emvCorridorActive = false;
      reasonChain.push(`EMV corridor ended — resuming normal optimization`);
    }

    // ===== STAGE 1: Data Staleness Check =====
    const dataAge = this.calculateDataAgeSeconds(layer2Data.timestamp);
    const maxAge = this.config.maxDataAgeSeconds ?? 10;

    if (dataAge > maxAge) {
      reasonChain.push(
        `STALE_DATA: Layer 2 data is ${dataAge}s old (threshold: ${maxAge}s)`,
      );
      return this.produceFallbackCommand(
        commandId,
        layer2Data.junctionId,
        historicalPlans,
        "HISTORICAL_FALLBACK",
        reasonChain,
        1.0,
      );
    }

    // ===== STAGE 2: Resilience Check (Member 4 Entry Point) =====
    // This determines if we trust the AI optimization or force historical fallback
    const resilienceDecision =
      this.resilienceHandler.evaluateConfidenceAndDecide(
        layer2Data,
        historicalPlans,
      );
    reasonChain.push(`Resilience Check: ${resilienceDecision.action}`);

    if (resilienceDecision.action === "SWITCH_TO_HISTORICAL_FALLBACK") {
      reasonChain.push(
        `Confidence too low: ${(
          resilienceDecision.confidenceScore * 100
        ).toFixed(2)}%`,
      );
      return this.produceFallbackCommand(
        commandId,
        layer2Data.junctionId,
        historicalPlans,
        "HISTORICAL_FALLBACK",
        reasonChain,
        resilienceDecision.confidenceScore,
      );
    }

    if (resilienceDecision.action === "MAINTAIN_FALLBACK") {
      reasonChain.push(`Continuing fallback: Confidence still below threshold`);
      return this.produceFallbackCommand(
        commandId,
        layer2Data.junctionId,
        historicalPlans,
        "HISTORICAL_FALLBACK",
        reasonChain,
        resilienceDecision.confidenceScore,
      );
    }

    // ===== STAGE 3: Optimization Decision =====
    this.tickLastGreenTracker();

    let selectedProposal: OptimizationProposal | EmergencyResponse | null =
      null;
    let executionPath = "NORMAL_MODE";
    // Holds the live optimiser plan so the phase-state mutation can be deferred
    // until AFTER Member 3 approves the transition (see Stage 4).
    let pendingPlan: ProposedPlan | null = null;

    if (emergencyToken) {
      if (!this.emvCorridorActive) {
        this.optimizer.pause(layer2Data.junctionId);
        this.emvCorridorActive = true;
      }
      reasonChain.push(`Emergency detected: ${emergencyToken.emvId}`);
      selectedProposal = this.generateEmergencyResponse(emergencyToken);
      executionPath = "EMERGENCY_MODE";
      reasonChain.push(
        `Using EMERGENCY_MODE with phase ${emergencyToken.targetPhaseId} (conflict index: ${selectedProposal.conflictIndex})`,
      );
    } else {
      // EMV corridor teardown is handled up-front in Stage 0, so by here the
      // corridor is already inactive on a non-emergency cycle.
      reasonChain.push(`Calling Member 2 (Max-Pressure Optimizer)`);

      const approachMetrics = this.convertLayer2ToApproachMetrics(layer2Data);
      const downstreamDensity = this.generateDownstreamDensity(layer2Data);
      const historicalGreen = this.getHistoricalGreenTime(historicalPlans);

      const optimizedPlan = this.optimizer.run(
        layer2Data.junctionId,
        approachMetrics,
        downstreamDensity,
        this.currentPhaseState,
        resilienceDecision.confidenceScore,
        historicalGreen,
      );

      reasonChain.push(
        `Member 1 scored approaches | Member 2 selected ${optimizedPlan.winningDirection}`,
      );
      selectedProposal = this.convertProposedPlanToOptimization(optimizedPlan);

      // Defer the phase-state update until Member 3 (safety) approves it.
      pendingPlan = optimizedPlan;
    }

    // ===== STAGE 4: Safety Validation (Member 3 Entry Point) =====
    const currentDirection = this.extractDirectionFromPhaseId(
      this.currentPhaseState.currentPhaseId,
    );
    const proposedDirection =
      "targetPhaseId" in selectedProposal
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

    const safetyResult = this.safetyValidator.validateProposedActuation(
      currentState,
      proposedState,
      activeTimers,
      { emergencyOverride: executionPath === "EMERGENCY_MODE" },
    );

    reasonChain.push(
      `Safety Check: ${safetyResult.isSafe ? "PASSED" : "FAILED"} - ${
        safetyResult.command.action
      }`,
    );

    if (!safetyResult.isSafe) {
      // Hard interlock violation (e.g. conflicting greens) → safe default.
      if (safetyResult.command.action === "FORCE_FALLBACK") {
        reasonChain.push(
          `Safety override: Forcing fallback - ${safetyResult.command.reason}`,
        );
        return this.produceFallbackCommand(
          commandId,
          layer2Data.junctionId,
          historicalPlans,
          "SAFE_DEFAULT",
          reasonChain,
          resilienceDecision.confidenceScore,
        );
      }

      // Soft interlock (min-green not met / pedestrian walk active) → the
      // supervisor refuses the transition and orders us to HOLD the current
      // phase. Previously this verdict was dropped and the premature switch
      // executed anyway; now we honour it.
      if (safetyResult.command.action === "MAINTAIN_CURRENT_STATE") {
        reasonChain.push(
          `Safety hold: keeping ${currentDirection} green - ${safetyResult.command.reason}`,
        );
        return this.produceHoldCommand(
          commandId,
          layer2Data.junctionId,
          currentDirection,
          executionPath,
          resilienceDecision.confidenceScore,
          reasonChain,
        );
      }
    }

    // Safety approved the plan — NOW commit the deferred phase-state transition.
    if (executionPath === "EMERGENCY_MODE" && emergencyToken) {
      this.currentPhaseState = {
        currentPhaseId: `PHASE_${emergencyToken.targetPhaseId}_GREEN`,
        phaseElapsedSeconds: 0,
        currentGreenDuration: (selectedProposal as EmergencyResponse)
          .requiredGreenDuration,
        currentDensity: "high",
      };
      this.lastGreenTracker[emergencyToken.targetPhaseId] = 0;
    } else if (pendingPlan) {
      this.updatePhaseState(pendingPlan);
    }

    // ===== STAGE 5: Build Final Actuation Command =====
    const targetPhase =
      "targetPhaseId" in selectedProposal
        ? selectedProposal.targetPhaseId
        : selectedProposal.approachId;

    const proposedDuration =
      "requiredGreenDuration" in selectedProposal
        ? selectedProposal.requiredGreenDuration
        : selectedProposal.proposedGreenTime;

    const finalCommand: ActuationCommand = {
      junctionId: layer2Data.junctionId,
      commandId,
      targetPhaseId: targetPhase,
      durationSeconds: proposedDuration,
      clearanceIntervals: {
        yellowSeconds: safetyResult.command.yellowSeconds || MIN_YELLOW_SECONDS,
        allRedSeconds: safetyResult.command.allRedSeconds || 2,
      },
      executionMode:
        executionPath === "EMERGENCY_MODE"
          ? "GREEN_CORRIDOR"
          : "NORMAL_MAX_PRESSURE",
    };

    // ===== STAGE 6: Resilience Enforcement (Member 4 Final Check) =====
    const enforcedCommand = this.resilienceHandler.hijackAndEnforceHistorical(
      finalCommand,
      historicalPlans,
    );

    if (enforcedCommand.executionMode === "HISTORICAL_FALLBACK") {
      reasonChain.push(
        `Resilience enforcement: Overridden to historical timing`,
      );
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
  private produceFallbackCommand(
    commandId: string,
    junctionId: string,
    historicalPlans: HistoricalTimingPlan[],
    mode: "HISTORICAL_FALLBACK" | "SAFE_DEFAULT",
    reasonChain: string[],
    confidenceScore: number,
  ): OrchestratorResult {
    // Use first available phase from historical data
    const fallbackPhase = historicalPlans[0] || {
      phaseId: "NORTH",
      recommendedGreenTime: 45,
      historicalDemand: 60,
    };
    const command: ActuationCommand = {
      junctionId,
      commandId,
      targetPhaseId: fallbackPhase.phaseId,
      durationSeconds: fallbackPhase.recommendedGreenTime,
      clearanceIntervals: {
        yellowSeconds: MIN_YELLOW_SECONDS,
        allRedSeconds: 2,
      },
      executionMode:
        mode === "SAFE_DEFAULT" ? "SAFE_DEFAULT" : "HISTORICAL_FALLBACK",
    };

    return {
      finalCommand: command,
      executionPath: "FALLBACK_MODE",
      safetyValidationPassed: true,
      confidenceScore,
      reasonChain,
    };
  }

  /**
   * Holds the current phase green when Member 3 refuses a transition
   * (minimum-green not yet satisfied, or a pedestrian walk is active).
   * This is the enforced-safe outcome of a soft interlock.
   */
  private produceHoldCommand(
    commandId: string,
    junctionId: string,
    holdDirection: string,
    executionPath: string,
    confidenceScore: number,
    reasonChain: string[],
  ): OrchestratorResult {
    // The current phase continues, so advance its elapsed-green timer.
    this.currentPhaseState = {
      ...this.currentPhaseState,
      phaseElapsedSeconds:
        this.currentPhaseState.phaseElapsedSeconds + CYCLE_SECONDS,
    };

    const heldDuration = Math.max(
      this.currentPhaseState.currentGreenDuration,
      this.config.safetyConfig.minGreenEnforced,
    );

    const command: ActuationCommand = {
      junctionId,
      commandId,
      targetPhaseId: holdDirection,
      durationSeconds: heldDuration,
      clearanceIntervals: {
        yellowSeconds: MIN_YELLOW_SECONDS,
        allRedSeconds: 2,
      },
      executionMode: "NORMAL_MAX_PRESSURE",
    };

    return {
      finalCommand: command,
      executionPath,
      safetyValidationPassed: true,
      confidenceScore,
      reasonChain,
    };
  }

  private convertLayer2ToApproachMetrics(
    layer2Data: Layer2Payload,
  ): ApproachMetrics[] {
    return layer2Data.approaches.map((approach) => {
      const totalVehicles = approach.detections.reduce(
        (sum, d) => sum + d.count,
        0,
      );
      const queueLength = Math.min(
        Math.round((approach.spatialOccupancyPct / 100) * ROAD_CAPACITY) ||
          totalVehicles,
        ROAD_CAPACITY,
      );

      return {
        direction: approach.approachId,
        detections: approach.detections,
        avgWaitingTime: approach.waitingTimeSeconds,
        arrivalRate: approach.arrivalRatePerMin,
        queueLength,
        roadCapacity: ROAD_CAPACITY,
        hasBus: approach.detections.some((d) => d.type === "Bus" && d.count > 0),
        hasEmergencyVehicle: approach.detections.some(
          (d) => d.type === "Ambulance" && d.count > 0,
        ),
        lastGreenSeconds: this.lastGreenTracker[approach.approachId] ?? 0,
      };
    });
  }

  private generateDownstreamDensity(
    layer2Data: Layer2Payload,
  ): DownstreamDensity[] {
    return layer2Data.approaches.map((approach) => ({
      direction: approach.approachId,
      occupancyPct: approach.spatialOccupancyPct,
    }));
  }

  private getHistoricalGreenTime(
    historicalPlans: HistoricalTimingPlan[],
  ): number {
    if (historicalPlans.length === 0) return 30;
    const total = historicalPlans.reduce(
      (sum, plan) => sum + plan.recommendedGreenTime,
      0,
    );
    return Math.round(total / historicalPlans.length);
  }

  private convertProposedPlanToOptimization(
    plan: ProposedPlan,
  ): OptimizationProposal {
    const direction = (
      ["NORTH", "SOUTH", "EAST", "WEST"].includes(plan.winningDirection)
        ? plan.winningDirection
        : (this.config.defaultPhaseIfNoProposal ?? "NORTH")
    ) as "NORTH" | "SOUTH" | "EAST" | "WEST";

    return {
      approachId: direction,
      priorityScore: plan.priorityScores[direction] ?? 0,
      proposedGreenTime: plan.greenDuration,
      method: "MAX_PRESSURE",
      timestamp: plan.timestamp,
    };
  }

  private updatePhaseState(plan: ProposedPlan): void {
    if (plan.dataSource !== "LIVE") return;

    this.lastGreenTracker[plan.winningDirection] = 0;

    const samePhase =
      this.currentPhaseState.currentPhaseId === plan.targetPhaseId;
    const density: PhaseState["currentDensity"] =
      plan.greenDuration >= 60
        ? "high"
        : plan.greenDuration >= 35
          ? "medium"
          : "low";

    this.currentPhaseState = {
      currentPhaseId: plan.targetPhaseId,
      // On a fresh transition the new phase will already have been green for one
      // cycle by the next decision, so seed it with CYCLE_SECONDS rather than 0
      // (otherwise the minimum-green interlock would spuriously fire next cycle).
      phaseElapsedSeconds: samePhase
        ? this.currentPhaseState.phaseElapsedSeconds + CYCLE_SECONDS
        : CYCLE_SECONDS,
      currentGreenDuration: plan.greenDuration,
      currentDensity: density,
    };
  }

  private tickLastGreenTracker(): void {
    for (const dir of Object.keys(this.lastGreenTracker)) {
      this.lastGreenTracker[dir] = (this.lastGreenTracker[dir] ?? 0) + CYCLE_SECONDS;
    }
  }

  private extractDirectionFromPhaseId(phaseId: string): string {
    const match = phaseId.match(/PHASE_(NORTH|SOUTH|EAST|WEST)_GREEN/);
    if (match?.[1]) return match[1];
    if (["NORTH", "SOUTH", "EAST", "WEST"].includes(phaseId)) return phaseId;
    return this.config.defaultPhaseIfNoProposal ?? "NORTH";
  }

  private generateEmergencyResponse(
    emergency: EmergencyToken,
  ): EmergencyResponse {
    const priorityMultiplier = PRIORITY_CLASS_MULTIPLIER[emergency.priorityClass];
    const conflictIndex = priorityMultiplier * 100 - emergency.etaSeconds;
    const phaseId = emergency.targetPhaseId as
      | "NORTH"
      | "SOUTH"
      | "EAST"
      | "WEST";
    const requiredGreenDuration = Math.min(
      90,
      Math.max(30, emergency.etaSeconds + 25),
    );

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
  private calculateDataAgeSeconds(timestamp: string): number {
    const dataTime = new Date(timestamp).getTime();
    const now = new Date().getTime();
    return (now - dataTime) / 1000;
  }

  /**
   * Get orchestrator state for monitoring
   */
  public getOrchestrationState() {
    return {
      resilience: this.resilienceHandler.getState(),
      emvCorridorActive: this.emvCorridorActive,
      lastValidTimestamp: this.lastValidTimestamp,
    };
  }
}
