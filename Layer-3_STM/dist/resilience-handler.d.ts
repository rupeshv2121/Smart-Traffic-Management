import { Layer2Payload, HistoricalTimingPlan, ActuationCommand } from "./types/types";
export interface ConfidenceThresholds {
    criticalLowerBound: number;
    warningThreshold: number;
}
export interface ResilienceState {
    currentConfidenceScore: number;
    isFallbackActive: boolean;
    fallbackReason: string;
    lastValidLayer2Timestamp: string;
}
export interface ResilienceCommand {
    action: "USE_OPTIMIZED_PLAN" | "SWITCH_TO_HISTORICAL_FALLBACK" | "MAINTAIN_FALLBACK";
    confidenceScore: number;
    reason: string;
    historicalPlanOverride?: HistoricalTimingPlan[] | null;
}
/**
 * Member 4: Data & Resilience Layer
 *
 * Monitors the CV Confidence Score from Layer 2 (mock camera perception).
 * If confidence drops below 70%, this module HIJACKS the system and forces
 * historical database timings, bypassing the AI optimization layer entirely.
 *
 * This ensures that when perception becomes unreliable, the system gracefully
 * degrades to safe, predictable fallback behavior rather than making dangerous
 * decisions based on bad data.
 */
export declare class ResilienceHandler {
    private thresholds;
    private state;
    constructor(thresholds?: Partial<ConfidenceThresholds>);
    /**
     * Evaluates incoming Layer 2 perception data and decides whether
     * to trust the AI optimization or hijack to historical fallback.
     *
     * This is the primary entry point for the resilience layer.
     */
    evaluateConfidenceAndDecide(layer2Data: Layer2Payload, historicalPlans: HistoricalTimingPlan[]): ResilienceCommand;
    /**
     * Hijacks the actuation command and forces historical timings if fallback is active.
     * This is the enforcement point - it modifies the command before it reaches hardware.
     */
    hijackAndEnforceHistorical(proposedCommand: ActuationCommand, historicalPlans: HistoricalTimingPlan[]): ActuationCommand;
    /**
     * Gets the current resilience state for monitoring/logging purposes.
     */
    getState(): ResilienceState;
    /**
     * Manually trigger fallback (useful for testing or emergency scenarios).
     */
    forceFallback(reason: string): void;
    /**
     * Manually exit fallback (useful for testing or manual override).
     */
    exitFallback(reason: string): void;
    /**
     * Update thresholds dynamically (for runtime tuning).
     */
    updateThresholds(newThresholds: Partial<ConfidenceThresholds>): void;
}
//# sourceMappingURL=resilience-handler.d.ts.map