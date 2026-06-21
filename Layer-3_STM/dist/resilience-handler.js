"use strict";
// Member 4: Data & Resilience (Confidence Monitor & Fallback Hijack)
// resilience-handler.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResilienceHandler = void 0;
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
class ResilienceHandler {
    constructor(thresholds) {
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
    evaluateConfidenceAndDecide(layer2Data, historicalPlans) {
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
    hijackAndEnforceHistorical(proposedCommand, historicalPlans) {
        if (!this.state.isFallbackActive) {
            return proposedCommand;
        }
        // Find the matching historical plan for this phase
        const historicalPlan = historicalPlans.find(plan => plan.phaseId === proposedCommand.targetPhaseId);
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
    getState() {
        return { ...this.state };
    }
    /**
     * Manually trigger fallback (useful for testing or emergency scenarios).
     */
    forceFallback(reason) {
        this.state.isFallbackActive = true;
        this.state.fallbackReason = reason;
    }
    /**
     * Manually exit fallback (useful for testing or manual override).
     */
    exitFallback(reason) {
        this.state.isFallbackActive = false;
        this.state.fallbackReason = `Manually exited: ${reason}`;
    }
    /**
     * Update thresholds dynamically (for runtime tuning).
     */
    updateThresholds(newThresholds) {
        this.thresholds = {
            ...this.thresholds,
            ...newThresholds
        };
    }
}
exports.ResilienceHandler = ResilienceHandler;
//# sourceMappingURL=resilience-handler.js.map