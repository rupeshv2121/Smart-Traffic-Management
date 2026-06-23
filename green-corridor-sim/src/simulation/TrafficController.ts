// Central Traffic Controller (CTC)
export type SignalState = 'red' | 'yellow' | 'green';
export type Direction = 'NS' | 'EW';
export type ApproachLane = 'N' | 'E' | 'S' | 'W';

type LaneMetrics = {
  queueCount: number;
  ambulanceDetected: boolean;
};

export interface TrafficState {
  nsSignal: SignalState;
  ewSignal: SignalState;
  activeLane: ApproachLane;
  mode: 'normal' | 'emergency';
  ambulanceDirection: Direction | null;
  cycleProgress: number;
}

export class TrafficController {
  private state: TrafficState = {
    nsSignal: 'green',
    ewSignal: 'red',
    activeLane: 'N',
    mode: 'normal',
    ambulanceDirection: null,
    cycleProgress: 0,
  };

  private laneOrder: ApproachLane[] = ['N', 'E', 'S', 'W'];
  private laneIndex = 0;
  private elapsed = 0;
  private currentGreenDuration = 5;
  private transitioningLane: ApproachLane | null = null; // Next lane in pre-green yellow
  private transitionElapsed = 0;
  private readonly yellowDuration = 2;
  private emergencyLane: ApproachLane | null = null;

  // Smart control configuration (as requested)
  private readonly baseGreenTime = 5;
  private readonly additionalTimePerVehicle = 2;
  private readonly minGreenTime = 5;
  private readonly maxGreenTime = 30;
  private readonly w1Density = 1.0;
  private readonly w2Waiting = 1.0;
  private readonly maxWaitingTime = 120;
  private readonly waitingTimeScale = 0.1;
  private readonly starvationThreshold = 60;
  private readonly passRate = 0.8;

  // Per-lane state
  private queueCount: Record<ApproachLane, number> = { N: 0, E: 0, S: 0, W: 0 };
  private ambulanceDetected: Record<ApproachLane, boolean> = { N: false, E: false, S: false, W: false };
  private waitingTime: Record<ApproachLane, number> = { N: 0, E: 0, S: 0, W: 0 };

  private applyActiveLane(lane: ApproachLane) {
    this.state.activeLane = lane;
    // Backward-compatible corridor signals for HUD/legacy consumers.
    if (lane === 'N' || lane === 'S') {
      this.state.nsSignal = 'green';
      this.state.ewSignal = 'red';
    } else {
      this.state.nsSignal = 'red';
      this.state.ewSignal = 'green';
    }
  }

  getState(): TrafficState {
    return { ...this.state };
  }

  setLaneInputs(metrics: Record<ApproachLane, LaneMetrics>) {
    for (const lane of this.laneOrder) {
      this.queueCount[lane] = Math.max(0, metrics[lane]?.queueCount ?? 0);
      this.ambulanceDetected[lane] = !!metrics[lane]?.ambulanceDetected;
    }
  }

  private calculatePriority(lane: ApproachLane): number {
    const cappedWait = Math.min(this.waitingTime[lane], this.maxWaitingTime);
    const scaledWait = cappedWait * this.waitingTimeScale;
    const densityTerm = this.queueCount[lane] * this.w1Density;
    const waitingTerm = scaledWait * this.w2Waiting;
    return densityTerm + waitingTerm;
  }

  private calculateGreenTimeForLane(lane: ApproachLane): number {
    const raw = this.baseGreenTime + this.queueCount[lane] * this.additionalTimePerVehicle;
    return Math.min(this.maxGreenTime, Math.max(this.minGreenTime, raw));
  }

  private calculateEmergencyGreenTimeForLane(lane: ApproachLane): number {
    const raw = this.baseGreenTime + this.queueCount[lane] * this.additionalTimePerVehicle;
    return Math.min(this.maxGreenTime, Math.max(10, raw));
  }

  private selectNextLane(): ApproachLane {
    // 1) Emergency lane override (safe-transition: selected at cycle boundary only).
    if (this.emergencyLane !== null) {
      return this.emergencyLane;
    }

    const nonEmptyLanes = this.laneOrder.filter((lane) => this.queueCount[lane] > 0);

    // Starvation override
    const starving = nonEmptyLanes.filter((lane) => this.waitingTime[lane] >= this.starvationThreshold);
    if (starving.length > 0) {
      return starving.reduce((best, lane) => {
        if (this.waitingTime[lane] > this.waitingTime[best]) return lane;
        if (this.waitingTime[lane] === this.waitingTime[best] && this.calculatePriority(lane) > this.calculatePriority(best)) return lane;
        return best;
      }, starving[0]);
    }

    // Priority-based selection among non-empty lanes
    if (nonEmptyLanes.length > 0) {
      return nonEmptyLanes.reduce((best, lane) =>
        this.calculatePriority(lane) > this.calculatePriority(best) ? lane : best,
      nonEmptyLanes[0]);
    }

    // All lanes empty: stable rotation fallback
    const nextIndex = (this.laneIndex + 1) % this.laneOrder.length;
    return this.laneOrder[nextIndex];
  }

  private finishGreenPhase() {
    const selectedLane = this.state.activeLane;
    const vehiclesPassed = Math.min(
      this.queueCount[selectedLane],
      Math.floor(this.currentGreenDuration * this.passRate),
    );

    this.queueCount[selectedLane] = Math.max(0, this.queueCount[selectedLane] - vehiclesPassed);

    const cycleDuration = this.currentGreenDuration + this.yellowDuration;
    for (const lane of this.laneOrder) {
      if (lane === selectedLane) {
        this.waitingTime[lane] = 0;
      } else {
        this.waitingTime[lane] = Math.min(this.maxWaitingTime, this.waitingTime[lane] + cycleDuration);
      }
    }
  }

  private startYellowTransitionTo(nextLane: ApproachLane) {
    this.transitioningLane = nextLane;
    this.transitionElapsed = 0;
    this.elapsed = 0;
    this.state.cycleProgress = 0;
    this.state.nsSignal = 'yellow';
    this.state.ewSignal = 'yellow';
  }

  getLaneSignal(lane: ApproachLane): SignalState {
    if (this.transitioningLane !== null) {
      if (lane === this.state.activeLane || lane === this.transitioningLane) return 'yellow';
      return 'red';
    }
    return this.state.activeLane === lane ? 'green' : 'red';
  }

  getLaneRemainingSeconds(lane: ApproachLane): number | null {
    // During dual-yellow phase, outgoing and incoming lanes have exact remaining yellow time.
    if (this.transitioningLane !== null) {
      if (lane === this.state.activeLane || lane === this.transitioningLane) {
        return Math.max(0, this.yellowDuration - this.transitionElapsed);
      }
      return this.estimateSecondsUntilLaneYellow(lane);
    }

    if (lane === this.state.activeLane) {
      return Math.max(0, this.currentGreenDuration - this.elapsed);
    }

    return this.estimateSecondsUntilLaneYellow(lane);
  }

  private estimateSecondsUntilLaneYellow(targetLane: ApproachLane): number {
    const virtualQueue: Record<ApproachLane, number> = { ...this.queueCount };
    const virtualWaiting: Record<ApproachLane, number> = { ...this.waitingTime };
    let virtualActive: ApproachLane = this.state.activeLane;
    let eta = 0;

    const calculatePriorityVirtual = (lane: ApproachLane): number => {
      const cappedWait = Math.min(virtualWaiting[lane], this.maxWaitingTime);
      const scaledWait = cappedWait * this.waitingTimeScale;
      const densityTerm = virtualQueue[lane] * this.w1Density;
      const waitingTerm = scaledWait * this.w2Waiting;
      return densityTerm + waitingTerm;
    };

    const selectNextLaneVirtual = (): ApproachLane => {
      if (this.emergencyLane !== null) {
        return this.emergencyLane;
      }

      const nonEmptyLanes = this.laneOrder.filter((lane) => virtualQueue[lane] > 0);
      const starving = nonEmptyLanes.filter((lane) => virtualWaiting[lane] >= this.starvationThreshold);

      if (starving.length > 0) {
        return starving.reduce((best, lane) => {
          if (virtualWaiting[lane] > virtualWaiting[best]) return lane;
          if (virtualWaiting[lane] === virtualWaiting[best] && calculatePriorityVirtual(lane) > calculatePriorityVirtual(best)) return lane;
          return best;
        }, starving[0]);
      }

      if (nonEmptyLanes.length > 0) {
        return nonEmptyLanes.reduce((best, lane) =>
          calculatePriorityVirtual(lane) > calculatePriorityVirtual(best) ? lane : best,
        nonEmptyLanes[0]);
      }

      const currentIndex = this.laneOrder.indexOf(virtualActive);
      return this.laneOrder[(currentIndex + 1) % this.laneOrder.length];
    };

    const applyGreenPhaseVirtual = (lane: ApproachLane, greenDuration: number) => {
      const passed = Math.min(virtualQueue[lane], Math.floor(greenDuration * this.passRate));
      virtualQueue[lane] = Math.max(0, virtualQueue[lane] - passed);
      const cycleDuration = greenDuration + this.yellowDuration;

      for (const l of this.laneOrder) {
        if (l === lane) {
          virtualWaiting[l] = 0;
        } else {
          virtualWaiting[l] = Math.min(this.maxWaitingTime, virtualWaiting[l] + cycleDuration);
        }
      }
    };

    // If currently in yellow transition, count remaining yellow first.
    if (this.transitioningLane !== null) {
      eta += Math.max(0, this.yellowDuration - this.transitionElapsed);
      virtualActive = this.transitioningLane;
    } else {
      const greenRemaining = Math.max(0, this.currentGreenDuration - this.elapsed);
      if (targetLane === virtualActive) return greenRemaining;

      applyGreenPhaseVirtual(virtualActive, this.currentGreenDuration);
      const nextLane = selectNextLaneVirtual();
      if (targetLane === virtualActive || targetLane === nextLane) return greenRemaining;

      eta += greenRemaining + this.yellowDuration;
      virtualActive = nextLane;
    }

    // Project forward a few cycles using current snapshot as estimate.
    for (let i = 0; i < this.laneOrder.length * 4; i++) {
      const greenDuration = this.emergencyLane === virtualActive
        ? this.calculateEmergencyGreenTimeForLane(virtualActive)
        : this.calculateGreenTimeForLane(virtualActive);
      if (targetLane === virtualActive) return eta + greenDuration;

      applyGreenPhaseVirtual(virtualActive, greenDuration);
      const nextLane = selectNextLaneVirtual();
      if (targetLane === virtualActive || targetLane === nextLane) return eta + greenDuration;

      eta += greenDuration + this.yellowDuration;
      virtualActive = nextLane;
    }

    return eta;
  }

  triggerEmergency(direction: Direction, lane?: ApproachLane) {
    this.state.ambulanceDirection = direction;
    this.emergencyLane = lane ?? (direction === 'NS' ? 'N' : 'E');
    this.state.mode = 'emergency';

    // Strict preemption: if ambulance lane is not currently green,
    // start an immediate yellow buffer and then force that lane green.
    if (this.transitioningLane === null && this.state.activeLane !== this.emergencyLane) {
      this.startYellowTransitionTo(this.emergencyLane);
    }
  }

  clearEmergency() {
    this.emergencyLane = null;
    this.state.mode = 'normal';
    this.state.ambulanceDirection = null;
  }

  update(dt: number) {
    // Strict emergency override while running: retarget any ongoing transition
    // or start one immediately if ambulance lane is not currently green.
    if (this.emergencyLane !== null) {
      if (this.transitioningLane !== null && this.transitioningLane !== this.emergencyLane) {
        this.startYellowTransitionTo(this.emergencyLane);
      } else if (this.transitioningLane === null && this.state.activeLane !== this.emergencyLane) {
        this.startYellowTransitionTo(this.emergencyLane);
      }
    }

    // Phase A: both outgoing and incoming lanes are yellow for 2 seconds.
    if (this.transitioningLane !== null) {
      this.transitionElapsed += dt;
      this.state.cycleProgress = Math.min(1, this.transitionElapsed / this.yellowDuration);

      if (this.transitionElapsed >= this.yellowDuration) {
        const nextLane = this.transitioningLane;
        this.transitionElapsed = 0;
        this.transitioningLane = null;
        this.elapsed = 0;
        this.applyActiveLane(nextLane);
        this.laneIndex = this.laneOrder.indexOf(nextLane);
        this.currentGreenDuration = this.emergencyLane === nextLane
          ? this.calculateEmergencyGreenTimeForLane(nextLane)
          : this.calculateGreenTimeForLane(nextLane);
      }
      return;
    }

    // Phase B: currently active lane stays green for dynamically computed duration.
    this.elapsed += dt;
    this.state.cycleProgress = Math.min(1, this.elapsed / this.currentGreenDuration);
    if (this.elapsed < this.currentGreenDuration) return;

    // Complete cycle accounting once per full cycle (no mid-cycle recalculation).
    this.finishGreenPhase();

    // Green ended: prepare next lane, while current+next both show yellow.
    this.elapsed = 0;
    this.transitionElapsed = 0;
    this.transitioningLane = this.selectNextLane();

    // During dual-yellow transition, both corridor indicators are yellow.
    this.state.nsSignal = 'yellow';
    this.state.ewSignal = 'yellow';
  }
}
