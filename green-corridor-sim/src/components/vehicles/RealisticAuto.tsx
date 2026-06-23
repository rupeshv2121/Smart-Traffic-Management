import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface RealisticAutoProps {
  position?: [number, number, number];
  rotation?: [number, number, number];
  color?: number;
  scale?: number;
  animated?: boolean;
}

export function RealisticAuto({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  color = 0xFFDD00,
  scale = 1,
  animated = false
}: RealisticAutoProps) {
  const groupRef = useRef<THREE.Group>(null);
  const wheelsRef = useRef<THREE.Group[]>([]);

  useFrame((state) => {
    if (animated && groupRef.current) {
      // Subtle bouncing animation (auto-rickshaws have a characteristic bounce)
      groupRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 3) * 0.12;
      groupRef.current.rotation.y = rotation[1] + Math.sin(state.clock.elapsedTime * 0.5) * 0.05;
    }

    // Rotate wheels
    if (animated && wheelsRef.current) {
      wheelsRef.current.forEach(wheel => {
        if (wheel) {
          wheel.rotation.x += 0.12;
        }
      });
    }
  });

  return (
    <group ref={groupRef} position={position} rotation={rotation} scale={scale}>
      {/* Main cabin body */}
      <mesh castShadow position={[0, 0.9, -0.3]}>
        <boxGeometry args={[1.5, 1.2, 2.2]} />
        <meshStandardMaterial
          color={color}
          roughness={0.4}
          metalness={0.6}
        />
      </mesh>

      {/* Roof */}
      <mesh castShadow position={[0, 1.6, -0.3]}>
        <boxGeometry args={[1.55, 0.1, 2.25]} />
        <meshStandardMaterial
          color={0x222222}
          roughness={0.6}
        />
      </mesh>

      {/* Front hood/engine compartment */}
      <mesh castShadow position={[0, 0.6, 1.1]}>
        <boxGeometry args={[1.3, 0.5, 0.8]} />
        <meshStandardMaterial
          color={color}
          roughness={0.4}
          metalness={0.6}
        />
      </mesh>

      {/* Front windshield */}
      <mesh position={[0, 1.2, 0.8]}>
        <boxGeometry args={[1.3, 0.7, 0.1]} />
        <meshPhysicalMaterial
          color={0x222222}
          transparent
          opacity={0.4}
          roughness={0.1}
          metalness={0.9}
          clearcoat={1}
        />
      </mesh>

      {/* Side windows - open design (auto-rickshaws have open sides) */}
      <mesh position={[0.75, 1.2, -0.3]}>
        <boxGeometry args={[0.05, 0.7, 1.8]} />
        <meshStandardMaterial
          color={0x111111}
          roughness={0.7}
          opacity={0.7}
          transparent
        />
      </mesh>
      <mesh position={[-0.75, 1.2, -0.3]}>
        <boxGeometry args={[0.05, 0.7, 1.8]} />
        <meshStandardMaterial
          color={0x111111}
          roughness={0.7}
          opacity={0.7}
          transparent
        />
      </mesh>

      {/* Rear canvas/cover */}
      <mesh position={[0, 1.1, -1.4]}>
        <boxGeometry args={[1.45, 0.9, 0.1]} />
        <meshStandardMaterial
          color={0x333333}
          roughness={0.9}
        />
      </mesh>

      {/* Side panels with typical Indian auto design */}
      <mesh position={[0.77, 0.6, -0.5]}>
        <boxGeometry args={[0.05, 0.5, 1.5]} />
        <meshStandardMaterial
          color={color}
          roughness={0.4}
          metalness={0.5}
        />
      </mesh>
      <mesh position={[-0.77, 0.6, -0.5]}>
        <boxGeometry args={[0.05, 0.5, 1.5]} />
        <meshStandardMaterial
          color={color}
          roughness={0.4}
          metalness={0.5}
        />
      </mesh>

      {/* Handlebar assembly */}
      <mesh position={[0, 0.9, 1.3]} rotation={[0.2, 0, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.3, 8]} />
        <meshStandardMaterial color={0x222222} roughness={0.5} metalness={0.8} />
      </mesh>

      {/* Handlebars */}
      <mesh position={[0, 0.95, 1.2]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.02, 0.02, 0.6, 8]} />
        <meshStandardMaterial color={0x222222} roughness={0.6} />
      </mesh>

      {/* Headlight */}
      <mesh position={[0, 0.7, 1.55]}>
        <sphereGeometry args={[0.12, 12, 12]} />
        <meshLambertMaterial
          emissive={0xFFFFCC}
          emissiveIntensity={1.5}
          color={0xFFFFFF}
        />
      </mesh>

      {/* Taillights */}
      <mesh position={[0.4, 0.9, -1.42]}>
        <boxGeometry args={[0.15, 0.12, 0.05]} />
        <meshLambertMaterial
          emissive={0xFF0000}
          emissiveIntensity={1}
          color={0xFF0000}
        />
      </mesh>
      <mesh position={[-0.4, 0.9, -1.42]}>
        <boxGeometry args={[0.15, 0.12, 0.05]} />
        <meshLambertMaterial
          emissive={0xFF0000}
          emissiveIntensity={1}
          color={0xFF0000}
        />
      </mesh>

      {/* Registration plate (typical green plate for auto-rickshaws in India) */}
      <mesh position={[0, 0.4, 1.55]}>
        <boxGeometry args={[0.4, 0.15, 0.02]} />
        <meshStandardMaterial color={0x00AA00} roughness={0.6} />
      </mesh>

      {/* Meter box (fare meter) */}
      <mesh position={[0.5, 1.0, 0.6]}>
        <boxGeometry args={[0.15, 0.12, 0.1]} />
        <meshStandardMaterial color={0x222222} roughness={0.5} />
      </mesh>
      <mesh position={[0.5, 1.0, 0.65]}>
        <boxGeometry args={[0.12, 0.08, 0.02]} />
        <meshLambertMaterial
          emissive={0x00FF00}
          emissiveIntensity={1.5}
          color={0x000000}
        />
      </mesh>

      {/* Side view mirror */}
      <mesh position={[0.85, 1.0, 1.0]}>
        <boxGeometry args={[0.12, 0.12, 0.03]} />
        <meshStandardMaterial color={0x222222} roughness={0.3} metalness={0.8} />
      </mesh>

      {/* Front bumper/fender */}
      <mesh position={[0, 0.35, 1.5]}>
        <boxGeometry args={[1.3, 0.15, 0.2]} />
        <meshStandardMaterial color={0x333333} roughness={0.6} metalness={0.6} />
      </mesh>

      {/* Seats - typical bench seating */}
      <mesh position={[0, 0.7, -0.5]}>
        <boxGeometry args={[1.2, 0.15, 0.8]} />
        <meshStandardMaterial color={0x444444} roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.95, -0.8]}>
        <boxGeometry args={[1.2, 0.5, 0.15]} />
        <meshStandardMaterial color={0x444444} roughness={0.8} />
      </mesh>

      {/* Front wheel (single front wheel typical of auto-rickshaws) */}
      <group
        ref={(el) => { if (el) wheelsRef.current[0] = el; }}
        position={[0, 0.3, 1.3]}
        rotation={[0, 0, Math.PI / 2]}
      >
        <mesh castShadow>
          <cylinderGeometry args={[0.3, 0.3, 0.2, 16]} />
          <meshStandardMaterial color={0x111111} roughness={0.9} />
        </mesh>
        <mesh>
          <cylinderGeometry args={[0.18, 0.18, 0.22, 16]} />
          <meshStandardMaterial color={0x444444} roughness={0.5} metalness={0.8} />
        </mesh>
      </group>

      {/* Rear Left wheel */}
      <group
        ref={(el) => { if (el) wheelsRef.current[1] = el; }}
        position={[-0.7, 0.3, -1.1]}
        rotation={[0, 0, Math.PI / 2]}
      >
        <mesh castShadow>
          <cylinderGeometry args={[0.3, 0.3, 0.2, 16]} />
          <meshStandardMaterial color={0x111111} roughness={0.9} />
        </mesh>
        <mesh>
          <cylinderGeometry args={[0.18, 0.18, 0.22, 16]} />
          <meshStandardMaterial color={0x444444} roughness={0.5} metalness={0.8} />
        </mesh>
      </group>

      {/* Rear Right wheel */}
      <group
        ref={(el) => { if (el) wheelsRef.current[2] = el; }}
        position={[0.7, 0.3, -1.1]}
        rotation={[0, 0, Math.PI / 2]}
      >
        <mesh castShadow>
          <cylinderGeometry args={[0.3, 0.3, 0.2, 16]} />
          <meshStandardMaterial color={0x111111} roughness={0.9} />
        </mesh>
        <mesh>
          <cylinderGeometry args={[0.18, 0.18, 0.22, 16]} />
          <meshStandardMaterial color={0x444444} roughness={0.5} metalness={0.8} />
        </mesh>
      </group>

      {/* Engine compartment details */}
      <mesh castShadow position={[0, 0.5, 0.8]}>
        <boxGeometry args={[0.5, 0.3, 0.4]} />
        <meshStandardMaterial color={0x333333} roughness={0.6} metalness={0.7} />
      </mesh>

      {/* Exhaust pipe */}
      <mesh position={[-0.6, 0.3, -0.5]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.04, 0.04, 0.5, 8]} />
        <meshStandardMaterial color={0x333333} roughness={0.5} metalness={0.8} />
      </mesh>

      {/* Exhaust tip */}
      <mesh position={[-0.85, 0.3, -0.5]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.05, 0.04, 0.1, 8]} />
        <meshStandardMaterial color={0x222222} roughness={0.4} metalness={0.9} />
      </mesh>

      {/* Decorative stripes (common on Indian autos) */}
      <mesh position={[0, 0.55, -0.3]}>
        <boxGeometry args={[1.6, 0.08, 2.3]} />
        <meshStandardMaterial color={0x000000} roughness={0.5} />
      </mesh>

      {/* Top luggage rack (common feature) */}
      <mesh position={[0, 1.7, -0.3]}>
        <boxGeometry args={[1.4, 0.05, 1.8]} />
        <meshStandardMaterial color={0x333333} roughness={0.7} metalness={0.7} />
      </mesh>
    </group>
  );
}
