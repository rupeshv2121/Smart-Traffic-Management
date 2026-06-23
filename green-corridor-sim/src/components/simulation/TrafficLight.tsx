import type { SignalState } from '@/simulation/TrafficController';
import { Billboard, Text } from '@react-three/drei';
import { useRef } from 'react';
import * as THREE from 'three';

interface TrafficLightProps {
  position: [number, number, number];
  signal: SignalState;
  timeRemaining?: number | null;
  queueCount?: number;
  ambulanceDetected?: boolean;
  rotation?: number; // Y-axis rotation in radians to face the road
}

export function TrafficLight({
  position,
  signal,
  timeRemaining = null,
  queueCount = 0,
  ambulanceDetected = false,
  rotation = 0,
}: TrafficLightProps) {
  const lightRef = useRef<THREE.PointLight>(null);
  const color = signal === 'green' ? 0x00FF80 : signal === 'yellow' ? 0xFFC800 : 0xFF0000;
  const timerLabel =
    timeRemaining !== null ? `${Math.max(0, Math.ceil(timeRemaining))}s` : '--';
  const timerColor = signal === 'green' ? '#00FF80' : signal === 'yellow' ? '#FFC800' : '#FF4D4D';
  const ambulanceLabel = ambulanceDetected ? 'AMBULANCE' : 'CLEAR';
  const ambulanceColor = ambulanceDetected ? '#FF3B30' : '#8EE58E';

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Floating overhead timing display */}
      <Billboard position={[0, 8.05, 0]} follow lockX={false} lockY={false} lockZ={false}>
        <mesh position={[0, 0, -0.01]}>
          <planeGeometry args={[3.0, 1.75]} />
          <meshStandardMaterial color={0x0F0F0F} transparent opacity={0.82} />
        </mesh>
        <Text
          position={[0, 0.45, 0]}
          fontSize={0.46}
          color={timerColor}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.028}
          outlineColor="#000000"
        >
          {timerLabel}
        </Text>
        <Text
          position={[0, -0.02, 0]}
          fontSize={0.3}
          color="#FFFFFF"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.018}
          outlineColor="#000000"
        >
          {`Q: ${queueCount}`}
        </Text>
        <Text
          position={[0, -0.47, 0]}
          fontSize={0.27}
          color={ambulanceColor}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.018}
          outlineColor="#000000"
        >
          {ambulanceLabel}
        </Text>
      </Billboard>

      {/* Pole */}
      <mesh position={[0, 2.5, 0]} castShadow>
        <cylinderGeometry args={[0.15, 0.15, 5, 8]} />
        <meshStandardMaterial color={0x1A1A1B} roughness={0.8} metalness={0.3} />
      </mesh>

      {/* Housing */}
      <mesh position={[0, 5.2, 0]} castShadow>
        <boxGeometry args={[0.8, 1.6, 0.8]} />
        <meshStandardMaterial color={0x0E0E0E} roughness={0.9} />
      </mesh>

      {/* Red light (top) */}
      <mesh position={[0, 5.6, 0.45]}>
        <sphereGeometry args={[0.22, 16, 16]} />
        <meshLambertMaterial
          emissive={signal === 'red' ? 0xFF0000 : 0x330000}
          emissiveIntensity={signal === 'red' ? 2.5 : 0.2}
          color={0x000000}
        />
      </mesh>

      {/* Yellow light (middle) */}
      <mesh position={[0, 5.2, 0.45]}>
        <sphereGeometry args={[0.22, 16, 16]} />
        <meshLambertMaterial
          emissive={signal === 'yellow' ? 0xFFC800 : 0x332200}
          emissiveIntensity={signal === 'yellow' ? 2.4 : 0.2}
          color={0x000000}
        />
      </mesh>

      {/* Green light (bottom) */}
      <mesh position={[0, 4.8, 0.45]}>
        <sphereGeometry args={[0.22, 16, 16]} />
        <meshLambertMaterial
          emissive={signal === 'green' ? 0x00FF80 : 0x003300}
          emissiveIntensity={signal === 'green' ? 2.5 : 0.2}
          color={0x000000}
        />
      </mesh>

      {/* Point light */}
      <pointLight
        ref={lightRef}
        position={[0, 5, 1]}
        color={color}
        intensity={3}
        distance={15}
        castShadow={false}
      />
    </group>
  );
}
