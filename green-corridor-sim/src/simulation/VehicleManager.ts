// Shared vehicle position tracker for collision avoidance
export interface VehicleEntry {
  id: string;
  lane: string;
  position: number; // position along the lane axis
  worldX?: number;
  worldZ?: number;
  isEmergency: boolean;
}

class VehicleManager {
  private vehicles: Map<string, VehicleEntry> = new Map();

  register(id: string, lane: string, position: number, isEmergency = false, worldX?: number, worldZ?: number) {
    this.vehicles.set(id, { id, lane, position, isEmergency, worldX, worldZ });
  }

  unregister(id: string) {
    this.vehicles.delete(id);
  }

  update(id: string, position: number, worldX?: number, worldZ?: number) {
    const v = this.vehicles.get(id);
    if (v) {
      v.position = position;
      v.worldX = worldX;
      v.worldZ = worldZ;
    }
  }

  updateState(id: string, lane: string, position: number, worldX?: number, worldZ?: number) {
    const v = this.vehicles.get(id);
    if (!v) return;
    v.lane = lane;
    v.position = position;
    v.worldX = worldX;
    v.worldZ = worldZ;
  }

  hasVehicleNear(lane: string, position: number, minGap: number, selfId?: string): boolean {
    for (const [id, v] of this.vehicles) {
      if (id === selfId || v.lane !== lane) continue;
      if (Math.abs(v.position - position) < minGap) return true;
    }
    return false;
  }

  // Get the nearest vehicle AHEAD in the same lane
  // "ahead" depends on direction: dir=1 means increasing position, dir=-1 means decreasing
  getDistanceToVehicleAhead(
    id: string,
    lane: string,
    position: number,
    dir: number,
  ): number {
    let minDist = Infinity;

    for (const [vid, v] of this.vehicles) {
      if (vid === id || v.lane !== lane) continue;
      const diff = (v.position - position) * dir;
      if (diff > 0.05 && diff < minDist) {
        minDist = diff;
      }
    }
    return minDist;
  }

  // Check if an ambulance is nearby in the same lane and behind the vehicle
  // so only traffic moving in the ambulance's direction reacts.
  isEmergencyNearby(lane: string, position: number): boolean {
    const laneDirMap: Record<string, number> = { N: -1, S: 1, E: 1, W: -1 };
    const dir = laneDirMap[lane] ?? 0;
    if (dir === 0) return false;

    for (const [, v] of this.vehicles) {
      if (!v.isEmergency) continue;
      if (v.lane !== lane) continue;

      // Vehicle reacts only if ambulance is behind it along lane direction.
      // dir=+1: ambulance behind means lower position
      // dir=-1: ambulance behind means higher position
      const vehicleAheadOfAmbulance = (position - v.position) * dir > 0;
      if (vehicleAheadOfAmbulance && Math.abs(v.position - position) < 35) {
        return true;
      }
    }
    return false;
  }

}

export const vehicleManager = new VehicleManager();
