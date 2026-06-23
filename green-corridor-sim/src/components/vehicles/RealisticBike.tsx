import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';

interface RealisticBikeProps {
  position?: [number, number, number];
  rotation?: [number, number, number];
  color?: number;
  scale?: number;
  animated?: boolean;
}

export function RealisticBike({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  color = 0xFF3333,
  scale = 1,
  animated = false
}: RealisticBikeProps) {
  const groupRef = useRef<THREE.Group>(null);
  const wheelsRef = useRef<THREE.Group[]>([]);

  useFrame((state) => {
    if (animated && groupRef.current) {
      // Subtle floating animation
      groupRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 2) * 0.08;
      groupRef.current.rotation.y = rotation[1] + Math.sin(state.clock.elapsedTime * 0.5) * 0.05;
    }

    // Rotate wheels
    if (animated && wheelsRef.current) {
      wheelsRef.current.forEach(wheel => {
        if (wheel) {
          wheel.rotation.x += 0.15;
        }
      });
    }
  });

  return (
    <group ref={groupRef} position={position} rotation={rotation} scale={scale}>
      {/* Main body/fuel tank */}
      <mesh castShadow position={[0, 0.7, 0]}>
        <boxGeometry args={[0.5, 0.4, 1.2]} />
        <meshStandardMaterial
          color={color}
          roughness={0.2}
          metalness={0.8}
        />
      </mesh>

      {/* Seat */}
      <mesh castShadow position={[0, 0.8, -0.5]}>
        <boxGeometry args={[0.5, 0.15, 0.8]} />
        <meshStandardMaterial color={0x222222} roughness={0.6} />
      </mesh>

      {/* Rear section */}
      <mesh castShadow position={[0, 0.7, -1.1]}>
        <boxGeometry args={[0.45, 0.3, 0.4]} />
        <meshStandardMaterial
          color={color}
          roughness={0.2}
          metalness={0.8}
        />
      </mesh>

      {/* Front forks */}
      <mesh position={[0.15, 0.5, 1.0]}>
        <cylinderGeometry args={[0.03, 0.04, 0.8, 8]} />
        <meshStandardMaterial color={0x333333} roughness={0.3} metalness={0.9} />
      </mesh>
      <mesh position={[-0.15, 0.5, 1.0]}>
        <cylinderGeometry args={[0.03, 0.04, 0.8, 8]} />
        <meshStandardMaterial color={0x333333} roughness={0.3} metalness={0.9} />
      </mesh>

      {/* Handlebar stem */}
      <mesh position={[0, 0.9, 0.8]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.04, 0.04, 0.7, 8]} />
        <meshStandardMaterial color={0x222222} roughness={0.4} metalness={0.8} />
      </mesh>

      {/* Handlebars */}
      <mesh position={[0.35, 0.9, 0.8]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.02, 0.02, 0.15, 8]} />
        <meshStandardMaterial color={0x222222} roughness={0.5} />
      </mesh>
      <mesh position={[-0.35, 0.9, 0.8]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.02, 0.02, 0.15, 8]} />
        <meshStandardMaterial color={0x222222} roughness={0.5} />
      </mesh>

      {/* Headlight */}
      <mesh position={[0, 0.8, 1.1]}>
        <sphereGeometry args={[0.15, 12, 12]} />
        <meshLambertMaterial
          emissive={0xFFFFCC}
          emissiveIntensity={1.8}
          color={0xFFFFFF}
        />
      </mesh>

      {/* Taillight */}
      <mesh position={[0, 0.8, -1.3]}>
        <boxGeometry args={[0.3, 0.1, 0.05]} />
        <meshLambertMaterial
          emissive={0xFF0000}
          emissiveIntensity={1.2}
          color={0xFF0000}
        />
      </mesh>

      {/* Exhaust pipe */}
      <mesh position={[0.25, 0.4, -0.7]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.06, 0.05, 0.8, 8]} />
        <meshStandardMaterial color={0x444444} roughness={0.4} metalness={0.9} />
      </mesh>

      {/* Exhaust tip */}
      <mesh position={[0.25, 0.4, -1.2]}>
        <cylinderGeometry args={[0.07, 0.06, 0.15, 8]} />
        <meshStandardMaterial color={0x222222} roughness={0.3} metalness={0.9} />
      </mesh>

      {/* Engine block */}
      <mesh castShadow position={[0, 0.4, -0.1]}>
        <boxGeometry args={[0.4, 0.35, 0.5]} />
        <meshStandardMaterial color={0x333333} roughness={0.5} metalness={0.8} />
      </mesh>

      {/* Front wheel */}
      <group
        ref={(el) => { if (el) wheelsRef.current[0] = el; }}
        position={[0, 0.3, 1.2]}
        rotation={[0, 0, Math.PI / 2]}
      >
        <mesh castShadow>
          <torusGeometry args={[0.3, 0.08, 12, 24]} />
          <meshStandardMaterial color={0x111111} roughness={0.9} />
        </mesh>
        <mesh>
          <cylinderGeometry args={[0.22, 0.22, 0.05, 16]} />
          <meshStandardMaterial color={0x333333} roughness={0.4} metalness={0.8} />
        </mesh>
      </group>

      {/* Rear wheel */}
      <group
        ref={(el) => { if (el) wheelsRef.current[1] = el; }}
        position={[0, 0.3, -1.1]}
        rotation={[0, 0, Math.PI / 2]}
      >
        <mesh castShadow>
          <torusGeometry args={[0.3, 0.08, 12, 24]} />
          <meshStandardMaterial color={0x111111} roughness={0.9} />
        </mesh>
        <mesh>
          <cylinderGeometry args={[0.22, 0.22, 0.05, 16]} />
          <meshStandardMaterial color={0x333333} roughness={0.4} metalness={0.8} />
        </mesh>
      </group>

      {/* Chain guard */}
      <mesh position={[-0.15, 0.35, -0.8]}>
        <boxGeometry args={[0.05, 0.2, 0.5]} />
        <meshStandardMaterial color={0x444444} roughness={0.6} metalness={0.6} />
      </mesh>

      {/* Rear suspension */}
      <mesh position={[0.15, 0.5, -1.0]} rotation={[0.3, 0, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.4, 8]} />
        <meshStandardMaterial color={0x333333} roughness={0.3} metalness={0.9} />
      </mesh>
      <mesh position={[-0.15, 0.5, -1.0]} rotation={[0.3, 0, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.4, 8]} />
        <meshStandardMaterial color={0x333333} roughness={0.3} metalness={0.9} />
      </mesh>

      {/* Windshield */}
      <mesh position={[0, 1.0, 0.9]}>
        <boxGeometry args={[0.4, 0.3, 0.05]} />
        <meshPhysicalMaterial
          color={0x222222}
          transparent
          opacity={0.2}
          roughness={0.1}
          metalness={0.9}
          clearcoat={1}
        />
      </mesh>
    </group>
  );
}
