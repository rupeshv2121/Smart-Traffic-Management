export declare const VEHICLE_WEIGHTS: {
    readonly Motorcycle: 0.5;
    readonly Car: 1;
    readonly AutoRickshaw: 1.2;
    readonly MiniTruck: 2;
    readonly Bus: 3;
    readonly HeavyTruck: 4;
    readonly Ambulance: 10;
};
export type VehicleType = keyof typeof VEHICLE_WEIGHTS;
export interface VehicleDetection {
    type: VehicleType;
    count: number;
}
export interface ApproachData {
    approachId: "NORTH" | "SOUTH" | "EAST" | "WEST";
    spatialOccupancyPct: number;
    detections: VehicleDetection[];
    waitingTimeSeconds: number;
    arrivalRatePerMin: number;
}
export interface ApproachMetrics {
    direction: string;
    detections: VehicleDetection[];
    avgWaitingTime: number;
    arrivalRate: number;
    queueLength: number;
    roadCapacity: number;
    hasBus: boolean;
    hasEmergencyVehicle: boolean;
    lastGreenSeconds: number;
}
export interface ScoredApproach {
    direction: string;
    priorityScore: number;
    personFlow: number;
    spillbackBoost: boolean;
    starvationOverride: boolean;
}
export interface Layer2Payload {
    junctionId: string;
    timestamp: string;
    cvConfidenceScore: number;
    approaches: ApproachData[];
}
export declare const SCORING_CONSTANTS: {
    readonly WAITING_TIME_FACTOR: 0.5;
    readonly QUEUE_FACTOR: 0.8;
    readonly SPILLBACK_THRESHOLD: 0.85;
    readonly SPILLBACK_BOOST: 15;
    readonly STARVATION_THRESHOLD: 45;
    readonly STARVATION_BOOST: 20;
    readonly BUS_BONUS: 3;
};
export declare function calculatePersonFlow(detections: VehicleDetection[]): number;
export declare function detectSpillback(queueLength: number, roadCapacity: number): boolean;
export declare function detectStarvation(lastGreenSeconds: number): boolean;
export declare function scoreAllApproaches(approaches: ApproachMetrics[]): ScoredApproach[];
export type PriorityClass = "CRITICAL" | "HIGH" | "NORMAL";
export declare const PRIORITY_CLASS_MULTIPLIER: Record<PriorityClass, number>;
export interface EmergencyToken {
    emvId: string;
    priorityClass: PriorityClass;
    etaSeconds: number;
    cryptographicToken: string;
    targetPhaseId: string;
}
export interface HistoricalTimingPlan {
    phaseId: string;
    recommendedGreenTime: number;
    historicalDemand: number;
}
export interface OptimizationProposal {
    approachId: "NORTH" | "SOUTH" | "EAST" | "WEST";
    priorityScore: number;
    proposedGreenTime: number;
    method: "MAX_PRESSURE";
    timestamp: string;
}
export interface EmergencyResponse {
    emvId: string;
    targetPhaseId: "NORTH" | "SOUTH" | "EAST" | "WEST";
    conflictIndex: number;
    requiredGreenDuration: number;
    executionUrgency: "CRITICAL" | "HIGH" | "NORMAL";
    timestamp: string;
}
export interface ActuationCommand {
    junctionId: string;
    commandId: string;
    targetPhaseId: string;
    durationSeconds: number;
    clearanceIntervals: {
        yellowSeconds: number;
        allRedSeconds: number;
    };
    executionMode: "NORMAL_MAX_PRESSURE" | "GREEN_CORRIDOR" | "SAFE_DEFAULT" | "HISTORICAL_FALLBACK";
}
//# sourceMappingURL=types.d.ts.map