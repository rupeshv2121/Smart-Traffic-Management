import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface RealisticCarProps {
  position?: [number, number, number];
  rotation?: [number, number, number];
  color?: number;
  scale?: number;
  animated?: boolean;
}

export function RealisticCar({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  color = 0x3366AA,
  scale = 1,
  animated = false
}: RealisticCarProps) {
  const groupRef = useRef<THREE.Group>(null);
  const wheelsRef = useRef<THREE.Group[]>([]);

  useFrame((state) => {
    if (animated && groupRef.current) {
      // Subtle floating animation
      groupRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 2) * 0.1;
      groupRef.current.rotation.y = rotation[1] + Math.sin(state.clock.elapsedTime * 0.5) * 0.05;
    }

    // Rotate wheels
    if (animated && wheelsRef.current) {
      wheelsRef.current.forEach(wheel => {
        if (wheel) {
          wheel.rotation.x += 0.1;
        }
      });
    }
  });

  return (
    <group ref={groupRef} position={position} rotation={rotation} scale={scale}>
      {/* Main body */}
      <mesh castShadow position={[0, 0.6, 0]}>
        <boxGeometry args={[1.9, 0.8, 4.2]} />
        <meshStandardMaterial
          color={color}
          roughness={0.3}
          metalness={0.6}
        />
      </mesh>

      {/* Cabin/Roof */}
      <mesh castShadow position={[0, 1.2, -0.3]}>
        <boxGeometry args={[1.7, 0.7, 2.2]} />
        <meshStandardMaterial
          color={color}
          roughness={0.3}
          metalness={0.6}
        />
      </mesh>

      {/* Front windshield */}
      <mesh position={[0, 1.3, 0.8]}>
        <boxGeometry args={[1.5, 0.6, 0.1]} />
        <meshPhysicalMaterial
          color={0x111111}
          transparent
          opacity={0.3}
          roughness={0.1}
          metalness={0.9}
          clearcoat={1}
        />
      </mesh>

      {/* Rear windshield */}
      <mesh position={[0, 1.3, -1.4]}>
        <boxGeometry args={[1.5, 0.6, 0.1]} />
        <meshPhysicalMaterial
          color={0x111111}
          transparent
          opacity={0.3}
          roughness={0.1}
          metalness={0.9}
          clearcoat={1}
        />
      </mesh>

      {/* Side windows */}
      <mesh position={[0.85, 1.1, -0.3]}>
        <boxGeometry args={[0.05, 0.5, 1.8]} />
        <meshPhysicalMaterial
          color={0x111111}
          transparent
          opacity={0.3}
          roughness={0.1}
          metalness={0.9}
          clearcoat={1}
        />
      </mesh>
      <mesh position={[-0.85, 1.1, -0.3]}>
        <boxGeometry args={[0.05, 0.5, 1.8]} />
        <meshPhysicalMaterial
          color={0x111111}
          transparent
          opacity={0.3}
          roughness={0.1}
          metalness={0.9}
          clearcoat={1}
        />
      </mesh>

      {/* Hood */}
      <mesh castShadow position={[0, 0.7, 1.7]}>
        <boxGeometry args={[1.8, 0.3, 0.8]} />
        <meshStandardMaterial
          color={color}
          roughness={0.3}
          metalness={0.6}
        />
      </mesh>

      {/* Front bumper */}
      <mesh position={[0, 0.3, 2.2]}>
        <boxGeometry args={[1.9, 0.2, 0.3]} />
        <meshStandardMaterial color={0x222222} roughness={0.4} metalness={0.7} />
      </mesh>

      {/* Rear bumper */}
      <mesh position={[0, 0.3, -2.2]}>
        <boxGeometry args={[1.9, 0.2, 0.3]} />
        <meshStandardMaterial color={0x222222} roughness={0.4} metalness={0.7} />
      </mesh>

      {/* Headlights */}
      <mesh position={[0.6, 0.5, 2.15]}>
        <boxGeometry args={[0.3, 0.2, 0.1]} />
        <meshLambertMaterial emissive={0xFFFFCC} emissiveIntensity={1.5} color={0xFFFFFF} />
      </mesh>
      <mesh position={[-0.6, 0.5, 2.15]}>
        <boxGeometry args={[0.3, 0.2, 0.1]} />
        <meshLambertMaterial emissive={0xFFFFCC} emissiveIntensity={1.5} color={0xFFFFFF} />
      </mesh>

      {/* Taillights */}
      <mesh position={[0.7, 0.6, -2.15]}>
        <boxGeometry args={[0.2, 0.15, 0.05]} />
        <meshLambertMaterial emissive={0xFF0000} emissiveIntensity={1} color={0xFF0000} />
      </mesh>
      <mesh position={[-0.7, 0.6, -2.15]}>
        <boxGeometry args={[0.2, 0.15, 0.05]} />
        <meshLambertMaterial emissive={0xFF0000} emissiveIntensity={1} color={0xFF0000} />
      </mesh>

      {/* Wheels - Front Left */}
      <group
        ref={(el) => { if (el) wheelsRef.current[0] = el; }}
        position={[-0.9, 0.3, 1.3]}
        rotation={[0, 0, Math.PI / 2]}
      >
        <mesh castShadow>
          <cylinderGeometry args={[0.35, 0.35, 0.25, 16]} />
          <meshStandardMaterial color={0x111111} roughness={0.8} />
        </mesh>
        <mesh>
          <cylinderGeometry args={[0.2, 0.2, 0.27, 16]} />
          <meshStandardMaterial color={0x444444} roughness={0.6} metalness={0.8} />
        </mesh>
      </group>

      {/* Front Right */}
      <group
        ref={(el) => { if (el) wheelsRef.current[1] = el; }}
        position={[0.9, 0.3, 1.3]}
        rotation={[0, 0, Math.PI / 2]}
      >
        <mesh castShadow>
          <cylinderGeometry args={[0.35, 0.35, 0.25, 16]} />
          <meshStandardMaterial color={0x111111} roughness={0.8} />
        </mesh>
        <mesh>
          <cylinderGeometry args={[0.2, 0.2, 0.27, 16]} />
          <meshStandardMaterial color={0x444444} roughness={0.6} metalness={0.8} />
        </mesh>
      </group>

      {/* Rear Left */}
      <group
        ref={(el) => { if (el) wheelsRef.current[2] = el; }}
        position={[-0.9, 0.3, -1.3]}
        rotation={[0, 0, Math.PI / 2]}
      >
        <mesh castShadow>
          <cylinderGeometry args={[0.35, 0.35, 0.25, 16]} />
          <meshStandardMaterial color={0x111111} roughness={0.8} />
        </mesh>
        <mesh>
          <cylinderGeometry args={[0.2, 0.2, 0.27, 16]} />
          <meshStandardMaterial color={0x444444} roughness={0.6} metalness={0.8} />
        </mesh>
      </group>

      {/* Rear Right */}
      <group
        ref={(el) => { if (el) wheelsRef.current[3] = el; }}
        position={[0.9, 0.3, -1.3]}
        rotation={[0, 0, Math.PI / 2]}
      >
        <mesh castShadow>
          <cylinderGeometry args={[0.35, 0.35, 0.25, 16]} />
          <meshStandardMaterial color={0x111111} roughness={0.8} />
        </mesh>
        <mesh>
          <cylinderGeometry args={[0.2, 0.2, 0.27, 16]} />
          <meshStandardMaterial color={0x444444} roughness={0.6} metalness={0.8} />
        </mesh>
      </group>

      {/* Side mirrors */}
      <mesh position={[1.05, 1.1, 0.5]}>
        <boxGeometry args={[0.15, 0.15, 0.05]} />
        <meshStandardMaterial color={0x222222} roughness={0.3} metalness={0.8} />
      </mesh>
      <mesh position={[-1.05, 1.1, 0.5]}>
        <boxGeometry args={[0.15, 0.15, 0.05]} />
        <meshStandardMaterial color={0x222222} roughness={0.3} metalness={0.8} />
      </mesh>

      {/* Roof details */}
      <mesh position={[0, 1.6, -0.3]}>
        <boxGeometry args={[1.5, 0.05, 2]} />
        <meshStandardMaterial
          color={color}
          roughness={0.2}
          metalness={0.7}
        />
      </mesh>
    </group>
  );
}
