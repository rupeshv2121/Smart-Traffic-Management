import { ConfidenceThresholds } from "./resilience-handler";
import { SafetyConfig } from "./safety-supervisor";
import { ActuationCommand, EmergencyToken, HistoricalTimingPlan, Layer2Payload } from "./types/types";
export interface OrchestratorConfig {
    safetyConfig: SafetyConfig;
    resilienceThresholds?: ConfidenceThresholds;
    maxDataAgeSeconds?: number;
    defaultPhaseIfNoProposal?: string;
}
export interface OrchestratorResult {
    finalCommand: ActuationCommand;
    executionPath: string;
    safetyValidationPassed: boolean;
    confidenceScore: number;
    reasonChain: string[];
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
export declare class STMOrchestrator {
    private safetyValidator;
    private resilienceHandler;
    private config;
    private lastValidTimestamp;
    private currentPhaseState;
    private lastGreenTracker;
    private emvCorridorActive;
    constructor(config: OrchestratorConfig);
    /**
     * Main entry point: Evaluates all inputs and produces final actuation command.
     */
    orchestrateActuation(layer2Data: Layer2Payload, emergencyToken: EmergencyToken | null, historicalPlans: HistoricalTimingPlan[]): OrchestratorResult;
    /**
     * Produces a fallback command using historical data
     */
    private produceFallbackCommand;
    private convertLayer2ToApproachMetrics;
    private generateDownstreamDensity;
    private getHistoricalGreenTime;
    private convertProposedPlanToOptimization;
    private updatePhaseState;
    private tickLastGreenTracker;
    private extractDirectionFromPhaseId;
    private generateEmergencyResponse;
    /**
     * Calculate age of perception data in seconds
     */
    private calculateDataAgeSeconds;
    /**
     * Get orchestrator state for monitoring
     */
    getOrchestrationState(): {
        resilience: import("./resilience-handler").ResilienceState;
        lastValidTimestamp: string;
    };
}
//# sourceMappingURL=stm-orchestrator.d.ts.map