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
        action: "ACTUATE_OPTIMIZED_PLAN" | "EXECUTE_PHASE_TRANSITION" | "MAINTAIN_CURRENT_STATE" | "FORCE_FALLBACK";
        targetPhaseId: string;
        yellowSeconds?: number;
        allRedSeconds?: number;
        reason?: string;
    };
}
export declare class SafetySupervisor {
    private config;
    constructor(config: SafetyConfig);
    /**
     * Strictly synchronous validation gate.
     * Evaluates any proposed plan against immutable physical interlocks.
     */
    validateProposedActuation(currentState: CurrentState, proposedState: ProposedState, activeTimers: ActiveTimers): SafetyValidationResult;
    /**
     * Executes the Safe Default fallback if AI logic crashes or hallucinates.
     */
    private forceSafeDefault;
    /**
     * Overrides the optimizer and forces the current light to stay green.
     */
    private maintainCurrentState;
}
//# sourceMappingURL=safety-supervisor.d.ts.map