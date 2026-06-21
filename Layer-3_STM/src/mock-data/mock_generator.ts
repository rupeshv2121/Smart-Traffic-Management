// mock-generator.ts — Mock Layer 2 cameras, historical DB, and EMVS dispatch
import type {
  ApproachData,
  EmergencyToken,
  Layer2Payload,
  PriorityClass,
} from "../types/types";
import { VEHICLE_WEIGHTS } from "../types/types";

const PHASES = ["NORTH", "SOUTH", "EAST", "WEST"] as const;
const PRIORITY_CLASSES: PriorityClass[] = ["CRITICAL", "HIGH", "NORMAL"];

export class MockDataGenerator {
  private activeEmergency: EmergencyToken | null = null;
  private corridorEndTime: number | null = null;

  private generateRandomDetections() {
    return Object.keys(VEHICLE_WEIGHTS).map((type) => ({
      type: type as keyof typeof VEHICLE_WEIGHTS,
      count: Math.floor(Math.random() * 15),
    }));
  }

  private generateApproach(
    approachId: "NORTH" | "SOUTH" | "EAST" | "WEST",
  ): ApproachData {
    return {
      approachId,
      spatialOccupancyPct: Math.floor(Math.random() * 90) + 10,
      detections: this.generateRandomDetections(),
      waitingTimeSeconds: Math.floor(Math.random() * 120),
      arrivalRatePerMin: Math.floor(Math.random() * 30),
    };
  }

  /** Mock 3: inject Active Emergency Token (20% chance per cycle when no corridor active) */
  public triggerEmergency(): EmergencyToken | null {
    const now = Date.now();

    if (this.activeEmergency && this.corridorEndTime && now < this.corridorEndTime) {
      return this.activeEmergency;
    }

    if (this.activeEmergency) {
      this.endEmergencyCorridor();
      return null;
    }

    if (Math.random() <= 0.8) return null;

    const etaSeconds = Math.floor(Math.random() * 60) + 10;
    const targetPhaseId =
      PHASES[Math.floor(Math.random() * PHASES.length)] ?? "NORTH";
    const priorityClass =
      PRIORITY_CLASSES[Math.floor(Math.random() * PRIORITY_CLASSES.length)] ??
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

  public isCorridorActive(): boolean {
    return (
      this.activeEmergency !== null &&
      this.corridorEndTime !== null &&
      Date.now() < this.corridorEndTime
    );
  }

  public endEmergencyCorridor(): void {
    if (this.activeEmergency) {
      console.log(
        `[EMVS] Corridor ended for ${this.activeEmergency.emvId} — resuming normal traffic`,
      );
    }
    this.activeEmergency = null;
    this.corridorEndTime = null;
  }

  public getLayer2Data(overrideConfidence?: number): Layer2Payload {
    const simulatedConfidence =
      overrideConfidence ?? (Math.random() < 0.5 ? 0.65 : 0.88);

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
  public getHistoricalData() {
    return [
      { phaseId: "NORTH", recommendedGreenTime: 45, historicalDemand: 60 },
      { phaseId: "SOUTH", recommendedGreenTime: 30, historicalDemand: 40 },
      { phaseId: "EAST", recommendedGreenTime: 35, historicalDemand: 50 },
      { phaseId: "WEST", recommendedGreenTime: 40, historicalDemand: 55 },
    ];
  }
}
