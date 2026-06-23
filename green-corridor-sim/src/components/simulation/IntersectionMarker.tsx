import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface IntersectionMarkerProps {
  position: [number, number, number];
  intersectionId: string;
  intersectionName: string;
  onClick: (id: string) => void;
  isCorridor?: boolean;
  congestionScore?: number;
}

export function IntersectionMarker({
  position,
  intersectionId,
  intersectionName,
  onClick,
  isCorridor,
  congestionScore,
}: IntersectionMarkerProps) {
  const markerRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  const baseHeight = 11;
  // Scale for the whole marker. Increase this to make the pointer larger
  // while we compensate its vertical position so the bottom stays at the
  // same distance from the road.
  const MARKER_SCALE = 2;
  const bottomOffset = 0.58; // approx distance from group origin to marker bottom

  useFrame((state) => {
    if (!markerRef.current) return;

    // Float animation: keep the pin clearly above intersections. Adjust
    // vertical position by the scale delta so the bottom of the marker
    // remains at the same distance from the ground/road.
    const hoverMultiplier = hovered ? 1.12 : 1.0;
    const scaleValue = MARKER_SCALE * hoverMultiplier;
    markerRef.current.scale.lerp(new THREE.Vector3(scaleValue, scaleValue, scaleValue), 0.1);

    const floatY = baseHeight + Math.sin(state.clock.elapsedTime * 2) * 0.45;
    // When scaled, the bottom moves down by (scaleValue - 1) * bottomOffset,
    // so we raise the whole marker by that amount to keep bottom fixed.
    markerRef.current.position.y = floatY + (scaleValue - 1) * bottomOffset;
  });

  // Calculate colors
  let pinColor = 0xFF1A1A;
  let pinEmissive = 0xFF0000;
  let coneColor = 0xFF0000;
  let coneEmissive = 0xAA0000;
  let lightColor = 0xFF0000;

  if (isCorridor) {
    pinColor = hovered ? 0x66FF99 : 0x1AFF66;
    pinEmissive = 0x00FF33;
    coneColor = hovered ? 0x4AFF88 : 0x00FF33;
    coneEmissive = 0x00AA22;
    lightColor = 0x00FF33;
  } else if (congestionScore !== undefined) {
    if (congestionScore < 0.4) {
      pinColor = 0x00FF00; // Green
      pinEmissive = 0x00FF00;
      coneColor = 0x00FF00;
      coneEmissive = 0x00AA00;
      lightColor = 0x00FF00;
    } else if (congestionScore < 0.7) {
      pinColor = 0xFFFF00; // Yellow
      pinEmissive = 0xFFFF00;
      coneColor = 0xFFFF00;
      coneEmissive = 0xAAAA00;
      lightColor = 0xFFFF00;
    } else {
      pinColor = 0xFF1A1A; // Red
      pinEmissive = 0xFF0000;
      coneColor = 0xFF0000;
      coneEmissive = 0xAA0000;
      lightColor = 0xFF0000;
    }
  }

  return (
    <group position={position}>
      {/* Map-pin style locator */}
      <group
        ref={markerRef}
        onClick={(e) => {
          e.stopPropagation();
          onClick(intersectionId);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          setHovered(false);
          document.body.style.cursor = 'auto';
        }}
      >
        <mesh position={[0, 1.6, 0]}>
          <sphereGeometry args={[0.9, 24, 24]} />
          <meshStandardMaterial
            color={pinColor}
            emissive={pinEmissive}
            emissiveIntensity={hovered ? 1.9 : 1.15}
            roughness={0.2}
            metalness={0.45}
          />
        </mesh>

        <mesh position={[0, 0.45, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.56, 2.0, 24]} />
          <meshStandardMaterial
            color={coneColor}
            emissive={coneEmissive}
            emissiveIntensity={hovered ? 1.35 : 0.8}
            roughness={0.35}
            metalness={0.25}
          />
        </mesh>

        <mesh position={[0, 1.6, 0]}>
          <sphereGeometry args={[0.36, 18, 18]} />
          <meshBasicMaterial color={0xFFFFFF} transparent opacity={hovered ? 0.95 : 0.82} />
        </mesh>

        <mesh position={[0, -0.58, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.9, 1.35, 36]} />
          <meshBasicMaterial
            color={lightColor}
            transparent
            opacity={hovered ? 0.5 : 0.3}
            side={THREE.DoubleSide}
          />
        </mesh>

        <pointLight
          position={[0, 1.1, 0]}
          color={lightColor}
          intensity={hovered ? 18 : 10}
          distance={26}
        />
      </group>

      {/* Ground pulse to improve visibility at every zoom level */}
      <mesh position={[0, 0.2, 0]} rotation={[Math.PI / 2, 0, 0]}>
        {/* Scale the ground pulse ring so it matches marker visual scale */}
        <ringGeometry args={[1.5 * MARKER_SCALE, 1.9 * MARKER_SCALE, 32]} />
        <meshBasicMaterial
          color={lightColor}
          transparent
          opacity={hovered ? 0.38 : 0.2}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}
