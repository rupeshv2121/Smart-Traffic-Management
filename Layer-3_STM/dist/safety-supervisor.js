"use strict";
// Member 3: The Invariant Guardian (Deterministic Safety Core)
// safety-supervisor.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.SafetySupervisor = void 0;
class SafetySupervisor {
    constructor(config) {
        this.config = config;
    }
    /**
     * Strictly synchronous validation gate.
     * Evaluates any proposed plan against immutable physical interlocks.
     */
    validateProposedActuation(currentState, proposedState, activeTimers) {
        // Rule 1: Prevent Conflicting Greens Invariant
        for (const phaseA of proposedState.activeGreens) {
            const conflicts = this.config.conflictMatrix[phaseA] || [];
            for (const phaseB of proposedState.activeGreens) {
                if (conflicts.includes(phaseB)) {
                    return {
                        isSafe: false,
                        command: this.forceSafeDefault("CRITICAL_CONFLICTING_GREENS_DETECTED"),
                    };
                }
            }
        }
        // Rule 2: Enforce Clearance Interval Constraints
        if (currentState.phaseId !== proposedState.phaseId) {
            // Verify proposed phase doesn't conflict with currently active phase
            const activePhaseConflicts = this.config.conflictMatrix[currentState.phaseId] || [];
            if (activePhaseConflicts.includes(proposedState.phaseId)) {
                return {
                    isSafe: false,
                    command: this.forceSafeDefault("PROPOSED_PHASE_CONFLICTS_WITH_CURRENT_PHASE"),
                };
            }
            // Block premature cutoff from hyper-aggressive optimization requests
            if (activeTimers.currentPhaseDuration < this.config.minGreenEnforced) {
                return {
                    isSafe: false,
                    command: this.maintainCurrentState(currentState.phaseId, "MINIMUM_GREEN_NOT_MET"),
                };
            }
            // Insert deterministic clearance delays (Yellow & All-Red)
            return {
                isSafe: true, // The transition is safe, but we MUST inject clearances
                command: {
                    action: "EXECUTE_PHASE_TRANSITION",
                    targetPhaseId: proposedState.phaseId,
                    yellowSeconds: Math.max(proposedState.yellowSeconds || 0, this.config.minYellowSeconds),
                    allRedSeconds: Math.max(proposedState.allRedSeconds || 0, this.config.minAllRedSeconds),
                },
            };
        }
        // Rule 3: Pedestrian Phase Protection Integrity
        if (currentState.pedestrianWalkActive) {
            if (activeTimers.pedestrianWalkDuration <
                this.config.minPedestrianWalkSeconds) {
                return {
                    isSafe: false,
                    command: this.maintainCurrentState(currentState.phaseId, "PEDESTRIAN_WALK_ACTIVE"),
                };
            }
        }
        // If all checks pass and no transition is needed, allow the optimized plan to proceed
        return {
            isSafe: true,
            command: {
                action: "ACTUATE_OPTIMIZED_PLAN",
                targetPhaseId: proposedState.phaseId,
            },
        };
    }
    /**
     * Executes the Safe Default fallback if AI logic crashes or hallucinates.
     */
    forceSafeDefault(reasonString) {
        return {
            action: "FORCE_FALLBACK",
            reason: reasonString,
            targetPhaseId: "FIXED_TIME_DEFAULT_LOOP_PHASE_1",
        };
    }
    /**
     * Overrides the optimizer and forces the current light to stay green.
     */
    maintainCurrentState(targetPhaseId, reasonString) {
        return {
            action: "MAINTAIN_CURRENT_STATE",
            reason: reasonString,
            targetPhaseId: targetPhaseId,
        };
    }
}
exports.SafetySupervisor = SafetySupervisor;
//# sourceMappingURL=safety-supervisor.js.map