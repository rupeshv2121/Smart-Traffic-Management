// Member 3: The Invariant Guardian (Deterministic Safety Core)
// safety-supervisor.ts

export interface SafetyConfig {
  minYellowSeconds: number;
  minAllRedSeconds: number;
  minPedestrianWalkSeconds: number;
  minGreenEnforced: number;
  conflictMatrix: Record<string, string[]>;
}

export interface CurrentState {
  phaseId: string;
  activeGreens: string[];
  pedestrianWalkActive: boolean;
}

export interface ProposedState {
  phaseId: string;
  activeGreens: string[];
  yellowSeconds?: number;
  allRedSeconds?: number;
}

export interface ActiveTimers {
  currentPhaseDuration: number;
  pedestrianWalkDuration: number;
}

export interface SafetyValidationResult {
  isSafe: boolean;
  command: {
    action:
      | "ACTUATE_OPTIMIZED_PLAN"
      | "EXECUTE_PHASE_TRANSITION"
      | "MAINTAIN_CURRENT_STATE"
      | "FORCE_FALLBACK";
    targetPhaseId: string;
    yellowSeconds?: number;
    allRedSeconds?: number;
    reason?: string;
  };
}

export class SafetySupervisor {
  private config: SafetyConfig;

  constructor(config: SafetyConfig) {
    this.config = config;
  }

  /**
   * Strictly synchronous validation gate.
   * Evaluates any proposed plan against immutable physical interlocks.
   */
  public validateProposedActuation(
    currentState: CurrentState,
    proposedState: ProposedState,
    activeTimers: ActiveTimers,
    options: { emergencyOverride?: boolean } = {},
  ): SafetyValidationResult {
    const emergencyOverride = options.emergencyOverride ?? false;

    // Rule 1: Prevent Conflicting Greens Invariant
    // HARD physical interlock — enforced even under emergency preemption.
    for (const phaseA of proposedState.activeGreens) {
      const conflicts = this.config.conflictMatrix[phaseA] || [];
      for (const phaseB of proposedState.activeGreens) {
        if (conflicts.includes(phaseB)) {
          return {
            isSafe: false,
            command: this.forceSafeDefault(
              "CRITICAL_CONFLICTING_GREENS_DETECTED",
            ),
          };
        }
      }
    }

    // Rule 2: Enforce Clearance Interval Constraints
    if (currentState.phaseId !== proposedState.phaseId) {
      // Verify proposed phase doesn't conflict with currently active phase
      const activePhaseConflicts =
        this.config.conflictMatrix[currentState.phaseId] || [];

      // A direct jump between opposing phases is unsafe — unless an EMV
      // preemption is in force, in which case we still grant the transition
      // and rely on the clearance intervals below to drain the conflict.
      if (
        activePhaseConflicts.includes(proposedState.phaseId) &&
        !emergencyOverride
      ) {
        return {
          isSafe: false,
          command: this.forceSafeDefault(
            "PROPOSED_PHASE_CONFLICTS_WITH_CURRENT_PHASE",
          ),
        };
      }

      // Block premature cutoff from hyper-aggressive optimization requests.
      // Emergency preemption overrides the minimum-green dwell time.
      if (
        activeTimers.currentPhaseDuration < this.config.minGreenEnforced &&
        !emergencyOverride
      ) {
        return {
          isSafe: false,
          command: this.maintainCurrentState(
            currentState.phaseId,
            "MINIMUM_GREEN_NOT_MET",
          ),
        };
      }

      // Insert deterministic clearance delays (Yellow & All-Red).
      // These are ALWAYS applied — including emergency preemption — so opposing
      // traffic is brought to a safe stop before the corridor phase goes green.
      return {
        isSafe: true, // The transition is safe, but we MUST inject clearances
        command: {
          action: "EXECUTE_PHASE_TRANSITION",
          targetPhaseId: proposedState.phaseId,
          yellowSeconds: Math.max(
            proposedState.yellowSeconds || 0,
            this.config.minYellowSeconds,
          ),
          allRedSeconds: Math.max(
            proposedState.allRedSeconds || 0,
            this.config.minAllRedSeconds,
          ),
          ...(emergencyOverride ? { reason: "EMERGENCY_PREEMPTION" } : {}),
        },
      };
    }

    // Rule 3: Pedestrian Phase Protection Integrity
    // Held for the minimum walk time, unless an EMV preemption overrides it
    // (the clearance intervals above still protect pedestrians mid-crossing).
    if (currentState.pedestrianWalkActive && !emergencyOverride) {
      if (
        activeTimers.pedestrianWalkDuration <
        this.config.minPedestrianWalkSeconds
      ) {
        return {
          isSafe: false,
          command: this.maintainCurrentState(
            currentState.phaseId,
            "PEDESTRIAN_WALK_ACTIVE",
          ),
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
  private forceSafeDefault(reasonString: string) {
    return {
      action: "FORCE_FALLBACK" as const,
      reason: reasonString,
      targetPhaseId: "FIXED_TIME_DEFAULT_LOOP_PHASE_1",
    };
  }

  /**
   * Overrides the optimizer and forces the current light to stay green.
   */
  private maintainCurrentState(targetPhaseId: string, reasonString: string) {
    return {
      action: "MAINTAIN_CURRENT_STATE" as const,
      reason: reasonString,
      targetPhaseId: targetPhaseId,
    };
  }
}
