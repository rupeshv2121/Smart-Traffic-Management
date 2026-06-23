import { useRef, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { SignalState } from '@/simulation/TrafficController';
import { vehicleManager } from '@/simulation/VehicleManager';

interface CivilianCarProps {
  lane: 'N' | 'S' | 'E' | 'W';
  offset: number;
  signal: SignalState;
  emergencyYield: boolean;
}

const SPEED = 8;
const ROAD_HALF = 90;
const LANE_OFFSET = 2;
const MIN_FOLLOW_DIST = 6;
const PULL_OVER_DIST = 2.2;

function getLaneConfig(lane: string) {
  switch (lane) {
    case 'N': return { axis: 'z' as const, dir: -1, pos: [LANE_OFFSET, 0.6, 0] as [number, number, number], rot: Math.PI, pullDir: 1 };
    case 'S': return { axis: 'z' as const, dir: 1, pos: [-LANE_OFFSET, 0.6, 0] as [number, number, number], rot: 0, pullDir: -1 };
    case 'E': return { axis: 'x' as const, dir: 1, pos: [0, 0.6, LANE_OFFSET] as [number, number, number], rot: Math.PI / 2, pullDir: 1 };
    case 'W': return { axis: 'x' as const, dir: -1, pos: [0, 0.6, -LANE_OFFSET] as [number, number, number], rot: -Math.PI / 2, pullDir: -1 };
    default: return { axis: 'z' as const, dir: 1, pos: [0, 0.6, 0] as [number, number, number], rot: 0, pullDir: 1 };
  }
}

const CAR_COLORS = [0x3366AA, 0xAA3333, 0x33AA55, 0x8855CC, 0xCC8833, 0x3399AA, 0x666666, 0xBB4444];

export function CivilianCar({ lane, offset, signal, emergencyYield }: CivilianCarProps) {
  const ref = useRef<THREE.Group>(null);
  const config = getLaneConfig(lane);
  const speedRef = useRef(SPEED);
  const pullOverRef = useRef(0);
  const id = useMemo(() => `car-${lane}-${offset}`, [lane, offset]);
  const color = useMemo(() => CAR_COLORS[Math.abs(Math.round(offset * 7)) % CAR_COLORS.length], [offset]);

  useEffect(() => {
    vehicleManager.register(id, lane, offset);
    return () => vehicleManager.unregister(id);
  }, [id, lane, offset]);

  useFrame((_, dt) => {
    if (!ref.current) return;

    const pos = ref.current.position;
    const currentPos = config.axis === 'z' ? pos.z : pos.x;
    const distToCenter = Math.abs(currentPos);

    vehicleManager.update(id, currentPos);

    const emergencyBehind = vehicleManager.isEmergencyNearby(lane, currentPos);
    const distAhead = vehicleManager.getDistanceToVehicleAhead(id, lane, currentPos, config.dir);
    const tooClose = distAhead < MIN_FOLLOW_DIST;

    // Pull-over: smoothly move to the side
    const targetPull = emergencyBehind ? PULL_OVER_DIST : 0;
    pullOverRef.current = THREE.MathUtils.lerp(pullOverRef.current, targetPull, 0.06);

    if (config.axis === 'z') {
      pos.x = config.pos[0] + pullOverRef.current * config.pullDir;
    } else {
      pos.z = config.pos[2] + pullOverRef.current * config.pullDir;
    }

    if (emergencyBehind) {
      // Slow down and pull over to let ambulance pass
      speedRef.current = THREE.MathUtils.lerp(speedRef.current, SPEED * 0.2, 0.06);
    } else {
      const shouldStopForLight = signal === 'red' && distToCenter > 8 && distToCenter < 15;
      const shouldStop = shouldStopForLight || tooClose;

      if (shouldStop) {
        speedRef.current *= tooClose ? 0.85 : 0.92;
      } else {
        speedRef.current = THREE.MathUtils.lerp(speedRef.current, SPEED, 0.02);
      }
    }

    const move = speedRef.current * dt * config.dir;
    if (config.axis === 'z') {
      pos.z += move;
      if (Math.abs(pos.z) > ROAD_HALF) pos.z = -pos.z * 0.99;
    } else {
      pos.x += move;
      if (Math.abs(pos.x) > ROAD_HALF) pos.x = -pos.x * 0.99;
    }
  });

  const startPos: [number, number, number] = [...config.pos];
  if (config.axis === 'z') startPos[2] = offset;
  else startPos[0] = offset;

  return (
    <group ref={ref} position={startPos} rotation={[0, config.rot, 0]}>
      <mesh castShadow>
        <boxGeometry args={[1.8, 1.0, 4]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.7, -0.3]} castShadow>
        <boxGeometry args={[1.5, 0.7, 2]} />
        <meshStandardMaterial color={0x3A3A3F} roughness={0.8} />
      </mesh>
      <mesh position={[0.6, 0, 2.05]}>
        <sphereGeometry args={[0.12, 8, 8]} />
        <meshLambertMaterial emissive={0xFFFFCC} emissiveIntensity={1.5} color={0x000000} />
      </mesh>
      <mesh position={[-0.6, 0, 2.05]}>
        <sphereGeometry args={[0.12, 8, 8]} />
        <meshLambertMaterial emissive={0xFFFFCC} emissiveIntensity={1.5} color={0x000000} />
      </mesh>
    </group>
  );
}
