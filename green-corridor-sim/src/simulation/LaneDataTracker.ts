import type { ApproachLane, SignalState } from "./TrafficController";
import { vehicleManager } from "./VehicleManager";

export interface LaneData {
  laneId: string;
  laneName: string;
  signal: SignalState;
  queueCount: number;
  enteredCount: number;
  ambulanceDetected: boolean;
}

export interface IntersectionLaneData {
  intersectionId: string;
  lanes: LaneData[];
  timestamp: number;
}

class LaneDataTracker {
  private enteredCounters: Map<string, number> = new Map();
  private detectionZone = 15; // Distance from center where we count vehicles as "entered"
  private trackedVehicles: Map<string, boolean> = new Map(); // Track which vehicles we've already counted

  constructor() {
    // Initialize counters for each lane
    ["N", "S", "E", "W"].forEach((lane) => {
      this.enteredCounters.set(lane, 0);
    });
  }

  reset() {
    this.enteredCounters.clear();
    this.trackedVehicles.clear();
    ["N", "S", "E", "W"].forEach((lane) => {
      this.enteredCounters.set(lane, 0);
    });
  }

  update() {
    // Count vehicles that have entered the detection zone
    const vehicles = (vehicleManager as any).vehicles as Map<string, any>;

    for (const [id, vehicle] of vehicles) {
      // Skip ambulance from civilian lane counts
      if (vehicle.isEmergency) continue;

      const distToCenter = Math.abs(vehicle.position);

      // If vehicle is within detection zone and we haven't counted it yet
      if (distToCenter < this.detectionZone && !this.trackedVehicles.has(id)) {
        this.trackedVehicles.set(id, true);
        const currentCount = this.enteredCounters.get(vehicle.lane) || 0;
        this.enteredCounters.set(vehicle.lane, currentCount + 1);
      }

      // Clean up tracked vehicles that are far away (they've passed through)
      if (distToCenter > 50) {
        this.trackedVehicles.delete(id);
      }
    }
  }

  getLaneData(
    laneId: string,
    laneName: string,
    signal: SignalState,
    ambulanceNearby: boolean,
  ): LaneData {
    const vehicles = (vehicleManager as any).vehicles as Map<string, any>;
    let queueCount = 0;
    let ambulanceDetected = false;

    for (const [, vehicle] of vehicles) {
      if (vehicle.lane === laneId) {
        if (vehicle.isEmergency) {
          ambulanceDetected = true;
        } else {
          queueCount++;
        }
      }
    }

    return {
      laneId,
      laneName,
      signal,
      queueCount,
      enteredCount: this.enteredCounters.get(laneId) || 0,
      ambulanceDetected: ambulanceDetected || ambulanceNearby,
    };
  }

  getIntersectionData(
    intersectionId: string,
    nsSignal: SignalState,
    ewSignal: SignalState,
    ambulanceActive: boolean,
    ambulanceDir: "NS" | "EW",
  ): IntersectionLaneData {
    this.update();

    const lanes: LaneData[] = [
      this.getLaneData(
        "N",
        "North Lane",
        nsSignal,
        ambulanceActive && ambulanceDir === "NS",
      ),
      this.getLaneData(
        "S",
        "South Lane",
        nsSignal,
        ambulanceActive && ambulanceDir === "NS",
      ),
      this.getLaneData(
        "E",
        "East Lane",
        ewSignal,
        ambulanceActive && ambulanceDir === "EW",
      ),
      this.getLaneData(
        "W",
        "West Lane",
        ewSignal,
        ambulanceActive && ambulanceDir === "EW",
      ),
    ];

    return {
      intersectionId,
      lanes,
      timestamp: Date.now(),
    };
  }

  getCurrentLaneMetrics(): Record<
    ApproachLane,
    { queueCount: number; ambulanceDetected: boolean }
  > {
    const vehicles = (vehicleManager as any).vehicles as Map<string, any>;
    const metrics: Record<
      ApproachLane,
      { queueCount: number; ambulanceDetected: boolean }
    > = {
      N: { queueCount: 0, ambulanceDetected: false },
      E: { queueCount: 0, ambulanceDetected: false },
      S: { queueCount: 0, ambulanceDetected: false },
      W: { queueCount: 0, ambulanceDetected: false },
    };

    for (const [, vehicle] of vehicles) {
      const lane = vehicle.lane as ApproachLane;
      if (!(lane in metrics)) continue;
      if (vehicle.isEmergency) {
        metrics[lane].ambulanceDetected = true;
      } else {
        metrics[lane].queueCount += 1;
      }
    }

    return metrics;
  }
}

export const laneDataTracker = new LaneDataTracker();
