export declare const PIPELINE_CYCLE_MS = 30000;
export declare const PIPELINE_CYCLE_SECONDS = 30;
export declare const MIN_YELLOW_SECONDS = 5;
export declare const MIN_ALL_RED_SECONDS = 2;
export declare const MIN_PEDESTRIAN_WALK_SECONDS = 8;
export declare const MIN_GREEN_ENFORCED = 10;
export declare const CONFIDENCE_CRITICAL = 0.7;
export declare const CONFIDENCE_WARNING = 0.8;
export declare const MAX_DATA_AGE_SECONDS = 10;
export declare const DEFAULT_PHASE = "NORTH";
export declare const safetyConfig: {
    minYellowSeconds: number;
    minAllRedSeconds: number;
    minPedestrianWalkSeconds: number;
    minGreenEnforced: number;
    conflictMatrix: {
        NORTH: string[];
        SOUTH: string[];
        EAST: string[];
        WEST: string[];
    };
};
export declare const orchestratorConfig: {
    safetyConfig: {
        minYellowSeconds: number;
        minAllRedSeconds: number;
        minPedestrianWalkSeconds: number;
        minGreenEnforced: number;
        conflictMatrix: {
            NORTH: string[];
            SOUTH: string[];
            EAST: string[];
            WEST: string[];
        };
    };
    resilienceThresholds: {
        criticalLowerBound: number;
        warningThreshold: number;
    };
    maxDataAgeSeconds: number;
    defaultPhaseIfNoProposal: string;
};
//# sourceMappingURL=config.d.ts.map