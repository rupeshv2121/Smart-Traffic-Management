import { Billboard, Text } from '@react-three/drei';
import { useMemo } from 'react';

const SANDSTONE = 0xc2a878;
const SANDSTONE_DARK = 0xa8895f;

// India Gate — placed at the south end of the central avenue so the main road
// reads like Kartavya Path leading up to it. Stylised from boxes; cars pass
// under the central arch.
function IndiaGate({ position }: { position: [number, number, number] }) {
  const [px, py, pz] = position;
  return (
    <group position={[px, py, pz]}>
      {/* Plinth */}
      <mesh position={[0, 0.6, 0]} castShadow receiveShadow>
        <boxGeometry args={[46, 1.2, 22]} />
        <meshStandardMaterial color={SANDSTONE_DARK} roughness={0.85} />
      </mesh>

      {/* Two main piers, opening ~32 wide clears the road */}
      {[-19, 19].map((x) => (
        <group key={x}>
          <mesh position={[x, 13, 0]} castShadow receiveShadow>
            <boxGeometry args={[8, 24, 12]} />
            <meshStandardMaterial color={SANDSTONE} roughness={0.8} />
          </mesh>
          {/* pier cornice */}
          <mesh position={[x, 25.5, 0]} castShadow>
            <boxGeometry args={[9.4, 1.4, 13.4]} />
            <meshStandardMaterial color={SANDSTONE_DARK} roughness={0.8} />
          </mesh>
        </group>
      ))}

      {/* Arch haunches (corbels narrowing the opening into an arch read) */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 13, 21, 0]} castShadow>
          <boxGeometry args={[6, 6, 12]} />
          <meshStandardMaterial color={SANDSTONE} roughness={0.8} />
        </mesh>
      ))}

      {/* Lintel / entablature spanning the top */}
      <mesh position={[0, 27.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[48, 4, 14]} />
        <meshStandardMaterial color={SANDSTONE} roughness={0.78} />
      </mesh>
      {/* Upper tier */}
      <mesh position={[0, 30.5, 0]} castShadow>
        <boxGeometry args={[40, 2.2, 11]} />
        <meshStandardMaterial color={SANDSTONE_DARK} roughness={0.8} />
      </mesh>
      <mesh position={[0, 32.2, 0]} castShadow>
        <boxGeometry args={[14, 1.6, 9]} />
        <meshStandardMaterial color={SANDSTONE} roughness={0.8} />
      </mesh>

      {/* Inscription band */}
      <Billboard position={[0, 9, 7.2]}>
        <Text fontSize={2.2} color="#3a2c12" anchorX="center" anchorY="middle" letterSpacing={0.12}>
          INDIA GATE
        </Text>
      </Billboard>
    </group>
  );
}

// Simple low-poly tree.
function Tree({ position, scale }: { position: [number, number, number]; scale: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 1.2, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.32, 2.4, 6]} />
        <meshStandardMaterial color={0x6b4a2b} roughness={0.9} />
      </mesh>
      <mesh position={[0, 3.1, 0]} castShadow>
        <icosahedronGeometry args={[1.7, 0]} />
        <meshStandardMaterial color={0x2f7d32} roughness={0.95} flatShading />
      </mesh>
      <mesh position={[0.7, 2.4, 0.4]} castShadow>
        <icosahedronGeometry args={[1.1, 0]} />
        <meshStandardMaterial color={0x357a38} roughness={0.95} flatShading />
      </mesh>
    </group>
  );
}

const CROSS = [0, 100, -100];

function isClear(x: number, z: number) {
  for (const c of CROSS) {
    if (Math.abs(x - c) < 20) return false;
    if (Math.abs(z - c) < 20) return false;
  }
  // Hospital reserve
  const dx = x - 52;
  const dz = z - 70;
  if (dx * dx + dz * dz < 36 * 36) return false;
  // India Gate reserve (south vista)
  if (Math.abs(x) < 28 && z > 195) return false;
  return true;
}

function Trees() {
  const trees = useMemo(() => {
    const out: { position: [number, number, number]; scale: number }[] = [];
    let seed = 1234;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    let attempts = 0;
    while (out.length < 70 && attempts < 1500) {
      attempts++;
      const x = (rnd() - 0.5) * 360;
      const z = (rnd() - 0.5) * 360;
      if (!isClear(x, z)) continue;
      out.push({ position: [x, 0, z], scale: 0.8 + rnd() * 0.9 });
    }
    return out;
  }, []);

  return (
    <group>
      {trees.map((t, i) => (
        <Tree key={i} position={t.position} scale={t.scale} />
      ))}
    </group>
  );
}

// Overhead green directional gantry, north entrance to the zone.
function WelcomeGantry({ position }: { position: [number, number, number] }) {
  const [px, py, pz] = position;
  return (
    <group position={[px, py, pz]}>
      {[-13, 13].map((x) => (
        <mesh key={x} position={[x, 5, 0]} castShadow>
          <cylinderGeometry args={[0.4, 0.5, 10, 8]} />
          <meshStandardMaterial color={0x4a4a4a} roughness={0.6} metalness={0.4} />
        </mesh>
      ))}
      <mesh position={[0, 9.6, 0]} castShadow>
        <boxGeometry args={[28, 0.6, 0.6]} />
        <meshStandardMaterial color={0x4a4a4a} roughness={0.6} metalness={0.4} />
      </mesh>
      <mesh position={[0, 7.6, 0.4]} castShadow>
        <boxGeometry args={[22, 3.2, 0.4]} />
        <meshStandardMaterial color={0x0b6b2e} roughness={0.5} />
      </mesh>
      <Billboard position={[0, 8.2, 0.65]}>
        <Text fontSize={1.05} color="#ffffff" anchorX="center" anchorY="middle" letterSpacing={0.05}>
          NEW DELHI · ITO TRAFFIC ZONE
        </Text>
      </Billboard>
      <Billboard position={[0, 6.9, 0.65]}>
        <Text fontSize={0.8} color="#cfeccd" anchorX="center" anchorY="middle">
          नई दिल्ली · आई.टी.ओ. यातायात क्षेत्र
        </Text>
      </Billboard>
    </group>
  );
}

export function DelhiLandmarks() {
  return (
    <group>
      <IndiaGate position={[0, 0, 225]} />
      <WelcomeGantry position={[0, 0, -235]} />
      <Trees />
    </group>
  );
}
