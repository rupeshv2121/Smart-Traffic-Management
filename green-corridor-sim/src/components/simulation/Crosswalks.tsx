import { useMemo } from 'react';

const ROAD_WIDTH = 14;
const STRIPE_COUNT = 20;
const STRIPE_W = 0.4;
const STRIPE_L = 3.0;
const GAP = 1.2;

// All intersection centers (main + secondary) - updated to match wider spacing
const INTERSECTION_CENTERS = [0, 100, -100]; // Updated from [0, 50, -50]

export function Crosswalks() {
  const stripes = useMemo(() => {
    const items: { pos: [number, number, number]; rot: number }[] = [];

    for (const cx of INTERSECTION_CENTERS) {
      for (const cz of INTERSECTION_CENTERS) {
        // 4 crosswalks per intersection
        const crossings = [
          { center: [cx, 0.02, cz + ROAD_WIDTH / 2 + 7] as [number, number, number], along: 'x' },
          { center: [cx, 0.02, cz - (ROAD_WIDTH / 2 + 7)] as [number, number, number], along: 'x' },
          { center: [cx + ROAD_WIDTH / 2 + 7, 0.02, cz] as [number, number, number], along: 'z' },
          { center: [cx - (ROAD_WIDTH / 2 + 7), 0.02, cz] as [number, number, number], along: 'z' },
        ];

        for (const c of crossings) {
          const startOff = -((STRIPE_COUNT - 1) * GAP) / 2;
          for (let i = 0; i < STRIPE_COUNT; i++) {
            const off = startOff + i * GAP;
            if (c.along === 'x') {
              items.push({ pos: [c.center[0] + off, c.center[1], c.center[2]], rot: 0 });
            } else {
              items.push({ pos: [c.center[0], c.center[1], c.center[2] + off], rot: Math.PI / 2 });
            }
          }
        }
      }
    }
    return items;
  }, []);

  return (
    <group>
      {stripes.map((s, i) => (
        <mesh key={i} position={s.pos} rotation={[-Math.PI / 2, 0, s.rot]}>
          <planeGeometry args={[STRIPE_W, STRIPE_L]} />
          <meshStandardMaterial color={0xFFFFFF} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}
