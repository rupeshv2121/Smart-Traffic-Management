import { RealisticAmbulance } from '@/components/vehicles/RealisticAmbulance';
import type { ApproachLane, Direction, SignalState } from '@/simulation/TrafficController';
import { vehicleManager } from '@/simulation/VehicleManager';
import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { LANE_POSITIONS } from './Road';

interface RealisticAmbulanceMovingProps {
  active: boolean;
  direction: Direction;
  hospitalTarget: [number, number];
  hospitalApproachPoint: [number, number];
  hospitalTerminalPoint: [number, number];
  onApproachIntersection: () => void;
  onPassedIntersection: () => void;
  onPositionUpdate?: (lane: ApproachLane, worldX: number, worldZ: number) => void;
  onRouteDecision?: (centerX: number, centerZ: number, selectedLane: ApproachLane) => void;
  getSignalForLane: (lane: ApproachLane, position?: number, worldX?: number, worldZ?: number) => SignalState;
}

const BASE_AMBULANCE_SPEED = 8.5;
const MAX_AMBULANCE_SPEED = 10.0; // Can go faster when not blocked
const EXIT_DISTANCE = 210;
const STOP_LINE_DISTANCE = 17;
const STOP_APPROACH_DISTANCE = 10;
const SIGNAL_LINES = [-100, 0, 100];
const AMB_ID = 'demo-ambulance';
const TURN_DURATION = 0.9;
const MAX_ACTIVE_SECONDS = 140;
const HOSPITAL_ARRIVAL_RADIUS = 2.2;
const ROUTE_LOOKAHEAD_DISTANCE = 32;

const TURN_MAP: Record<Lane, { left: Lane; right: Lane }> = {
  N: { left: 'E', right: 'W' },
  S: { left: 'W', right: 'E' },
  E: { left: 'S', right: 'N' },
  W: { left: 'N', right: 'S' },
};

type TurnChoice = 'straight' | 'left' | 'right';

const OPPOSITE_LANE: Record<Lane, Lane> = {
  N: 'S',
  S: 'N',
  E: 'W',
  W: 'E',
};

interface TurnState {
  fromLane: Lane;
  toLane: Lane;
  centerX: number;
  centerZ: number;
  progress: number;
  duration: number;
  fromX: number;
  fromZ: number;
  toX: number;
  toZ: number;
  fromRot: number;
  toRot: number;
}

type Lane = ApproachLane;

function primaryLaneOffset(lane: Lane) {
  return LANE_POSITIONS[lane][0];
}

function getLaneConfig(lane: string, laneIndex: number = 0) {
  const laneOffset = LANE_POSITIONS[lane as keyof typeof LANE_POSITIONS][laneIndex];
  switch (lane) {
    case 'N': return { axis: 'z' as const, dir: -1, pos: [laneOffset, 0, 0] as [number, number, number], rot: Math.PI, pullDir: 1 };
    case 'S': return { axis: 'z' as const, dir: 1, pos: [laneOffset, 0, 0] as [number, number, number], rot: 0, pullDir: -1 };
    case 'E': return { axis: 'x' as const, dir: 1, pos: [0, 0, laneOffset] as [number, number, number], rot: Math.PI / 2, pullDir: 1 };
    case 'W': return { axis: 'x' as const, dir: -1, pos: [0, 0, laneOffset] as [number, number, number], rot: -Math.PI / 2, pullDir: -1 };
    default: return { axis: 'z' as const, dir: 1, pos: [0, 0, 0] as [number, number, number], rot: 0, pullDir: 1 };
  }
}

function getDistanceToNextSignal(position: number, dir: number): number | null {
  let min = Infinity;
  for (const line of SIGNAL_LINES) {
    const delta = (line - position) * dir;
    if (delta > 0 && delta < min) min = delta;
  }
  return Number.isFinite(min) ? min : null;
}

function nearestIntersectionAxis(value: number): number {
  let closest = SIGNAL_LINES[0];
  let minDist = Infinity;
  for (const line of SIGNAL_LINES) {
    const dist = Math.abs(value - line);
    if (dist < minDist) {
      minDist = dist;
      closest = line;
    }
  }
  return closest;
}

function lerpAngle(a: number, b: number, t: number): number {
  let delta = b - a;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return a + delta * t;
}

function getLaneForwardVector(lane: Lane): [number, number] {
  switch (lane) {
    case 'N':
      return [0, -1];
    case 'S':
      return [0, 1];
    case 'E':
      return [1, 0];
    case 'W':
    default:
      return [-1, 0];
  }
}

function projectPointAfterIntersection(centerX: number, centerZ: number, lane: Lane, distance = ROUTE_LOOKAHEAD_DISTANCE): [number, number] {
  const laneCfg = getLaneConfig(lane);
  if (laneCfg.axis === 'x') {
    return [centerX + laneCfg.dir * distance, centerZ + laneCfg.pos[2]];
  }
  return [centerX + laneCfg.pos[0], centerZ + laneCfg.dir * distance];
}

function chooseLaneTowardHospital(
  currentLane: Lane,
  centerX: number,
  centerZ: number,
  hospitalX: number,
  hospitalZ: number,
): Lane {
  const candidates: Lane[] = [currentLane, TURN_MAP[currentLane].left, TURN_MAP[currentLane].right];
  let bestLane = currentLane;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    if (candidate === OPPOSITE_LANE[currentLane]) continue;
    const [px, pz] = projectPointAfterIntersection(centerX, centerZ, candidate);
    const distSq = (hospitalX - px) ** 2 + (hospitalZ - pz) ** 2;

    const [fx, fz] = getLaneForwardVector(candidate);
    const toHospitalX = hospitalX - centerX;
    const toHospitalZ = hospitalZ - centerZ;
    const headingDot = fx * toHospitalX + fz * toHospitalZ;
    const wrongHeadingPenalty = headingDot < 0 ? Math.abs(headingDot) * 2 : 0;

    const score = distSq + wrongHeadingPenalty;
    if (score < bestScore) {
      bestScore = score;
      bestLane = candidate;
    }
  }

  return bestLane;
}

export function RealisticAmbulanceMoving({
  active,
  direction,
  hospitalTarget,
  hospitalApproachPoint,
  hospitalTerminalPoint,
  onApproachIntersection,
  onPassedIntersection,
  onPositionUpdate,
  onRouteDecision,
  getSignalForLane
}: RealisticAmbulanceMovingProps) {
  const groupRef = useRef<THREE.Group>(null);
  const laneRef = useRef<Lane>(direction === 'NS' ? 'N' : 'E');
  const configRef = useRef(getLaneConfig(direction === 'NS' ? 'N' : 'E'));
  const speedRef = useRef(BASE_AMBULANCE_SPEED);
  const triggeredRef = useRef(false);
  const passedRef = useRef(false);
  const activeTimeRef = useRef(0);
  const turnRef = useRef<TurnState | null>(null);
  const lastTurnLineRef = useRef<number | null>(null);
  const lastTurnChoiceRef = useRef<TurnChoice>('straight');
  const minDistToHospitalRef = useRef(Infinity);
  const hospitalReachedRef = useRef(false);
  const finalApproachRef = useRef(false);
  const connectorEntryReachedRef = useRef(false);
  const connectorTerminalReachedRef = useRef(false);
  const pendingStraightCommitRef = useRef<{
    line: number;
    centerX: number;
    centerZ: number;
    lane: Lane;
  } | null>(null);

  useEffect(() => {
    if (active) {
      const lane = direction === 'NS' ? 'N' : 'E';
      const startPos = direction === 'NS' ? 140 : -140;
      laneRef.current = lane;
      configRef.current = getLaneConfig(lane);
      triggeredRef.current = false;
      passedRef.current = false;
      activeTimeRef.current = 0;
      speedRef.current = BASE_AMBULANCE_SPEED;
      turnRef.current = null;
      lastTurnLineRef.current = null;
      lastTurnChoiceRef.current = 'straight';
      minDistToHospitalRef.current = Infinity;
      hospitalReachedRef.current = false;
      finalApproachRef.current = false;
      connectorEntryReachedRef.current = false;
      connectorTerminalReachedRef.current = false;
      pendingStraightCommitRef.current = null;

      // Initialize transform once on spawn; avoid declarative position props that can
      // reset movement state on parent re-renders.
      if (groupRef.current) {
        if (direction === 'NS') {
          groupRef.current.position.set(primaryLaneOffset('N'), 0, 140);
          groupRef.current.rotation.set(0, Math.PI, 0);
        } else {
          groupRef.current.position.set(-140, 0, primaryLaneOffset('E'));
          groupRef.current.rotation.set(0, Math.PI / 2, 0);
        }
      }

      // Publish ambulance as emergency-only marker for nearby civilian reactions.
      const startX = direction === 'NS' ? primaryLaneOffset('N') : -140;
      const startZ = direction === 'NS' ? 140 : primaryLaneOffset('E');
      vehicleManager.register(AMB_ID, lane, startPos, true, startX, startZ);
    } else {
      vehicleManager.unregister(AMB_ID);
    }
    return () => vehicleManager.unregister(AMB_ID);
  }, [active, direction]);

  useFrame((_, dt) => {
    if (!groupRef.current || !active) return;

    const pos = groupRef.current.position;
    const [hospitalX, hospitalZ] = hospitalTarget;
    const [approachX, approachZ] = hospitalApproachPoint;
    const [terminalX, terminalZ] = hospitalTerminalPoint;

    // Stage 1: reach hospital road approach point.
    const approachDist = Math.sqrt((pos.x - approachX) ** 2 + (pos.z - approachZ) ** 2);
    const APPROACH_POINT_THRESHOLD = 8;

    if (!finalApproachRef.current) {
      if (approachDist < minDistToHospitalRef.current) {
        minDistToHospitalRef.current = approachDist;
        if (approachDist <= APPROACH_POINT_THRESHOLD) {
          hospitalReachedRef.current = true;
          finalApproachRef.current = true;
          connectorEntryReachedRef.current = false;
          turnRef.current = null;
          pendingStraightCommitRef.current = null;
        }
      }
    }

    // Stage 2: follow connector road to hospital entry and terminate there.
    if (finalApproachRef.current) {
      const connectorEntryX = terminalX;
      const connectorDirection = Math.sign(terminalZ - approachZ) || 1;
      const connectorEntryZ = approachZ + connectorDirection * 2;

      const entryDx = connectorEntryX - pos.x;
      const entryDz = connectorEntryZ - pos.z;
      const entryDist = Math.sqrt(entryDx * entryDx + entryDz * entryDz);

      if (!connectorEntryReachedRef.current && entryDist <= 1.25) {
        connectorEntryReachedRef.current = true;
      }

      const terminalDx = terminalX - pos.x;
      const terminalDz = terminalZ - pos.z;
      const terminalDist = Math.sqrt(terminalDx * terminalDx + terminalDz * terminalDz);
      if (connectorEntryReachedRef.current && !connectorTerminalReachedRef.current && terminalDist <= 1.2) {
        connectorTerminalReachedRef.current = true;
      }

      const targetX = !connectorEntryReachedRef.current
        ? connectorEntryX
        : !connectorTerminalReachedRef.current
        ? terminalX
        : hospitalX;
      const targetZ = !connectorEntryReachedRef.current
        ? connectorEntryZ
        : !connectorTerminalReachedRef.current
        ? terminalZ
        : hospitalZ;
      const dx = targetX - pos.x;
      const dz = targetZ - pos.z;
      const targetDist = Math.sqrt(dx * dx + dz * dz);

      const hospitalDx = hospitalX - pos.x;
      const hospitalDz = hospitalZ - pos.z;
      const hospitalDist = Math.sqrt(hospitalDx * hospitalDx + hospitalDz * hospitalDz);

      if (connectorTerminalReachedRef.current && hospitalDist <= HOSPITAL_ARRIVAL_RADIUS && !passedRef.current) {
        passedRef.current = true;
        vehicleManager.unregister(AMB_ID);
        onPassedIntersection();
        return;
      }

      const finalApproachSpeed = MAX_AMBULANCE_SPEED;
      const step = finalApproachSpeed * dt;
      const invLen = targetDist > 0 ? 1 / targetDist : 0;
      const dirX = dx * invLen;
      const dirZ = dz * invLen;
      const move = Math.min(step, targetDist);
      pos.x += dirX * move;
      pos.z += dirZ * move;

      // Keep the connector segment visually straight by holding X close to the driveway center.
      if (connectorEntryReachedRef.current && !connectorTerminalReachedRef.current) {
        pos.x = THREE.MathUtils.lerp(pos.x, terminalX, 0.2);
      }

      const targetRot = Math.atan2(dirX, dirZ);
      groupRef.current.rotation.y = lerpAngle(groupRef.current.rotation.y, targetRot, 0.22);

      const axisPos = configRef.current.axis === 'z' ? pos.z : pos.x;
      vehicleManager.updateState(AMB_ID, laneRef.current, axisPos, pos.x, pos.z);
      onPositionUpdate?.(laneRef.current, pos.x, pos.z);
      return;
    }

    const config = configRef.current;
    const currentLane = laneRef.current;
    const currentPos = config.axis === 'z' ? pos.z : pos.x;

    if (turnRef.current) {
      const turn = turnRef.current;
      turn.progress = Math.min(1, turn.progress + dt / turn.duration);
      const eased = THREE.MathUtils.smoothstep(turn.progress, 0, 1);
      pos.x = THREE.MathUtils.lerp(turn.fromX, turn.toX, eased);
      pos.z = THREE.MathUtils.lerp(turn.fromZ, turn.toZ, eased);
      groupRef.current.rotation.y = lerpAngle(turn.fromRot, turn.toRot, eased);

      const turnCfg = getLaneConfig(turn.toLane);
      const axisPos = turnCfg.axis === 'z' ? pos.z : pos.x;
      vehicleManager.updateState(AMB_ID, turn.toLane, axisPos, pos.x, pos.z);
      onPositionUpdate?.(turn.toLane, pos.x, pos.z);

      if (turn.progress >= 1) {
        laneRef.current = turn.toLane;
        configRef.current = turnCfg;
        onRouteDecision?.(turn.centerX, turn.centerZ, turn.toLane);
        turnRef.current = null;
      }
      return;
    }

    onPositionUpdate?.(currentLane, pos.x, pos.z);
    const activeSignal = getSignalForLane(currentLane, currentPos, pos.x, pos.z);

    // Normal movement on same lane
    const distToSignal = getDistanceToNextSignal(currentPos, config.dir);
    const remainingToStopLine = distToSignal !== null ? distToSignal - STOP_LINE_DISTANCE : null;

    if (pendingStraightCommitRef.current) {
      const pending = pendingStraightCommitRef.current;
      const progressedPastLine = (currentPos - pending.line) * config.dir > 7;
      if (progressedPastLine) {
        onRouteDecision?.(pending.centerX, pending.centerZ, pending.lane);
        pendingStraightCommitRef.current = null;
      }
    }

    // Random route choice at each intersection while entering on green.
    const nearestSignalLine = SIGNAL_LINES.find((line) => Math.abs(currentPos - line) < 1.2) ?? null;
    const closestSignalDistance = Math.min(...SIGNAL_LINES.map((line) => Math.abs(currentPos - line)));
    if (nearestSignalLine === null && closestSignalDistance > 8) {
      lastTurnLineRef.current = null;
    }

    if (
      activeSignal === 'green' &&
      nearestSignalLine !== null &&
      lastTurnLineRef.current !== nearestSignalLine
    ) {
      lastTurnLineRef.current = nearestSignalLine;

      const intersectionCenterX = config.axis === 'x' ? nearestSignalLine : nearestIntersectionAxis(pos.x);
      const intersectionCenterZ = config.axis === 'z' ? nearestSignalLine : nearestIntersectionAxis(pos.z);

      let nextLane: Lane;

      // Route ambulance toward hospital location among buildings (135, 75)
nextLane = chooseLaneTowardHospital(currentLane, intersectionCenterX, intersectionCenterZ, approachX, approachZ);

      const selectedChoice: TurnChoice =
        nextLane === currentLane
          ? 'straight'
          : nextLane === TURN_MAP[currentLane].left
          ? 'left'
          : 'right';

      // Extra safety: never allow direct reverse direction lane target.
      if (nextLane === OPPOSITE_LANE[currentLane]) {
        nextLane = currentLane;
      }
      lastTurnChoiceRef.current = nextLane === currentLane ? 'straight' : selectedChoice;

      if (nextLane !== currentLane) {
        const nextConfig = getLaneConfig(nextLane);
        // Compute local target around the current intersection center to avoid
        // jumping to center-grid coordinates when turning on outer intersections.
        const nextAxisPos = nextConfig.dir * 2.2;
        const targetX = nextConfig.axis === 'z'
          ? intersectionCenterX + nextConfig.pos[0]
          : intersectionCenterX + nextAxisPos;
        const targetZ = nextConfig.axis === 'z'
          ? intersectionCenterZ + nextAxisPos
          : intersectionCenterZ + nextConfig.pos[2];

        turnRef.current = {
          fromLane: currentLane,
          toLane: nextLane,
          centerX: intersectionCenterX,
          centerZ: intersectionCenterZ,
          progress: 0,
          duration: TURN_DURATION,
          fromX: pos.x,
          fromZ: pos.z,
          toX: targetX,
          toZ: targetZ,
          fromRot: groupRef.current.rotation.y,
          toRot: nextConfig.rot,
        };
        return;
      } else {
        pendingStraightCommitRef.current = {
          line: nearestSignalLine,
          centerX: intersectionCenterX,
          centerZ: intersectionCenterZ,
          lane: nextLane,
        };
      }
    }
    
    // Non-interactive ambulance: ignore all other vehicles and keep course.
    let targetSpeed = MAX_AMBULANCE_SPEED;

    // For red/yellow: keep moving until near the stop line, then brake.
    if (activeSignal !== 'green' && remainingToStopLine !== null && remainingToStopLine >= 0) {
      if (remainingToStopLine <= STOP_APPROACH_DISTANCE) {
        targetSpeed = Math.min(targetSpeed, Math.max(0, remainingToStopLine * 1.8));
      }
    }

    // Smooth speed adjustment
    const adjustRate = targetSpeed < speedRef.current ? 0.25 : 0.12;
    speedRef.current = THREE.MathUtils.lerp(speedRef.current, targetSpeed, adjustRate);

    // Failsafe lifetime (separate from hospital termination).
    if (speedRef.current > 0.2) {
      activeTimeRef.current += dt;
    }
    if (activeTimeRef.current >= MAX_ACTIVE_SECONDS && !passedRef.current) {
      passedRef.current = true;
      vehicleManager.unregister(AMB_ID);
      onPassedIntersection();
      return;
    }

    // Update position and clamp at stop line on non-green.
    let moveMagnitude = speedRef.current * dt;
    if (activeSignal !== 'green' && remainingToStopLine !== null && remainingToStopLine >= 0) {
      moveMagnitude = Math.min(moveMagnitude, Math.max(0, remainingToStopLine));
    }
    const move = moveMagnitude * config.dir;
    if (config.axis === 'z') {
      pos.z += move;
    } else {
      pos.x += move;
    }

    const updatedPos = config.axis === 'z' ? pos.z : pos.x;
    vehicleManager.updateState(AMB_ID, currentLane, updatedPos, pos.x, pos.z);

    // Check if approaching intersection
    if (pos.z < 40 && !triggeredRef.current && direction === 'NS') {
      triggeredRef.current = true;
      onApproachIntersection();
    }
    if (pos.x > -40 && !triggeredRef.current && direction === 'EW') {
      triggeredRef.current = true;
      onApproachIntersection();
    }

    // Check if passed scene bounds
    const hasExited = Math.abs(pos.x) > EXIT_DISTANCE || Math.abs(pos.z) > EXIT_DISTANCE;
    
    if (hasExited && !passedRef.current) {
      passedRef.current = true;
      vehicleManager.unregister(AMB_ID);
      onPassedIntersection();
    }

  });
  if (!active) {
    triggeredRef.current = false;
    passedRef.current = false;
  }

  if (!active) return null;

  return (
    <group ref={groupRef}>
      <RealisticAmbulance />
    </group>
  );
}
