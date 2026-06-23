import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface RealisticAmbulanceProps {
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
  animated?: boolean;
}

export function RealisticAmbulance({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
  animated = false
}: RealisticAmbulanceProps) {
  const groupRef = useRef<THREE.Group>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const wheelsRef = useRef<THREE.Group[]>([]);
  const sirenLightsRef = useRef<THREE.Mesh[]>([]);

  useFrame((state) => {
    if (animated && groupRef.current) {
      groupRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 2) * 0.1;
      groupRef.current.rotation.y = rotation[1] + Math.sin(state.clock.elapsedTime * 0.5) * 0.05;
    }

    // Flash siren lights
    if (animated && sirenLightsRef.current.length > 0) {
      const flash = Math.sin(state.clock.elapsedTime * 8) > 0;
      sirenLightsRef.current[0]?.material && ((sirenLightsRef.current[0].material as THREE.MeshLambertMaterial).emissiveIntensity = flash ? 4 : 0.5);
      sirenLightsRef.current[1]?.material && ((sirenLightsRef.current[1].material as THREE.MeshLambertMaterial).emissiveIntensity = !flash ? 4 : 0.5);
    }

    // Light color change
    if (animated && lightRef.current) {
      const flash = Math.sin(state.clock.elapsedTime * 8) > 0 ? 0xFF0000 : 0x0044FF;
      lightRef.current.color.setHex(flash);
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
      <mesh castShadow position={[0, 0.8, 0]}>
        <boxGeometry args={[2.2, 1.2, 5]} />
        <meshStandardMaterial
          color={0xFFFFFF}
          roughness={0.3}
          metalness={0.4}
        />
      </mesh>

      {/* Cabin */}
      <mesh castShadow position={[0, 1.6, 1.3]}>
        <boxGeometry args={[2.0, 0.9, 1.8]} />
        <meshStandardMaterial
          color={0xFFFFFF}
          roughness={0.3}
          metalness={0.4}
        />
      </mesh>

      {/* Front windshield */}
      <mesh position={[0, 1.7, 2.15]}>
        <boxGeometry args={[1.8, 0.7, 0.1]} />
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
      <mesh position={[1.05, 1.5, 1.3]}>
        <boxGeometry args={[0.05, 0.7, 1.4]} />
        <meshPhysicalMaterial
          color={0x111111}
          transparent
          opacity={0.3}
          roughness={0.1}
          metalness={0.9}
          clearcoat={1}
        />
      </mesh>
      <mesh position={[-1.05, 1.5, 1.3]}>
        <boxGeometry args={[0.05, 0.7, 1.4]} />
        <meshPhysicalMaterial
          color={0x111111}
          transparent
          opacity={0.3}
          roughness={0.1}
          metalness={0.9}
          clearcoat={1}
        />
      </mesh>

      {/* Rear windows */}
      <mesh position={[1.05, 1.2, -0.8]}>
        <boxGeometry args={[0.05, 0.8, 2]} />
        <meshPhysicalMaterial
          color={0x111111}
          transparent
          opacity={0.3}
          roughness={0.1}
          metalness={0.9}
          clearcoat={1}
        />
      </mesh>
      <mesh position={[-1.05, 1.2, -0.8]}>
        <boxGeometry args={[0.05, 0.8, 2]} />
        <meshPhysicalMaterial
          color={0x111111}
          transparent
          opacity={0.3}
          roughness={0.1}
          metalness={0.9}
          clearcoat={1}
        />
      </mesh>

      {/* Rear door */}
      <mesh position={[0, 1.0, -2.5]}>
        <boxGeometry args={[1.8, 1.6, 0.1]} />
        <meshStandardMaterial
          color={0xFFFFFF}
          roughness={0.3}
          metalness={0.4}
        />
      </mesh>

      {/* Red cross - front */}
      <mesh position={[0, 1.6, 2.2]}>
        <boxGeometry args={[0.15, 0.4, 0.05]} />
        <meshLambertMaterial emissive={0xFF0000} emissiveIntensity={1} color={0xFF0000} />
      </mesh>
      <mesh position={[0, 1.6, 2.2]}>
        <boxGeometry args={[0.4, 0.15, 0.05]} />
        <meshLambertMaterial emissive={0xFF0000} emissiveIntensity={1} color={0xFF0000} />
      </mesh>

      {/* Red cross - sides */}
      <mesh position={[1.1, 1.2, 0]}>
        <boxGeometry args={[0.05, 0.4, 0.15]} />
        <meshLambertMaterial emissive={0xFF0000} emissiveIntensity={1} color={0xFF0000} />
      </mesh>
      <mesh position={[1.1, 1.2, 0]}>
        <boxGeometry args={[0.05, 0.15, 0.4]} />
        <meshLambertMaterial emissive={0xFF0000} emissiveIntensity={1} color={0xFF0000} />
      </mesh>
      <mesh position={[-1.1, 1.2, 0]}>
        <boxGeometry args={[0.05, 0.4, 0.15]} />
        <meshLambertMaterial emissive={0xFF0000} emissiveIntensity={1} color={0xFF0000} />
      </mesh>
      <mesh position={[-1.1, 1.2, 0]}>
        <boxGeometry args={[0.05, 0.15, 0.4]} />
        <meshLambertMaterial emissive={0xFF0000} emissiveIntensity={1} color={0xFF0000} />
      </mesh>

      {/* Red stripe around body */}
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[2.25, 0.25, 5.05]} />
        <meshStandardMaterial color={0xFF0000} roughness={0.4} />
      </mesh>

      {/* AMBULANCE text on roof light bar */}
      <mesh position={[0, 2.15, 0.5]}>
        <boxGeometry args={[1.5, 0.15, 0.5]} />
        <meshStandardMaterial color={0xFF0000} roughness={0.5} />
      </mesh>

      {/* Roof siren light bar */}
      <mesh position={[0, 2.2, 1.0]}>
        <boxGeometry args={[1.6, 0.2, 0.8]} />
        <meshStandardMaterial color={0x222222} roughness={0.6} metalness={0.8} />
      </mesh>

      {/* Siren lights */}
      <mesh
        ref={(el) => { if (el) sirenLightsRef.current[0] = el; }}
        position={[-0.5, 2.35, 1.0]}
      >
        <sphereGeometry args={[0.15, 12, 12]} />
        <meshLambertMaterial emissive={0xFF0000} emissiveIntensity={3} color={0x000000} />
      </mesh>
      <mesh
        ref={(el) => { if (el) sirenLightsRef.current[1] = el; }}
        position={[0.5, 2.35, 1.0]}
      >
        <sphereGeometry args={[0.15, 12, 12]} />
        <meshLambertMaterial emissive={0x0044FF} emissiveIntensity={3} color={0x000000} />
      </mesh>

      {/* Point light for siren effect */}
      <pointLight ref={lightRef} position={[0, 2.5, 1.0]} color={0xFF0000} intensity={10} distance={25} />

      {/* Front bumper */}
      <mesh position={[0, 0.3, 2.6]}>
        <boxGeometry args={[2.2, 0.2, 0.3]} />
        <meshStandardMaterial color={0x333333} roughness={0.5} metalness={0.7} />
      </mesh>

      {/* Rear bumper */}
      <mesh position={[0, 0.3, -2.6]}>
        <boxGeometry args={[2.2, 0.2, 0.3]} />
        <meshStandardMaterial color={0x333333} roughness={0.5} metalness={0.7} />
      </mesh>

      {/* Headlights */}
      <mesh position={[0.7, 0.6, 2.55]}>
        <boxGeometry args={[0.35, 0.25, 0.1]} />
        <meshLambertMaterial emissive={0xFFFFCC} emissiveIntensity={2} color={0xFFFFFF} />
      </mesh>
      <mesh position={[-0.7, 0.6, 2.55]}>
        <boxGeometry args={[0.35, 0.25, 0.1]} />
        <meshLambertMaterial emissive={0xFFFFCC} emissiveIntensity={2} color={0xFFFFFF} />
      </mesh>

      {/* Taillights */}
      <mesh position={[0.8, 0.8, -2.55]}>
        <boxGeometry args={[0.25, 0.2, 0.05]} />
        <meshLambertMaterial emissive={0xFF0000} emissiveIntensity={1} color={0xFF0000} />
      </mesh>
      <mesh position={[-0.8, 0.8, -2.55]}>
        <boxGeometry args={[0.25, 0.2, 0.05]} />
        <meshLambertMaterial emissive={0xFF0000} emissiveIntensity={1} color={0xFF0000} />
      </mesh>

      {/* Wheels - Front Left */}
      <group
        ref={(el) => { if (el) wheelsRef.current[0] = el; }}
        position={[-1.0, 0.35, 1.5]}
        rotation={[0, 0, Math.PI / 2]}
      >
        <mesh castShadow>
          <cylinderGeometry args={[0.4, 0.4, 0.3, 16]} />
          <meshStandardMaterial color={0x111111} roughness={0.9} />
        </mesh>
        <mesh>
          <cylinderGeometry args={[0.25, 0.25, 0.32, 16]} />
          <meshStandardMaterial color={0x444444} roughness={0.5} metalness={0.8} />
        </mesh>
      </group>

      {/* Front Right */}
      <group
        ref={(el) => { if (el) wheelsRef.current[1] = el; }}
        position={[1.0, 0.35, 1.5]}
        rotation={[0, 0, Math.PI / 2]}
      >
        <mesh castShadow>
          <cylinderGeometry args={[0.4, 0.4, 0.3, 16]} />
          <meshStandardMaterial color={0x111111} roughness={0.9} />
        </mesh>
        <mesh>
          <cylinderGeometry args={[0.25, 0.25, 0.32, 16]} />
          <meshStandardMaterial color={0x444444} roughness={0.5} metalness={0.8} />
        </mesh>
      </group>

      {/* Rear Left */}
      <group
        ref={(el) => { if (el) wheelsRef.current[2] = el; }}
        position={[-1.0, 0.35, -1.5]}
        rotation={[0, 0, Math.PI / 2]}
      >
        <mesh castShadow>
          <cylinderGeometry args={[0.4, 0.4, 0.3, 16]} />
          <meshStandardMaterial color={0x111111} roughness={0.9} />
        </mesh>
        <mesh>
          <cylinderGeometry args={[0.25, 0.25, 0.32, 16]} />
          <meshStandardMaterial color={0x444444} roughness={0.5} metalness={0.8} />
        </mesh>
      </group>

      {/* Rear Right */}
      <group
        ref={(el) => { if (el) wheelsRef.current[3] = el; }}
        position={[1.0, 0.35, -1.5]}
        rotation={[0, 0, Math.PI / 2]}
      >
        <mesh castShadow>
          <cylinderGeometry args={[0.4, 0.4, 0.3, 16]} />
          <meshStandardMaterial color={0x111111} roughness={0.9} />
        </mesh>
        <mesh>
          <cylinderGeometry args={[0.25, 0.25, 0.32, 16]} />
          <meshStandardMaterial color={0x444444} roughness={0.5} metalness={0.8} />
        </mesh>
      </group>

      {/* Side mirrors */}
      <mesh position={[1.15, 1.5, 2.0]}>
        <boxGeometry args={[0.15, 0.15, 0.05]} />
        <meshStandardMaterial color={0x222222} roughness={0.3} metalness={0.8} />
      </mesh>
      <mesh position={[-1.15, 1.5, 2.0]}>
        <boxGeometry args={[0.15, 0.15, 0.05]} />
        <meshStandardMaterial color={0x222222} roughness={0.3} metalness={0.8} />
      </mesh>

      {/* Grille */}
      <mesh position={[0, 0.5, 2.55]}>
        <boxGeometry args={[1.5, 0.3, 0.05]} />
        <meshStandardMaterial color={0x222222} roughness={0.6} metalness={0.7} />
      </mesh>
    </group>
  );
}
