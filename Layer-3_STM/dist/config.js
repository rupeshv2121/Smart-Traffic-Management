"use strict";
// Shared Layer-3 pipeline configuration (single source of truth)
Object.defineProperty(exports, "__esModule", { value: true });
exports.orchestratorConfig = exports.safetyConfig = exports.DEFAULT_PHASE = exports.MAX_DATA_AGE_SECONDS = exports.CONFIDENCE_WARNING = exports.CONFIDENCE_CRITICAL = exports.MIN_GREEN_ENFORCED = exports.MIN_PEDESTRIAN_WALK_SECONDS = exports.MIN_ALL_RED_SECONDS = exports.MIN_YELLOW_SECONDS = exports.PIPELINE_CYCLE_SECONDS = exports.PIPELINE_CYCLE_MS = void 0;
exports.PIPELINE_CYCLE_MS = 30000;
exports.PIPELINE_CYCLE_SECONDS = 30;
exports.MIN_YELLOW_SECONDS = 5;
exports.MIN_ALL_RED_SECONDS = 2;
exports.MIN_PEDESTRIAN_WALK_SECONDS = 8;
exports.MIN_GREEN_ENFORCED = 10;
exports.CONFIDENCE_CRITICAL = 0.7;
exports.CONFIDENCE_WARNING = 0.8;
exports.MAX_DATA_AGE_SECONDS = 10;
exports.DEFAULT_PHASE = "NORTH";
exports.safetyConfig = {
    minYellowSeconds: exports.MIN_YELLOW_SECONDS,
    minAllRedSeconds: exports.MIN_ALL_RED_SECONDS,
    minPedestrianWalkSeconds: exports.MIN_PEDESTRIAN_WALK_SECONDS,
    minGreenEnforced: exports.MIN_GREEN_ENFORCED,
    conflictMatrix: {
        NORTH: ["SOUTH"],
        SOUTH: ["NORTH"],
        EAST: ["WEST"],
        WEST: ["EAST"],
    },
};
exports.orchestratorConfig = {
    safetyConfig: exports.safetyConfig,
    resilienceThresholds: {
        criticalLowerBound: exports.CONFIDENCE_CRITICAL,
        warningThreshold: exports.CONFIDENCE_WARNING,
    },
    maxDataAgeSeconds: exports.MAX_DATA_AGE_SECONDS,
    defaultPhaseIfNoProposal: exports.DEFAULT_PHASE,
};
//# sourceMappingURL=config.js.map