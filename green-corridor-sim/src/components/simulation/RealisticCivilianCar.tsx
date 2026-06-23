import { RealisticCar } from '@/components/vehicles/RealisticCar';
import type { ApproachLane, SignalState } from '@/simulation/TrafficController';
import { vehicleManager } from '@/simulation/VehicleManager';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { LANE_POSITIONS } from './Road';

interface RealisticCivilianCarProps {
  lane: ApproachLane;
  offset: number;
  getSignalForLane: (lane: ApproachLane, position?: number) => SignalState;
  laneIndex: number; // 0 or 1 for inner/outer lane
  emergencyYield: boolean;
  color?: number;
}

type Lane = ApproachLane;

interface TurnState {
  fromLane: Lane;
  toLane: Lane;
  progress: number;
  duration: number;
  fromX: number;
  fromZ: number;
  toX: number;
  toZ: number;
  fromRot: number;
  toRot: number;
}

const SPEED = 6.0;
const ROAD_HALF = 200; // Increased from 150 for even longer roads
const MIN_FOLLOW_DIST = 14; // Larger gap to avoid overlaps in denser traffic
const PULL_OVER_DIST = 2.2;
const SIGNAL_LINES = [-100, 0, 100]; // Updated to match SECONDARY_OFFSETS [100, -100]
const CROSSWALK_DISTANCE = 14; // Crosswalks are 14 units from intersection center
const STOP_LINE_DISTANCE = 17; // Stop line is 3 units before crosswalk
const LANE_OPTIONS: Array<Lane> = ['N', 'S', 'E', 'W'];
const TURN_MAP: Record<Lane, { left: Lane; right: Lane }> = {
  N: { left: 'E', right: 'W' },
  S: { left: 'W', right: 'E' },
  E: { left: 'S', right: 'N' },
  W: { left: 'N', right: 'S' },
};

function getLaneConfig(lane: string, laneIndex: number) {
  const laneOffset = LANE_POSITIONS[lane as keyof typeof LANE_POSITIONS][laneIndex];
  switch (lane) {
    case 'N': return { axis: 'z' as const, dir: -1, pos: [laneOffset, 0, 0] as [number, number, number], rot: Math.PI, pullDir: 1 };
    case 'S': return { axis: 'z' as const, dir: 1, pos: [laneOffset, 0, 0] as [number, number, number], rot: 0, pullDir: -1 };
    case 'E': return { axis: 'x' as const, dir: 1, pos: [0, 0, laneOffset] as [number, number, number], rot: Math.PI / 2, pullDir: 1 };
    case 'W': return { axis: 'x' as const, dir: -1, pos: [0, 0, laneOffset] as [number, number, number], rot: -Math.PI / 2, pullDir: -1 };
    default: return { axis: 'z' as const, dir: 1, pos: [0, 0, 0] as [number, number, number], rot: 0, pullDir: 1 };
  }
}

const CAR_COLORS = [
  0x3366AA, // Blue
  0xAA3333, // Red
  0x33AA55, // Green
  0x8855CC, // Purple
  0xCC8833, // Orange
  0x3399AA, // Cyan
  0x666666, // Gray
  0xBB4444, // Crimson
  0x2C5F2D, // Dark Green
  0x1E40AF, // Dark Blue
  0x7C2D12, // Brown
  0xFFD700, // Gold
];

export function RealisticCivilianCar({ lane, offset, laneIndex, getSignalForLane, emergencyYield, color }: RealisticCivilianCarProps) {
  const groupRef = useRef<THREE.Group>(null);
  const laneRef = useRef<Lane>(lane);
  const laneIndexRef = useRef<number>(laneIndex);
  const configRef = useRef(getLaneConfig(lane, laneIndex));
  const speedRef = useRef(SPEED);
  const pullOverRef = useRef(0);
  const turnRef = useRef<TurnState | null>(null);
  const lastTurnLineRef = useRef<number | null>(null);
  const id = useMemo(() => `rcar-${lane}-${laneIndex}-${offset}`, [lane, laneIndex, offset]);
  const carColor = useMemo(() =>
    color || CAR_COLORS[Math.abs(Math.round(offset * 7)) % CAR_COLORS.length],
    [offset, color]
  );

  useEffect(() => {
    const initialConfig = getLaneConfig(lane, laneIndex);
    const startX = initialConfig.axis === 'z' ? initialConfig.pos[0] : offset;
    const startZ = initialConfig.axis === 'z' ? offset : initialConfig.pos[2];
    vehicleManager.register(id, lane, offset, false, startX, startZ);
    return () => vehicleManager.unregister(id);
  }, [id, lane, laneIndex, offset]);

  const getDistanceToNextSignal = (position: number, dir: number) => {
    let min = Infinity;
    for (const line of SIGNAL_LINES) {
      const delta = (line - position) * dir;
      if (delta > 0 && delta < min) min = delta;
    }
    return Number.isFinite(min) ? min : null;
  };

  const chooseNextLane = (selfId: string, current: Lane) => {
    const shuffled = [...LANE_OPTIONS].sort(() => Math.random() - 0.5);
    const candidates = [current, ...shuffled.filter((l) => l !== current)];
    for (const nextLane of candidates) {
      const nextConfig = getLaneConfig(nextLane, laneIndexRef.current);
      const spawnPos = -nextConfig.dir * (ROAD_HALF - 2);
      if (!vehicleManager.hasVehicleNear(nextLane, spawnPos, MIN_FOLLOW_DIST * 3, selfId)) {
        return nextLane;
      }
    }
    return current;
  };

  const pickTurnLane = (current: Lane) => {
    const roll = Math.random();
    if (roll < 0.5) return current; // straight
    if (roll < 0.75) return TURN_MAP[current].left;
    return TURN_MAP[current].right;
  };

  useFrame((_, dt) => {
    if (!groupRef.current) return;

    const pos = groupRef.current.position;
    const config = configRef.current;
    const currentLane = laneRef.current;
    const currentPos = config.axis === 'z' ? pos.z : pos.x;
    // Pass current position so lane signals map to the nearest intersection.
    const activeSignal: SignalState = getSignalForLane(currentLane, currentPos);
    const distToSignal = getDistanceToNextSignal(currentPos, config.dir);
    const remainingToStopLine = distToSignal !== null ? distToSignal - STOP_LINE_DISTANCE : null;

    if (turnRef.current) {
      const turn = turnRef.current;
      turn.progress = Math.min(1, turn.progress + dt / turn.duration);
      const eased = THREE.MathUtils.smoothstep(turn.progress, 0, 1);
      pos.x = THREE.MathUtils.lerp(turn.fromX, turn.toX, eased);
      pos.z = THREE.MathUtils.lerp(turn.fromZ, turn.toZ, eased);
      groupRef.current.rotation.y = THREE.MathUtils.lerp(turn.fromRot, turn.toRot, eased);

      const turnCfg = getLaneConfig(turn.toLane, laneIndexRef.current);
      const axisPos = turnCfg.axis === 'z' ? pos.z : pos.x;
      vehicleManager.updateState(id, turn.toLane, axisPos, pos.x, pos.z);

      if (turn.progress >= 1) {
        turnRef.current = null;
        pullOverRef.current = 0;
      }
      return;
    }

    vehicleManager.updateState(id, currentLane, currentPos, pos.x, pos.z);

    const emergencyBehind = vehicleManager.isEmergencyNearby(currentLane, currentPos);
    const distAhead = vehicleManager.getDistanceToVehicleAhead(id, currentLane, currentPos, config.dir);
    const tooClose = distAhead < MIN_FOLLOW_DIST;

    // Pull-over: smoothly move to the side more aggressively for ambulance
    const targetPull = emergencyBehind ? PULL_OVER_DIST : 0;
    pullOverRef.current = THREE.MathUtils.lerp(pullOverRef.current, targetPull, emergencyBehind ? 0.1 : 0.06);

    if (config.axis === 'z') {
      pos.x = config.pos[0] + pullOverRef.current * config.pullDir;
    } else {
      pos.z = config.pos[2] + pullOverRef.current * config.pullDir;
    }

    // Target-speed approach to avoid late stopping and reduce collisions
    let targetSpeed = SPEED;

    if (emergencyBehind) {
      // When ambulance is nearby, increase speed to move ahead quickly, then pull over
      targetSpeed = SPEED * 1.5; // Go faster to clear the way
    } else {
      const shouldStopForNonGreen = activeSignal !== 'green' && remainingToStopLine !== null && remainingToStopLine >= 0 && remainingToStopLine <= 8;
      const criticallyClose = distAhead < MIN_FOLLOW_DIST * 0.5;

      if (shouldStopForNonGreen && distToSignal !== null && distToSignal <= STOP_LINE_DISTANCE + 2) {
        targetSpeed = 0; // full stop at the stop line
      }

      if (shouldStopForNonGreen && remainingToStopLine !== null && remainingToStopLine >= 0 && remainingToStopLine <= 0.15) {
        targetSpeed = 0;
      }

      if (criticallyClose) {
        targetSpeed = 0; // emergency brake to prevent collision
      } else if (tooClose) {
        targetSpeed = Math.min(targetSpeed, Math.max(0, (distAhead - 1) * 0.9));
      }
    }

    const adjustRate = targetSpeed < speedRef.current ? 0.35 : 0.08;
    speedRef.current = THREE.MathUtils.lerp(speedRef.current, targetSpeed, adjustRate);

    const nearestSignalLine = SIGNAL_LINES.find((line) => Math.abs(currentPos - line) < 1.2) ?? null;
    const closestSignalDistance = Math.min(...SIGNAL_LINES.map((line) => Math.abs(currentPos - line)));
    if (nearestSignalLine === null && closestSignalDistance > 8) {
      lastTurnLineRef.current = null;
    }

    if (nearestSignalLine !== null &&
      lastTurnLineRef.current !== nearestSignalLine &&
      activeSignal === 'green' &&
      !tooClose
    ) {
      lastTurnLineRef.current = nearestSignalLine;
      const nextLane = pickTurnLane(currentLane);
      if (nextLane !== currentLane) {
        const nextConfig = getLaneConfig(nextLane, laneIndexRef.current);
        const nextAxisPos = nearestSignalLine + nextConfig.dir * 2.2;
        if (!vehicleManager.hasVehicleNear(nextLane, nextAxisPos, MIN_FOLLOW_DIST * 3.2, id)) {
          const targetX = nextConfig.axis === 'z' ? nextConfig.pos[0] : nextAxisPos;
          const targetZ = nextConfig.axis === 'z' ? nextAxisPos : nextConfig.pos[2];
          turnRef.current = {
            fromLane: currentLane,
            toLane: nextLane,
            progress: 0,
            duration: 0.85,
            fromX: pos.x,
            fromZ: pos.z,
            toX: targetX,
            toZ: targetZ,
            fromRot: groupRef.current.rotation.y,
            toRot: nextConfig.rot,
          };
          laneRef.current = nextLane;
          configRef.current = nextConfig;
          vehicleManager.updateState(id, nextLane, nextAxisPos, pos.x, pos.z);
        }
      }
    }

    const activeConfig = configRef.current;
    let moveMagnitude = Math.max(0, speedRef.current) * dt;

    // Hard-stop at non-green stop line so vehicles only enter on green.
    if (activeSignal !== 'green' && remainingToStopLine !== null && remainingToStopLine >= 0) {
      moveMagnitude = Math.min(moveMagnitude, Math.max(0, remainingToStopLine));
    }

    const move = moveMagnitude * activeConfig.dir;
    if (activeConfig.axis === 'z') {
      pos.z += move;
      if (Math.abs(pos.z) > ROAD_HALF) {
        const nextLane = chooseNextLane(id, currentLane);
        laneRef.current = nextLane;
        const nextConfig = getLaneConfig(nextLane, laneIndexRef.current);
        configRef.current = nextConfig;
        const spawnPos = -nextConfig.dir * (ROAD_HALF - 2);
        pos.x = nextConfig.pos[0];
        pos.z = spawnPos;
        groupRef.current.rotation.y = nextConfig.rot;
        pullOverRef.current = 0;
        vehicleManager.updateState(id, nextLane, spawnPos, pos.x, pos.z);
      }
    } else {
      pos.x += move;
      if (Math.abs(pos.x) > ROAD_HALF) {
        const nextLane = chooseNextLane(id, currentLane);
        laneRef.current = nextLane;
        const nextConfig = getLaneConfig(nextLane, laneIndexRef.current);
        configRef.current = nextConfig;
        const spawnPos = -nextConfig.dir * (ROAD_HALF - 2);
        pos.x = spawnPos;
        pos.z = nextConfig.pos[2];
        groupRef.current.rotation.y = nextConfig.rot;
        pullOverRef.current = 0;
        vehicleManager.updateState(id, nextLane, spawnPos, pos.x, pos.z);
      }
    }
  });

  const initialConfig = configRef.current;
  const startPos: [number, number, number] = [...initialConfig.pos];
  if (initialConfig.axis === 'z') startPos[2] = offset;
  else startPos[0] = offset;

  return (
    <group ref={groupRef} position={startPos} rotation={[0, initialConfig.rot, 0]}>
      <RealisticCar
        position={[0, 0, 0]}
        rotation={[0, 0, 0]}
        color={carColor}
        scale={1.5}
        animated={false}
      />
    </group>
  );
}
