import type { EmergencyToken, Layer2Payload } from "../types/types";
export declare class MockDataGenerator {
    private activeEmergency;
    private corridorEndTime;
    private generateRandomDetections;
    private generateApproach;
    /** Mock 3: inject Active Emergency Token (20% chance per cycle when no corridor active) */
    triggerEmergency(): EmergencyToken | null;
    isCorridorActive(): boolean;
    endEmergencyCorridor(): void;
    getLayer2Data(overrideConfidence?: number): Layer2Payload;
    /** Mock 2: average Tuesday traffic timings for resilience fallback */
    getHistoricalData(): {
        phaseId: string;
        recommendedGreenTime: number;
        historicalDemand: number;
    }[];
}
//# sourceMappingURL=mock_generator.d.ts.map