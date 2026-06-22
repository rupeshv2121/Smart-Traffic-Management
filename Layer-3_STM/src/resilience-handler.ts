// Member 4: Data & Resilience (Confidence Monitor & Fallback Hijack)
// resilience-handler.ts

import { 
    Layer2Payload, 
    HistoricalTimingPlan, 
    ActuationCommand 
} from "./types/types";

export interface ConfidenceThresholds {
    criticalLowerBound: number; // Default: 0.70 (70%)
    warningThreshold: number;   // Default: 0.80 (80%)
}

// ─── Resilience ladder (Ideation §5 / Architecture §6) ───────────────────────
// Four degradation rungs the system steps through rather than failing outright:
//   STATE 0  FULL_ADAPTIVE      live CV → max-pressure → coordinated over the bus
//   STATE 1  DEGRADED_SENSING   CV confidence low → historical timing fallback
//   STATE 2  LOCALLY_AUTONOMOUS broker/heartbeat lost → edge runs on its own
//   STATE 3  TOTAL_FAILSAFE     edge compute/hardware fault → fixed-time default
export type LadderState =
    | "FULL_ADAPTIVE"
    | "DEGRADED_SENSING"
    | "LOCALLY_AUTONOMOUS"
    | "TOTAL_FAILSAFE";

export interface LinkSnapshot {
    brokerConnected: boolean;
    heartbeatAgeMs: number;
    heartbeatStale: boolean;
    edgeComputeOk: boolean;
}

/**
 * Tracks the two non-perception failure axes the resilience ladder reacts to:
 * loss of cross-junction COORDINATION (broker down / heartbeat silence) and loss
 * of local EDGE compute. Perception loss (CV confidence) is handled separately by
 * the confidence gate. Defaults are healthy, so the ladder sits at STATE 0 until
 * something is actually wrong (or a chaos toggle forces a rung).
 */
export class LinkMonitor {
    private lastHeartbeatAt: number;
    private brokerConnected = true;
    private edgeComputeOk = true;

    constructor(
        private readonly heartbeatTimeoutMs = 30_000,
        private readonly now: () => number = () => Date.now(),
    ) {
        this.lastHeartbeatAt = now();
    }

    /** Edge proves liveness each cycle; 30s of silence trips local-autonomous. */
    public heartbeat(): void {
        this.lastHeartbeatAt = this.now();
    }

    public setBrokerConnected(connected: boolean): void {
        this.brokerConnected = connected;
    }

    /** Flag/clear an edge compute or hardware-validation fault (→ TOTAL_FAILSAFE). */
    public setEdgeFault(faulted: boolean): void {
        this.edgeComputeOk = !faulted;
    }

    public snapshot(): LinkSnapshot {
        const heartbeatAgeMs = this.now() - this.lastHeartbeatAt;
        return {
            brokerConnected: this.brokerConnected,
            heartbeatAgeMs,
            heartbeatStale: heartbeatAgeMs > this.heartbeatTimeoutMs,
            edgeComputeOk: this.edgeComputeOk,
        };
    }
}

/**
 * Combine the perception (CV confidence) and link (broker/heartbeat/edge) axes
 * into a single ladder rung. Most-severe wins: a total fault outranks a lost
 * broker, which outranks degraded sensing.
 */
export function computeLadderState(
    cvConfidence: number,
    criticalConfidence: number,
    link: LinkSnapshot,
): LadderState {
    if (!link.edgeComputeOk) return "TOTAL_FAILSAFE";
    if (!link.brokerConnected || link.heartbeatStale) return "LOCALLY_AUTONOMOUS";
    if (cvConfidence < criticalConfidence) return "DEGRADED_SENSING";
    return "FULL_ADAPTIVE";
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
export class ResilienceHandler {
    private thresholds: ConfidenceThresholds;
    private state: ResilienceState;

    constructor(thresholds?: Partial<ConfidenceThresholds>) {
        this.thresholds = {
            criticalLowerBound: thresholds?.criticalLowerBound ?? 0.70,
            warningThreshold: thresholds?.warningThreshold ?? 0.80,
        };

        this.state = {
            currentConfidenceScore: 1.0,
            isFallbackActive: false,
            fallbackReason: "",
            lastValidLayer2Timestamp: new Date().toISOString(),
        };
    }

    /**
     * Evaluates incoming Layer 2 perception data and decides whether
     * to trust the AI optimization or hijack to historical fallback.
     * 
     * This is the primary entry point for the resilience layer.
     */
    public evaluateConfidenceAndDecide(
        layer2Data: Layer2Payload,
        historicalPlans: HistoricalTimingPlan[]
    ): ResilienceCommand {
        const confidenceScore = layer2Data.cvConfidenceScore;
        this.state.currentConfidenceScore = confidenceScore;
        this.state.lastValidLayer2Timestamp = layer2Data.timestamp;

        // CRITICAL: Confidence has dropped below 70% threshold
        if (confidenceScore < this.thresholds.criticalLowerBound) {
            this.state.isFallbackActive = true;
            this.state.fallbackReason = `CONFIDENCE_CRITICAL: Score ${(confidenceScore * 100).toFixed(2)}% < ${(this.thresholds.criticalLowerBound * 100).toFixed(0)}% threshold`;

            return {
                action: "SWITCH_TO_HISTORICAL_FALLBACK",
                confidenceScore,
                reason: this.state.fallbackReason,
                historicalPlanOverride: historicalPlans
            };
        }

        // WARNING: Confidence in warning zone but still operational
        if (confidenceScore < this.thresholds.warningThreshold) {
            if (!this.state.isFallbackActive) {
                return {
                    action: "USE_OPTIMIZED_PLAN",
                    confidenceScore,
                    reason: `CONFIDENCE_WARNING: Score ${(confidenceScore * 100).toFixed(2)}% between warning threshold. Monitoring closely.`
                };
            }
        }

        // RECOVERY: If we were in fallback and confidence recovered above critical threshold
        if (this.state.isFallbackActive && confidenceScore >= this.thresholds.criticalLowerBound) {
            this.state.isFallbackActive = false;
            this.state.fallbackReason = "";

            return {
                action: "USE_OPTIMIZED_PLAN",
                confidenceScore,
                reason: `CONFIDENCE_RECOVERED: Score ${(confidenceScore * 100).toFixed(2)}% >= ${(this.thresholds.criticalLowerBound * 100).toFixed(0)}%. Exiting fallback.`
            };
        }

        // MAINTAIN: We're still in fallback mode, keep using historical timings
        if (this.state.isFallbackActive) {
            return {
                action: "MAINTAIN_FALLBACK",
                confidenceScore,
                reason: `FALLBACK_ACTIVE: Maintaining historical fallback until confidence recovers above ${(this.thresholds.criticalLowerBound * 100).toFixed(0)}%.`,
                historicalPlanOverride: historicalPlans
            };
        }

        // NOMINAL: All checks passed, confidence is healthy
        return {
            action: "USE_OPTIMIZED_PLAN",
            confidenceScore,
            reason: `CONFIDENCE_NOMINAL: Score ${(confidenceScore * 100).toFixed(2)}% is healthy. Using AI-optimized plan.`
        };
    }

    /**
     * Hijacks the actuation command and forces historical timings if fallback is active.
     * This is the enforcement point - it modifies the command before it reaches hardware.
     */
    public hijackAndEnforceHistorical(
        proposedCommand: ActuationCommand,
        historicalPlans: HistoricalTimingPlan[]
    ): ActuationCommand {
        if (!this.state.isFallbackActive) {
            return proposedCommand;
        }

        // Find the matching historical plan for this phase
        const historicalPlan = historicalPlans.find(
            plan => plan.phaseId === proposedCommand.targetPhaseId
        );

        if (!historicalPlan) {
            // If no historical data exists for this phase, keep the proposed command
            // but change execution mode to HISTORICAL_FALLBACK
            return {
                ...proposedCommand,
                executionMode: "HISTORICAL_FALLBACK"
            };
        }

        // HIJACK: Override the proposed duration with historical timing
        return {
            ...proposedCommand,
            durationSeconds: historicalPlan.recommendedGreenTime,
            executionMode: "HISTORICAL_FALLBACK"
        };
    }

    /**
     * Gets the current resilience state for monitoring/logging purposes.
     */
    public getState(): ResilienceState {
        return { ...this.state };
    }

    /**
     * Manually trigger fallback (useful for testing or emergency scenarios).
     */
    public forceFallback(reason: string): void {
        this.state.isFallbackActive = true;
        this.state.fallbackReason = reason;
    }

    /**
     * Manually exit fallback (useful for testing or manual override).
     */
    public exitFallback(reason: string): void {
        this.state.isFallbackActive = false;
        this.state.fallbackReason = `Manually exited: ${reason}`;
    }

    /**
     * Update thresholds dynamically (for runtime tuning).
     */
    public updateThresholds(newThresholds: Partial<ConfidenceThresholds>): void {
        this.thresholds = {
            ...this.thresholds,
            ...newThresholds
        };
    }
}
