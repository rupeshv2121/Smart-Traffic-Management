import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Direction } from '@/simulation/TrafficController';
import { vehicleManager } from '@/simulation/VehicleManager';

interface AmbulanceProps {
  active: boolean;
  direction: Direction;
  onApproachIntersection: () => void;
  onPassedIntersection: () => void;
}

const AMBULANCE_SPEED = 12;
const LANE_OFFSET = 2;
const AMB_ID = 'ambulance';

export function Ambulance({ active, direction, onApproachIntersection, onPassedIntersection }: AmbulanceProps) {
  const ref = useRef<THREE.Group>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const triggeredRef = useRef(false);
  const passedRef = useRef(false);

  useEffect(() => {
    if (active) {
      const lane = direction === 'NS' ? 'N' : 'E';
      const startPos = direction === 'NS' ? 60 : -60;
      vehicleManager.register(AMB_ID, lane, startPos, true);
    } else {
      vehicleManager.unregister(AMB_ID);
    }
    return () => vehicleManager.unregister(AMB_ID);
  }, [active, direction]);

  useFrame((_, dt) => {
    if (!ref.current || !active) return;

    const pos = ref.current.position;

    if (direction === 'NS') {
      pos.z -= AMBULANCE_SPEED * dt;
      vehicleManager.update(AMB_ID, pos.z);

      if (pos.z < 40 && !triggeredRef.current) {
        triggeredRef.current = true;
        onApproachIntersection();
      }
      if (pos.z < -40 && !passedRef.current) {
        passedRef.current = true;
        onPassedIntersection();
      }
    } else {
      pos.x += AMBULANCE_SPEED * dt;
      vehicleManager.update(AMB_ID, pos.x);

      if (pos.x > -40 && !triggeredRef.current) {
        triggeredRef.current = true;
        onApproachIntersection();
      }
      if (pos.x > 40 && !passedRef.current) {
        passedRef.current = true;
        onPassedIntersection();
      }
    }

    if (lightRef.current) {
      const flash = Math.sin(Date.now() * 0.02) > 0 ? 0xFF0000 : 0x0044FF;
      lightRef.current.color.setHex(flash);
    }
  });

  if (!active) {
    triggeredRef.current = false;
    passedRef.current = false;
  }

  const startPos: [number, number, number] = direction === 'NS'
    ? [LANE_OFFSET, 0.9, 60]
    : [-60, 0.9, LANE_OFFSET];

  const rotation: [number, number, number] = direction === 'NS'
    ? [0, Math.PI, 0]
    : [0, Math.PI / 2, 0];

  if (!active) return null;

  return (
    <group ref={ref} position={startPos} rotation={rotation}>
      <mesh castShadow>
        <boxGeometry args={[2, 1.6, 4.5]} />
        <meshStandardMaterial color={0xEEEEEE} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.81, 0]}>
        <boxGeometry args={[1.5, 0.02, 0.4]} />
        <meshLambertMaterial emissive={0xFF0000} emissiveIntensity={2} color={0xFF0000} />
      </mesh>
      <mesh position={[0, 0.81, 0]}>
        <boxGeometry args={[0.4, 0.02, 1.5]} />
        <meshLambertMaterial emissive={0xFF0000} emissiveIntensity={2} color={0xFF0000} />
      </mesh>
      <mesh position={[0, 1.05, 0]}>
        <boxGeometry args={[1.8, 0.3, 0.6]} />
        <meshStandardMaterial color={0x222222} roughness={0.6} />
      </mesh>
      <mesh position={[-0.5, 1.25, 0]}>
        <sphereGeometry args={[0.15, 8, 8]} />
        <meshLambertMaterial emissive={0xFF0000} emissiveIntensity={3} color={0x000000} />
      </mesh>
      <mesh position={[0.5, 1.25, 0]}>
        <sphereGeometry args={[0.15, 8, 8]} />
        <meshLambertMaterial emissive={0x0044FF} emissiveIntensity={3} color={0x000000} />
      </mesh>
      <pointLight ref={lightRef} position={[0, 2, 0]} color={0xFF0000} intensity={8} distance={20} />
      <mesh position={[0.7, 0, 2.3]}>
        <sphereGeometry args={[0.15, 8, 8]} />
        <meshLambertMaterial emissive={0xFFFFFF} emissiveIntensity={2} color={0x000000} />
      </mesh>
      <mesh position={[-0.7, 0, 2.3]}>
        <sphereGeometry args={[0.15, 8, 8]} />
        <meshLambertMaterial emissive={0xFFFFFF} emissiveIntensity={2} color={0x000000} />
      </mesh>
    </group>
  );
}
