import { useMemo } from 'react';
import * as THREE from 'three';
import { facadeTexture } from '@/lib/textures';

interface BuildingData {
  position: [number, number, number];
  size: [number, number, number];
  color: number;
  roofColor: number;
  facade: THREE.Texture;
  tank: boolean;
  tankColor: number;
}

// Delhi-leaning palette: sandstone, whitewash, ochre, weathered concrete.
const BUILDING_COLORS = [0xc9b79c, 0xd6d0c4, 0xb7ae9e, 0xc2b280, 0xd9c9a3, 0xbfae93, 0xcfc3ae, 0xc7a982];
const ROOF_COLORS = [0x6b6b66, 0x55554f, 0x73706a, 0x4f4e49];
const TANK_COLORS = [0x222831, 0x2b3a55, 0x8a1f1f, 0x1f1f1f]; // black / blue / red plastic water tanks
const ROAD_POSITIONS = [0, 100, -100];
const ROAD_CLEARANCE = 28;
const INTERSECTION_CLEARANCE = 34;
const HOSPITAL_RESERVED_ZONE = { x: 52, z: 70, radius: 34 };

export function Buildings() {
  // A few shared facade tiles; each building clones one and sets its own repeat.
  const facadeVariants = useMemo(
    () => [facadeTexture({ seed: 11 }), facadeTexture({ seed: 23 }), facadeTexture({ seed: 37 })],
    [],
  );

  const buildings = useMemo<BuildingData[]>(() => {
    const result: BuildingData[] = [];

    const isInsideRoadBuffer = (x: number, z: number) => {
      for (const c of ROAD_POSITIONS) {
        if (Math.abs(x - c) < ROAD_CLEARANCE) return true;
        if (Math.abs(z - c) < ROAD_CLEARANCE) return true;
      }
      for (const cx of ROAD_POSITIONS) {
        for (const cz of ROAD_POSITIONS) {
          if (Math.abs(x - cx) < INTERSECTION_CLEARANCE && Math.abs(z - cz) < INTERSECTION_CLEARANCE) {
            return true;
          }
        }
      }
      const dx = x - HOSPITAL_RESERVED_ZONE.x;
      const dz = z - HOSPITAL_RESERVED_ZONE.z;
      if (dx * dx + dz * dz < HOSPITAL_RESERVED_ZONE.radius * HOSPITAL_RESERVED_ZONE.radius) {
        return true;
      }
      return false;
    };

    const edges = [-150, -100, 0, 100, 150];
    const blocks: { xRange: [number, number]; zRange: [number, number] }[] = [];

    for (let xi = 0; xi < edges.length - 1; xi++) {
      for (let zi = 0; zi < edges.length - 1; zi++) {
        let x0 = edges[xi];
        let x1 = edges[xi + 1];
        let z0 = edges[zi];
        let z1 = edges[zi + 1];

        if (ROAD_POSITIONS.includes(x0)) x0 += 10;
        if (ROAD_POSITIONS.includes(x1)) x1 -= 10;
        if (ROAD_POSITIONS.includes(z0)) z0 += 10;
        if (ROAD_POSITIONS.includes(z1)) z1 -= 10;

        if (x0 === -150) x0 = -190;
        if (x1 === 150) x1 = 190;
        if (z0 === -150) z0 = -190;
        if (z1 === 150) z1 = 190;

        if (x1 - x0 > 6 && z1 - z0 > 6) {
          blocks.push({ xRange: [x0, x1], zRange: [z0, z1] });
        }
      }
    }

    for (const q of blocks) {
      const blockW = q.xRange[1] - q.xRange[0];
      const blockD = q.zRange[1] - q.zRange[0];
      const count = Math.max(2, Math.floor((blockW * blockD) / 120));
      for (let i = 0; i < count; i++) {
        const w = 4 + Math.random() * 8;
        const d = 4 + Math.random() * 8;
        const h = 5 + Math.random() * 24;
        const x = q.xRange[0] + w / 2 + Math.random() * Math.max(0, blockW - w);
        const z = q.zRange[0] + d / 2 + Math.random() * Math.max(0, blockD - d);

        if (isInsideRoadBuffer(x, z)) continue;

        const color = BUILDING_COLORS[Math.floor(Math.random() * BUILDING_COLORS.length)];
        const roofColor = ROOF_COLORS[Math.floor(Math.random() * ROOF_COLORS.length)];

        // Clone a facade variant and scale window repeat to the building size
        // (~1 storey per 4.5 units tall, ~1 window column per 4 units wide).
        const base = facadeVariants[Math.floor(Math.random() * facadeVariants.length)];
        const facade = base.clone();
        facade.needsUpdate = true;
        facade.repeat.set(Math.max(1, Math.round(w / 4)), Math.max(1, Math.round(h / 4.5)));

        result.push({
          position: [x, h / 2, z],
          size: [w, h, d],
          color,
          roofColor,
          facade,
          tank: h > 14 && Math.random() > 0.45,
          tankColor: TANK_COLORS[Math.floor(Math.random() * TANK_COLORS.length)],
        });
      }
    }
    return result;
  }, [facadeVariants]);

  return (
    <group>
      {buildings.map((b, i) => {
        const [w, h, d] = b.size;
        const [x, , z] = b.position;
        return (
          <group key={i}>
            {/* Tower with windowed facade tinted to the wall colour */}
            <mesh position={b.position} castShadow receiveShadow>
              <boxGeometry args={b.size} />
              <meshStandardMaterial color={b.color} map={b.facade} roughness={0.62} metalness={0.08} />
            </mesh>

            {/* Flat roof slab */}
            <mesh position={[x, h + 0.15, z]} castShadow receiveShadow>
              <boxGeometry args={[w + 0.3, 0.3, d + 0.3]} />
              <meshStandardMaterial color={b.roofColor} roughness={0.85} />
            </mesh>

            {/* Parapet edge */}
            <mesh position={[x, h + 0.55, z]}>
              <boxGeometry args={[w + 0.3, 0.5, d + 0.3]} />
              <meshStandardMaterial color={b.roofColor} roughness={0.9} wireframe />
            </mesh>

            {/* Delhi-signature rooftop water tank */}
            {b.tank && (
              <group position={[x + w * 0.22, h + 1.1, z - d * 0.22]}>
                <mesh castShadow>
                  <cylinderGeometry args={[0.9, 0.9, 1.4, 12]} />
                  <meshStandardMaterial color={b.tankColor} roughness={0.6} />
                </mesh>
                <mesh position={[0, -1.0, 0]}>
                  <boxGeometry args={[1.8, 0.6, 1.8]} />
                  <meshStandardMaterial color={0x555555} roughness={0.8} />
                </mesh>
              </group>
            )}
          </group>
        );
      })}
    </group>
  );
}
