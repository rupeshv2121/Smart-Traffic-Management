import { useMemo } from 'react';
import * as THREE from 'three';
import { asphaltTexture, groundTexture, sidewalkTexture } from '@/lib/textures';

const ROAD_LENGTH = 500; // Increased from 400 for even longer roads
const LANE_WIDTH = 6;
const LANES_PER_DIRECTION = 2;
const ROAD_WIDTH = LANE_WIDTH * LANES_PER_DIRECTION * 2;
const SIDEWALK_W = 4;
const SIDEWALK_H = 0.35;

// Lane positions for vehicles (2 lanes per direction)
export const LANE_POSITIONS = {
  // Left-hand traffic (India)
  N: [-LANE_WIDTH * 0.5, -LANE_WIDTH * 1.5],
  S: [LANE_WIDTH * 0.5, LANE_WIDTH * 1.5],
  E: [-LANE_WIDTH * 0.5, -LANE_WIDTH * 1.5],
  W: [LANE_WIDTH * 0.5, LANE_WIDTH * 1.5],
};

// Secondary roads spaced further apart for longer visible road sections
const SECONDARY_OFFSETS = [100, -100];
const CROSS_CENTERS = [0, 100, -100];

// Split an axis into segments, skipping a window around each cross-road centre
// so sidewalks don't run across the intersections.
function buildSegments(min: number, max: number, halfGap: number, centers: number[]) {
  const exclusions = centers
    .map((c) => [c - halfGap, c + halfGap] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const segments: [number, number][] = [];
  let cursor = min;
  for (const [a, b] of exclusions) {
    if (a > cursor) segments.push([cursor, Math.min(a, max)]);
    cursor = Math.max(cursor, b);
  }
  if (cursor < max) segments.push([cursor, max]);
  return segments.filter(([a, b]) => b - a > 1);
}

export function Road() {
  const dashMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: 0xfafad0 }), []);

  const asphalt = useMemo(() => {
    const t = asphaltTexture().clone();
    t.needsUpdate = true;
    t.repeat.set(ROAD_WIDTH / 7, ROAD_LENGTH / 7);
    return t;
  }, []);
  const asphaltCross = useMemo(() => {
    const t = asphaltTexture().clone();
    t.needsUpdate = true;
    t.repeat.set(ROAD_LENGTH / 7, ROAD_WIDTH / 7);
    return t;
  }, []);
  const ground = useMemo(() => {
    const t = groundTexture().clone();
    t.needsUpdate = true;
    t.repeat.set(20, 20);
    return t;
  }, []);
  const sidewalk = useMemo(() => sidewalkTexture(), []);

  const dashes = useMemo(() => {
    const items: { pos: [number, number, number]; rot: number }[] = [];
    const laneOffsets = [-LANE_WIDTH, 0, LANE_WIDTH];

    for (let i = -ROAD_LENGTH / 2; i < ROAD_LENGTH / 2; i += 4) {
      for (const offset of laneOffsets) {
        items.push({ pos: [offset, 0.02, i], rot: 0 });
        items.push({ pos: [i, 0.02, offset], rot: Math.PI / 2 });
        for (const off of SECONDARY_OFFSETS) {
          items.push({ pos: [off + offset, 0.02, i], rot: 0 });
          items.push({ pos: [i, 0.02, off + offset], rot: Math.PI / 2 });
        }
      }
    }
    return items;
  }, []);

  // Sidewalk slabs flanking each road, broken at intersections.
  const sidewalks = useMemo(() => {
    const slabs: { pos: [number, number, number]; size: [number, number, number]; repeat: [number, number] }[] = [];
    const edge = ROAD_WIDTH / 2 + SIDEWALK_W / 2;
    const segs = buildSegments(-ROAD_LENGTH / 2, ROAD_LENGTH / 2, ROAD_WIDTH / 2 + 3, CROSS_CENTERS);

    for (const roadX of CROSS_CENTERS) {
      for (const side of [-1, 1]) {
        for (const [a, b] of segs) {
          const len = b - a;
          slabs.push({
            pos: [roadX + side * edge, SIDEWALK_H / 2, (a + b) / 2],
            size: [SIDEWALK_W, SIDEWALK_H, len],
            repeat: [1, Math.max(1, Math.round(len / 4))],
          });
        }
      }
    }
    for (const roadZ of CROSS_CENTERS) {
      for (const side of [-1, 1]) {
        for (const [a, b] of segs) {
          const len = b - a;
          slabs.push({
            pos: [(a + b) / 2, SIDEWALK_H / 2, roadZ + side * edge],
            size: [len, SIDEWALK_H, SIDEWALK_W],
            repeat: [Math.max(1, Math.round(len / 4)), 1],
          });
        }
      }
    }
    return slabs;
  }, []);

  return (
    <group>
      {/* Ground plane */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.1, 0]} receiveShadow>
        <planeGeometry args={[500, 500]} />
        <meshStandardMaterial map={ground} color={0xbfcf9f} roughness={1} />
      </mesh>

      {/* === Main Roads === */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.01, 0]} receiveShadow>
        <planeGeometry args={[ROAD_WIDTH, ROAD_LENGTH]} />
        <meshStandardMaterial map={asphalt} color={0x9a9a9a} roughness={0.92} metalness={0.02} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.01, 0]} receiveShadow>
        <planeGeometry args={[ROAD_LENGTH, ROAD_WIDTH]} />
        <meshStandardMaterial map={asphaltCross} color={0x9a9a9a} roughness={0.92} metalness={0.02} />
      </mesh>

      {/* Center divider */}
      <mesh position={[0, 0.05, 0]}>
        <boxGeometry args={[0.5, 0.1, ROAD_LENGTH]} />
        <meshStandardMaterial color={0xf0c020} roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.05, 0]}>
        <boxGeometry args={[ROAD_LENGTH, 0.1, 0.5]} />
        <meshStandardMaterial color={0xf0c020} roughness={0.7} />
      </mesh>

      {/* === Secondary NS Roads === */}
      {SECONDARY_OFFSETS.map((off, i) => (
        <mesh key={`ns-${i}`} rotation-x={-Math.PI / 2} position={[off, 0.01, 0]} receiveShadow>
          <planeGeometry args={[ROAD_WIDTH, ROAD_LENGTH]} />
          <meshStandardMaterial map={asphalt} color={0x9a9a9a} roughness={0.92} metalness={0.02} />
        </mesh>
      ))}

      {/* === Secondary EW Roads === */}
      {SECONDARY_OFFSETS.map((off, i) => (
        <mesh key={`ew-${i}`} rotation-x={-Math.PI / 2} position={[0, 0.01, off]} receiveShadow>
          <planeGeometry args={[ROAD_LENGTH, ROAD_WIDTH]} />
          <meshStandardMaterial map={asphaltCross} color={0x9a9a9a} roughness={0.92} metalness={0.02} />
        </mesh>
      ))}

      {/* Sidewalks */}
      {sidewalks.map((s, i) => {
        const tex = sidewalk.clone();
        tex.needsUpdate = true;
        tex.repeat.set(s.repeat[0], s.repeat[1]);
        return (
          <mesh key={`sw-${i}`} position={s.pos} castShadow receiveShadow>
            <boxGeometry args={s.size} />
            <meshStandardMaterial map={tex} color={0xb9b9b0} roughness={0.95} />
          </mesh>
        );
      })}

      {/* Center dashes */}
      {dashes.map((d, i) => (
        <mesh key={i} position={d.pos} rotation={[-Math.PI / 2, 0, d.rot]} material={dashMaterial}>
          <planeGeometry args={[0.15, 2]} />
        </mesh>
      ))}

      {/* Intersection boxes — all 9 intersections */}
      {[0, ...SECONDARY_OFFSETS].map((x) =>
        [0, ...SECONDARY_OFFSETS].map((z) => (
          <mesh key={`int-${x}-${z}`} rotation-x={-Math.PI / 2} position={[x, 0.015, z]} receiveShadow>
            <planeGeometry args={[ROAD_WIDTH + 1, ROAD_WIDTH + 1]} />
            <meshStandardMaterial color={0x3f3f44} roughness={0.85} />
          </mesh>
        ))
      )}
    </group>
  );
}

export { SECONDARY_OFFSETS };
