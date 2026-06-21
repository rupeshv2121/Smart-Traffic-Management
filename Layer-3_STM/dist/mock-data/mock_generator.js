"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockDataGenerator = void 0;
const types_1 = require("../types/types");
const PHASES = ["NORTH", "SOUTH", "EAST", "WEST"];
const PRIORITY_CLASSES = ["CRITICAL", "HIGH", "NORMAL"];
class MockDataGenerator {
    constructor() {
        this.activeEmergency = null;
        this.corridorEndTime = null;
    }
    generateRandomDetections() {
        return Object.keys(types_1.VEHICLE_WEIGHTS).map((type) => ({
            type: type,
            count: Math.floor(Math.random() * 15),
        }));
    }
    generateApproach(approachId) {
        return {
            approachId,
            spatialOccupancyPct: Math.floor(Math.random() * 90) + 10,
            detections: this.generateRandomDetections(),
            waitingTimeSeconds: Math.floor(Math.random() * 120),
            arrivalRatePerMin: Math.floor(Math.random() * 30),
        };
    }
    /** Mock 3: inject Active Emergency Token (20% chance per cycle when no corridor active) */
    triggerEmergency() {
        const now = Date.now();
        if (this.activeEmergency && this.corridorEndTime && now < this.corridorEndTime) {
            return this.activeEmergency;
        }
        if (this.activeEmergency) {
            this.endEmergencyCorridor();
            return null;
        }
        if (Math.random() <= 0.8)
            return null;
        const etaSeconds = Math.floor(Math.random() * 60) + 10;
        const targetPhaseId = PHASES[Math.floor(Math.random() * PHASES.length)] ?? "NORTH";
        const priorityClass = PRIORITY_CLASSES[Math.floor(Math.random() * PRIORITY_CLASSES.length)] ??
            "CRITICAL";
        this.activeEmergency = {
            emvId: `AMB-${Math.floor(Math.random() * 9999)}`,
            priorityClass,
            etaSeconds,
            cryptographicToken: "0xVALID_MOCK_TOKEN",
            targetPhaseId,
        };
        this.corridorEndTime = now + etaSeconds * 1000;
        return this.activeEmergency;
    }
    isCorridorActive() {
        return (this.activeEmergency !== null &&
            this.corridorEndTime !== null &&
            Date.now() < this.corridorEndTime);
    }
    endEmergencyCorridor() {
        if (this.activeEmergency) {
            console.log(`[EMVS] Corridor ended for ${this.activeEmergency.emvId} — resuming normal traffic`);
        }
        this.activeEmergency = null;
        this.corridorEndTime = null;
    }
    getLayer2Data(overrideConfidence) {
        const simulatedConfidence = overrideConfidence ?? (Math.random() < 0.5 ? 0.65 : 0.88);
        return {
            junctionId: "DEL_DL_ITO_01",
            timestamp: new Date().toISOString(),
            cvConfidenceScore: simulatedConfidence,
            approaches: [
                this.generateApproach("NORTH"),
                this.generateApproach("SOUTH"),
                this.generateApproach("EAST"),
                this.generateApproach("WEST"),
            ],
        };
    }
    /** Mock 2: average Tuesday traffic timings for resilience fallback */
    getHistoricalData() {
        return [
            { phaseId: "NORTH", recommendedGreenTime: 45, historicalDemand: 60 },
            { phaseId: "SOUTH", recommendedGreenTime: 30, historicalDemand: 40 },
            { phaseId: "EAST", recommendedGreenTime: 35, historicalDemand: 50 },
            { phaseId: "WEST", recommendedGreenTime: 40, historicalDemand: 55 },
        ];
    }
}
exports.MockDataGenerator = MockDataGenerator;
//# sourceMappingURL=mock_generator.js.map