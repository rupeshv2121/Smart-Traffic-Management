import { ApproachMetrics } from "./types/types";
export interface DownstreamDensity {
    direction: string;
    occupancyPct: number;
}
export interface PhaseState {
    currentPhaseId: string;
    phaseElapsedSeconds: number;
    currentGreenDuration: number;
    currentDensity: "low" | "medium" | "high";
}
export interface ProposedPlan {
    junctionId: string;
    timestamp: string;
    dataSource: "LIVE" | "HISTORICAL" | "EMV_OVERRIDE";
    targetPhaseId: string;
    greenDuration: number;
    yellowDuration: number;
    allRedDuration: number;
    pressureSnapshot: Record<string, number>;
    priorityScores: Record<string, number>;
    personFlows: Record<string, number>;
    spillbackFlags: Record<string, boolean>;
    starvationFlags: Record<string, boolean>;
    extendGreen: boolean;
    winningDirection: string;
}
export declare function pauseOptimizer(junctionId: string): void;
export declare function resumeOptimizer(junctionId: string): void;
export declare function runMaxPressureOptimizer(junctionId: string, approaches: ApproachMetrics[], downstream: DownstreamDensity[], currentPhase: PhaseState, confidenceScore: number, historicalGreenTime?: number): ProposedPlan;
//# sourceMappingURL=max-pressure-optimizer.d.ts.map