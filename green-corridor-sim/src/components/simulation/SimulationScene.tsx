import { laneDataTracker } from '@/simulation/LaneDataTracker';
import type { ApproachLane, Direction, SignalState, TrafficState } from '@/simulation/TrafficController';
import { TrafficController } from '@/simulation/TrafficController';
import { vehicleManager } from '@/simulation/VehicleManager';
import { Billboard, OrbitControls, Sky, Text } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Buildings } from './Buildings';
import { Crosswalks } from './Crosswalks';
import { DelhiLandmarks } from './DelhiLandmarks';
import { IntersectionMarker } from './IntersectionMarker';
import { RealisticAmbulanceMoving } from './RealisticAmbulanceMoving';
import { RealisticCivilianAuto } from './RealisticCivilianAuto';
import { RealisticCivilianBike } from './RealisticCivilianBike';
import { RealisticCivilianCar } from './RealisticCivilianCar';
import { LANE_POSITIONS, Road } from './Road';
import { SystemHUD } from './SystemHUD';
import { TrafficLight } from './TrafficLight';

type PriorityClass = 'CRITICAL' | 'HIGH' | 'NORMAL';

interface EMVDispatch {
  direction: Direction;
  priorityClass: PriorityClass;
  etaSeconds: number;
}

const PRIORITY_CLASS_RANK: Record<PriorityClass, number> = { CRITICAL: 3, HIGH: 2, NORMAL: 1 };

const MAIN_INTERSECTION_CENTER = { x: 0, z: 0 };
const APPROACH_MIN = 17; // near stop line
const APPROACH_MAX = 80; // upstream queue window
const HOSPITAL_TARGET: [number, number] = [52, 70]; // Building location moved further back from the road
const HOSPITAL_APPROACH_POINT: [number, number] = [52, 100]; // Invisible road terminal point on the lower east-west corridor
const HOSPITAL_CONNECTOR_DIRECTION = Math.sign(HOSPITAL_APPROACH_POINT[1] - HOSPITAL_TARGET[1]) || -1;
const HOSPITAL_TERMINAL_POINT: [number, number] = [
  HOSPITAL_TARGET[0] + 1,
  HOSPITAL_TARGET[1] + HOSPITAL_CONNECTOR_DIRECTION * 9.5,
]; // Hospital connector-road end near entrance side that faces the road

// All 9 intersections in a 3x3 grid
const INTERSECTION_CENTERS = [
  { x: 0, z: 0 },       // Center
  { x: 100, z: 0 },     // East
  { x: -100, z: 0 },    // West
  { x: 0, z: 100 },     // South
  { x: 0, z: -100 },    // North
  { x: 100, z: 100 },   // South-East
  { x: -100, z: 100 },  // South-West
  { x: 100, z: -100 },  // North-East
  { x: -100, z: -100 }, // North-West
];

// Generate intersection ID from coordinates
function getIntersectionId(centerX: number, centerZ: number): string {
  return `${centerX}_${centerZ}`;
}

function getLocalSignalMetrics(centerX: number, centerZ: number, lane: ApproachLane) {
  const vehicles = (vehicleManager as any).vehicles as Map<string, {
    lane: string;
    position: number;
    isEmergency: boolean;
    worldX?: number;
    worldZ?: number;
  }>;

  let queueCount = 0;
  let ambulanceDetected = false;
  const LANE_CENTER_TOLERANCE = 10;

  for (const [, vehicle] of vehicles) {
    if (vehicle.lane !== lane) continue;

    const p = vehicle.position;
    const vx = vehicle.worldX;
    const vz = vehicle.worldZ;
    let inWindow = false;

    switch (lane) {
      case 'N':
        inWindow = p >= centerZ + APPROACH_MIN && p <= centerZ + APPROACH_MAX;
        if (typeof vx === 'number') {
          inWindow = inWindow && Math.abs(vx - centerX) <= LANE_CENTER_TOLERANCE;
        }
        break;
      case 'S':
        inWindow = p <= centerZ - APPROACH_MIN && p >= centerZ - APPROACH_MAX;
        if (typeof vx === 'number') {
          inWindow = inWindow && Math.abs(vx - centerX) <= LANE_CENTER_TOLERANCE;
        }
        break;
      case 'E':
        inWindow = p <= centerX - APPROACH_MIN && p >= centerX - APPROACH_MAX;
        if (typeof vz === 'number') {
          inWindow = inWindow && Math.abs(vz - centerZ) <= LANE_CENTER_TOLERANCE;
        }
        break;
      case 'W':
        inWindow = p >= centerX + APPROACH_MIN && p <= centerX + APPROACH_MAX;
        if (typeof vz === 'number') {
          inWindow = inWindow && Math.abs(vz - centerZ) <= LANE_CENTER_TOLERANCE;
        }
        break;
    }

    if (!inWindow) continue;

    if (vehicle.isEmergency) {
      ambulanceDetected = true;
    } else {
      queueCount += 1;
    }
  }

  return { queueCount, ambulanceDetected };
}

// Named after real Delhi high-traffic junctions for an authentic feel.
const INTERSECTION_MARKERS = [
  { position: [0, 0, 0] as [number, number, number], intersectionId: 'main-intersection', intersectionName: 'ITO Junction' },
  { position: [100, 0, 0] as [number, number, number], intersectionId: 'intersection-east-1', intersectionName: 'Mandi House' },
  { position: [-100, 0, 0] as [number, number, number], intersectionId: 'intersection-west-1', intersectionName: 'Connaught Place' },
  { position: [0, 0, 100] as [number, number, number], intersectionId: 'intersection-south-1', intersectionName: 'Pragati Maidan' },
  { position: [0, 0, -100] as [number, number, number], intersectionId: 'intersection-north-1', intersectionName: 'Delhi Gate' },
  { position: [100, 0, 100] as [number, number, number], intersectionId: 'intersection-south-east-1', intersectionName: 'Ashram Chowk' },
  { position: [-100, 0, 100] as [number, number, number], intersectionId: 'intersection-south-west-1', intersectionName: 'AIIMS Chowk' },
  { position: [100, 0, -100] as [number, number, number], intersectionId: 'intersection-north-east-1', intersectionName: 'Kashmere Gate' },
  { position: [-100, 0, -100] as [number, number, number], intersectionId: 'intersection-north-west-1', intersectionName: 'Dhaula Kuan' },
];

const TURN_PREVIEW_MAP: Record<ApproachLane, [ApproachLane, ApproachLane, ApproachLane]> = {
  N: ['N', 'E', 'W'],
  S: ['S', 'W', 'E'],
  E: ['E', 'S', 'N'],
  W: ['W', 'N', 'S'],
};

function getNearestIntersectionAxis(value: number): number {
  const axes = [0, 100, -100];
  return axes.reduce((best, axis) => (Math.abs(value - axis) < Math.abs(value - best) ? axis : best), axes[0]);
}

function getLaneGlowTransform(centerX: number, centerZ: number, lane: ApproachLane) {
  const laneOffset = LANE_POSITIONS[lane][0];
  const longLength = 86;
  const laneWidth = 4.2;

  if (lane === 'N' || lane === 'S') {
    return {
      position: [centerX + laneOffset, 0.06, centerZ] as [number, number, number],
      geometry: [laneWidth, longLength] as [number, number],
    };
  }

  return {
    position: [centerX, 0.06, centerZ + laneOffset] as [number, number, number],
    geometry: [longLength, laneWidth] as [number, number],
  };
}

function getArrowRotationForLane(lane: ApproachLane): number {
  switch (lane) {
    case 'N':
      return Math.PI;
    case 'S':
      return 0;
    case 'E':
      return Math.PI / 2;
    case 'W':
    default:
      return -Math.PI / 2;
  }
}

function getArrowOffsetForLane(lane: ApproachLane): [number, number, number] {
  switch (lane) {
    case 'N':
      return [0, 0, -8];
    case 'S':
      return [0, 0, 8];
    case 'E':
      return [8, 0, 0];
    case 'W':
    default:
      return [-8, 0, 0];
  }
}

function DirectionArrowMarker({
  centerX,
  centerZ,
  lane,
  flashing,
}: {
  centerX: number;
  centerZ: number;
  lane: ApproachLane;
  flashing?: boolean;
}) {
  const headRef = useRef<THREE.MeshStandardMaterial>(null);
  const stemRef = useRef<THREE.MeshStandardMaterial>(null);
  const [dx, dy, dz] = getArrowOffsetForLane(lane);
  const rotationY = getArrowRotationForLane(lane);

  useFrame(({ clock }) => {
    const pulse = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 8.5);
    const opacity = flashing ? 0.28 + 0.52 * pulse : 0.9;
    const emissive = flashing ? 0.55 + 1.15 * pulse : 1.6;

    if (headRef.current) {
      headRef.current.opacity = opacity;
      headRef.current.emissiveIntensity = emissive;
    }
    if (stemRef.current) {
      stemRef.current.opacity = opacity;
      stemRef.current.emissiveIntensity = emissive * 0.9;
    }
  });

  return (
    <group position={[centerX + dx, 2.8 + dy, centerZ + dz]} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 0, 1.15]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.9, 2.1, 16]} />
        <meshStandardMaterial
          ref={headRef}
          color={0x35ff70}
          emissive={0x24ff61}
          emissiveIntensity={1.2}
          transparent
          opacity={flashing ? 0.45 : 0.9}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[0.5, 0.5, 2.2]} />
        <meshStandardMaterial
          ref={stemRef}
          color={0x2eff6c}
          emissive={0x22ff5e}
          emissiveIntensity={1.0}
          transparent
          opacity={flashing ? 0.42 : 0.88}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function EmergencyOverrideOverlay({
  centerX,
  centerZ,
  label,
}: {
  centerX: number;
  centerZ: number;
  label: string;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const bgRef = useRef<THREE.MeshStandardMaterial>(null);

  useFrame(({ clock }) => {
    const pulse = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 6.5);
    const scale = 1 + 0.08 * pulse;
    if (groupRef.current) {
      groupRef.current.scale.setScalar(scale);
    }
    if (bgRef.current) {
      bgRef.current.opacity = 0.45 + 0.4 * pulse;
      bgRef.current.emissiveIntensity = 0.2 + 0.45 * pulse;
    }
  });

  return (
    <Billboard position={[centerX, 11.5, centerZ]} follow lockX={false} lockY={false} lockZ={false}>
      <group ref={groupRef}>
        <mesh position={[0, 0, -0.01]}>
          <planeGeometry args={[8.4, 1.7]} />
          <meshStandardMaterial
            ref={bgRef}
            color={0x260000}
            emissive={0xff3030}
            emissiveIntensity={0.3}
            transparent
            opacity={0.6}
          />
        </mesh>
        <Text
          position={[0, 0.22, 0]}
          fontSize={0.38}
          color="#FF4D4D"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.02}
          outlineColor="#000000"
        >
          AMBULANCE OVERRIDE
        </Text>
        <Text
          position={[0, -0.34, 0]}
          fontSize={0.24}
          color="#FFD6D6"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.015}
          outlineColor="#000000"
        >
          {label}
        </Text>
      </group>
    </Billboard>
  );
}

function HospitalLandmark() {
  const [targetX, targetZ] = HOSPITAL_TARGET;
  const [, approachZ] = HOSPITAL_APPROACH_POINT;
  const connectorDirection = HOSPITAL_CONNECTOR_DIRECTION;
  const drivewayX = targetX + 1;
  const drivewayStartZ = approachZ + connectorDirection * 6;
  const drivewayEndZ = targetZ + connectorDirection * 9.5;
  const drivewayLength = Math.max(6, Math.abs(drivewayEndZ - drivewayStartZ));
  const drivewayCenterZ = (drivewayStartZ + drivewayEndZ) / 2;
  const drivewayDashCount = Math.max(2, Math.floor(drivewayLength / 3.5));
  const entranceOffsetZ = connectorDirection * 9;
  const entranceAwningOffsetZ = connectorDirection * 9.5;
  const entranceMarkerOffsetZ = connectorDirection * 9.5;

  return (
    <group>
      {/* Ground parking area */}
      <mesh position={[targetX - 10, 0.03, targetZ - 6]} receiveShadow>
        <planeGeometry args={[16, 10]} />
        <meshStandardMaterial color={0x5a6a7a} roughness={0.85} />
      </mesh>

      {/* Connector driveway from main road to hospital entrance */}
      <mesh position={[drivewayX, 0.06, drivewayCenterZ]} receiveShadow>
        <boxGeometry args={[5.2, 0.08, drivewayLength]} />
        <meshStandardMaterial color={0x444444} roughness={0.8} metalness={0.04} />
      </mesh>

      {/* Center divider strip similar to main roads */}
      <mesh position={[drivewayX, 0.11, drivewayCenterZ]} receiveShadow>
        <boxGeometry args={[0.3, 0.03, drivewayLength]} />
        <meshStandardMaterial color={0x222222} roughness={0.8} />
      </mesh>

      {/* Dashed lane marks on connector */}
      {Array.from({ length: drivewayDashCount }).map((_, i) => {
        const z = drivewayStartZ + connectorDirection * (1.2 + i * 3.5);
        const beyondDriveway = connectorDirection > 0 ? z > drivewayEndZ - 1 : z < drivewayEndZ + 1;
        if (beyondDriveway) return null;
        return (
          <mesh key={`hospital-drive-dash-${i}`} position={[drivewayX, 0.135, z]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.14, 1.6]} />
            <meshBasicMaterial color={0xffffff} />
          </mesh>
        );
      })}

      {/* Main building footprint */}
      <mesh position={[targetX, 0.05, targetZ]} receiveShadow>
        <planeGeometry args={[22, 18]} />
        <meshStandardMaterial color={0x4a5a6a} roughness={0.9} />
      </mesh>

      {/* Central main wing - tallest */}
      <mesh position={[targetX + 1, 7, targetZ + 1]} castShadow receiveShadow>
        <boxGeometry args={[11, 14, 9]} />
        <meshStandardMaterial color={0xf5f5f5} roughness={0.4} metalness={0.1} />
      </mesh>

      {/* Left wing */}
      <mesh position={[targetX - 7, 4.5, targetZ - 2]} castShadow receiveShadow>
        <boxGeometry args={[7, 9, 7]} />
        <meshStandardMaterial color={0xe8e8e8} roughness={0.45} metalness={0.05} />
      </mesh>

      {/* Right wing */}
      <mesh position={[targetX + 8, 4.5, targetZ - 2]} castShadow receiveShadow>
        <boxGeometry args={[6, 9, 6]} />
        <meshStandardMaterial color={0xf0f0f0} roughness={0.42} metalness={0.08} />
      </mesh>

      {/* Windows panel on main building - single textured element */}
      <mesh position={[targetX + 1, 6, targetZ + 4.6]} receiveShadow>
        <boxGeometry args={[10, 9, 0.5]} />
        <meshStandardMaterial 
          color={0x4da6ff} 
          emissive={0x2d5a99} 
          emissiveIntensity={0.25} 
          metalness={0.7} 
          roughness={0.1} 
        />
      </mesh>

      {/* Windows panel on left wing */}
      <mesh position={[targetX - 7, 4, targetZ + 0.2]} receiveShadow>
        <boxGeometry args={[6, 6, 0.4]} />
        <meshStandardMaterial 
          color={0x4da6ff} 
          emissive={0x2d5a99} 
          emissiveIntensity={0.2} 
          metalness={0.65} 
          roughness={0.12} 
        />
      </mesh>

      {/* Windows panel on right wing */}
      <mesh position={[targetX + 8, 4, targetZ + 0.2]} receiveShadow>
        <boxGeometry args={[5, 6, 0.4]} />
        <meshStandardMaterial 
          color={0x4da6ff} 
          emissive={0x2d5a99} 
          emissiveIntensity={0.15} 
          metalness={0.6} 
          roughness={0.15} 
        />
      </mesh>

      {/* Entrance portico */}
      <mesh position={[targetX + 1, 5, targetZ + entranceOffsetZ]} castShadow receiveShadow>
        <boxGeometry args={[7.5, 5.5, 1.8]} />
        <meshStandardMaterial color={0xcccccc} roughness={0.35} />
      </mesh>

      {/* Entrance awning - red accent */}
      <mesh position={[targetX + 1, 8.5, targetZ + entranceAwningOffsetZ]} castShadow receiveShadow>
        <boxGeometry args={[8.5, 0.5, 2]} />
        <meshStandardMaterial color={0xdd3333} emissive={0xbb2222} emissiveIntensity={0.2} roughness={0.3} />
      </mesh>

      {/* Medical cross on main building */}
      <mesh position={[targetX + 1, 10.2, targetZ + 4.8]}>
        <boxGeometry args={[4.2, 0.35, 0.5]} />
        <meshStandardMaterial color={0xee2020} emissive={0xff3030} emissiveIntensity={0.6} />
      </mesh>
      <mesh position={[targetX + 1, 10.2, targetZ + 4.8]}>
        <boxGeometry args={[0.5, 5, 0.5]} />
        <meshStandardMaterial color={0xee2020} emissive={0xff3030} emissiveIntensity={0.6} />
      </mesh>

      {/* Roof accent */}
      <mesh position={[targetX - 1, 14.1, targetZ + 1]} castShadow>
        <boxGeometry args={[10, 0.3, 8.5]} />
        <meshStandardMaterial color={0x2a3a3a} roughness={0.6} metalness={0.2} />
      </mesh>

      {/* Emergency drop-off area */}
      <mesh position={[targetX - 10, 0.25, targetZ - 6]} receiveShadow>
        <cylinderGeometry args={[3, 3, 0.4, 16]} />
        <meshStandardMaterial color={0xff4444} emissive={0xff6666} emissiveIntensity={0.45} />
      </mesh>

      {/* Hospital sign pole */}
      <mesh position={[targetX - 11, 3, targetZ + 6]} castShadow>
        <cylinderGeometry args={[0.2, 0.25, 6, 6]} />
        <meshStandardMaterial color={0x333333} roughness={0.6} />
      </mesh>

      {/* Hospital sign board */}
      {/* <mesh position={[targetX - 11, 6.5, targetZ + 6.3]} castShadow receiveShadow>
        <boxGeometry args={[5.5, 2, 0.35]} />
        <meshStandardMaterial color={0x003d82} roughness={0.3} />
      </mesh> */}

      {/* Hospital sign text */}
      <Billboard position={[targetX - 11, 7, targetZ + 6.7]}>
        <Text
          fontSize={1.2}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.5}
          outlineColor="#000000"
        >
          CITY HOSPITAL
        </Text>
      </Billboard>

      {/* Entrance marker */}
      <mesh position={[targetX + 1, 0.2, targetZ + entranceMarkerOffsetZ]} receiveShadow>
        <cylinderGeometry args={[2.8, 2.8, 0.35, 16]} />
        <meshStandardMaterial color={0xff2020} emissive={0xff4040} emissiveIntensity={0.5} />
      </mesh>
    </group>
  );
}

function TrafficSystem() {
  // Create a controller for each of the 9 intersections
  const controllersRef = useRef<Map<string, TrafficController>>(new Map());
  const [signalSnapshots, setSignalSnapshots] = useState<Map<string, TrafficState>>(new Map());

  // Initialize all controllers on first render
  useEffect(() => {
    for (const intersection of INTERSECTION_CENTERS) {
      const id = getIntersectionId(intersection.x, intersection.z);
      if (!controllersRef.current.has(id)) {
        controllersRef.current.set(id, new TrafficController());
      }
    }
  }, []);

  const [ambulanceActive, setAmbulanceActive] = useState(false);
  const [ambulanceDir, setAmbulanceDir] = useState<Direction>('NS');
  const [emvSpawnKey, setEmvSpawnKey] = useState(0);
  const activeEMVRef = useRef<Pick<EMVDispatch, 'priorityClass' | 'etaSeconds'> | null>(null);
  const [flowRate, setFlowRate] = useState(42);
  const autoDispatchRef = useRef<number | null>(null);
  const activeEmergencyIntersectionRef = useRef<string | null>(null);
  const [corridorSelections, setCorridorSelections] = useState<Record<string, ApproachLane>>({});
  const [approachPath, setApproachPath] = useState<{
    id: string;
    centerX: number;
    centerZ: number;
    lane: ApproachLane;
  } | null>(null);
  const [corridorPreview, setCorridorPreview] = useState<{
    id: string;
    centerX: number;
    centerZ: number;
    lanes: [ApproachLane, ApproachLane, ApproachLane];
  } | null>(null);

  const getLaneSignalAtIntersection = useCallback(
    (centerX: number, centerZ: number, lane: ApproachLane): SignalState => {
      const id = getIntersectionId(centerX, centerZ);
      const controller = controllersRef.current.get(id);
      // Local green-corridor emergency always wins — even at the main intersection
      // where an external SIGNAL_STATE_UPDATE override is applied. Otherwise the
      // ambulance reads the externally-forced color (which knows nothing about the
      // locally-dispatched EMV) and stalls at the stop line instead of getting its
      // preempted green.
      if (controller && controller.getState().mode === 'emergency') {
        return controller.getLaneSignal(lane);
      }
      if (id === getIntersectionId(MAIN_INTERSECTION_CENTER.x, MAIN_INTERSECTION_CENTER.z)) {
         const override = (window as any).__simSignalOverride;
         if (override) {
            const phaseMap: Record<ApproachLane, string> = { N: 'NORTH', S: 'SOUTH', E: 'EAST', W: 'WEST' };
            const color = override[phaseMap[lane]];
            if (color === 'red' || color === 'green' || color === 'yellow') return color as SignalState;
         }
      }
      return controller ? controller.getLaneSignal(lane) : 'red';
    },
    []
  );

  // Helper to get time remaining for a lane at a specific intersection
  const getLaneRemainingSecondsAtIntersection = useCallback(
    (centerX: number, centerZ: number, lane: ApproachLane): number | null => {
      const id = getIntersectionId(centerX, centerZ);
      const controller = controllersRef.current.get(id);
      return controller ? controller.getLaneRemainingSeconds(lane) : null;
    },
    []
  );

  useFrame((_, dt) => {
    // Update each of the 9 intersection controllers independently
    for (const intersection of INTERSECTION_CENTERS) {
      const id = getIntersectionId(intersection.x, intersection.z);
      const controller = controllersRef.current.get(id);
      if (!controller) continue;

      // Compute local metrics for this intersection
      const localMetrics = {
        N: getLocalSignalMetrics(intersection.x, intersection.z, 'N'),
        E: getLocalSignalMetrics(intersection.x, intersection.z, 'E'),
        S: getLocalSignalMetrics(intersection.x, intersection.z, 'S'),
        W: getLocalSignalMetrics(intersection.x, intersection.z, 'W'),
      };

      // Feed metrics to this intersection's controller
      controller.setLaneInputs(localMetrics);
      // Update this intersection's controller
      controller.update(dt);
    }

    // Update signal snapshots state with all controller states
    const newSnapshots = new Map<string, TrafficState>();
    for (const [id, controller] of controllersRef.current) {
      newSnapshots.set(id, controller.getState());
    }
    setSignalSnapshots(newSnapshots);

    setFlowRate(Math.floor(38 + Math.random() * 8));
  });

  const handleApproach = useCallback(() => {
    // Kept for compatibility with ambulance callbacks.
  }, []);

  // Helper: Determine which intersection center a vehicle should check signals from
  const getIntersectionCenterForVehicle = useCallback(
    (lane: ApproachLane, position: number): { x: number; z: number } => {
      const INTERSECTION_POSITIONS = [0, 100, -100];
      let closest = MAIN_INTERSECTION_CENTER;
      let minDist = Infinity;

      for (const pos of INTERSECTION_POSITIONS) {
        const dist = Math.abs(position - pos);
        if (dist < minDist) {
          minDist = dist;
          closest = lane === 'N' || lane === 'S'
            ? { x: MAIN_INTERSECTION_CENTER.x, z: pos }
            : { x: pos, z: MAIN_INTERSECTION_CENTER.z };
        }
      }
      return closest;
    },
    []
  );

  const getNearestIntersectionFromWorldPos = useCallback((worldX: number, worldZ: number): { x: number; z: number } => {
    let best = INTERSECTION_CENTERS[0];
    let bestDistSq = Infinity;
    for (const center of INTERSECTION_CENTERS) {
      const dx = worldX - center.x;
      const dz = worldZ - center.z;
      const distSq = dx * dx + dz * dz;
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        best = center;
      }
    }
    return best;
  }, []);

  const handleAmbulancePositionUpdate = useCallback((lane: ApproachLane, worldX: number, worldZ: number) => {
    const axisPosition = lane === 'N' || lane === 'S' ? worldZ : worldX;
    const laneDirection = lane === 'N' || lane === 'W' ? -1 : 1;
    const nextLine = [0, 100, -100].reduce<number | undefined>((best, line) => {
      const projectedDelta = (line - axisPosition) * laneDirection;
      if (projectedDelta <= 0) return best;
      if (best === undefined) return line;
      const bestDelta = (best - axisPosition) * laneDirection;
      return projectedDelta < bestDelta ? line : best;
    }, undefined);

    const directionForLane: Direction = lane === 'N' || lane === 'S' ? 'NS' : 'EW';
    const nearestCenter = getNearestIntersectionFromWorldPos(worldX, worldZ);
    const nearestId = getIntersectionId(nearestCenter.x, nearestCenter.z);

    const previewCenterX = nextLine !== undefined
      ? (lane === 'N' || lane === 'S' ? getNearestIntersectionAxis(worldX) : nextLine)
      : nearestCenter.x;
    const previewCenterZ = nextLine !== undefined
      ? (lane === 'N' || lane === 'S' ? nextLine : getNearestIntersectionAxis(worldZ))
      : nearestCenter.z;
    const previewId = getIntersectionId(previewCenterX, previewCenterZ);

    const targetEmergencyId = nextLine !== undefined ? previewId : nearestId;
    if (activeEmergencyIntersectionRef.current !== targetEmergencyId) {
      const previousId = activeEmergencyIntersectionRef.current;
      if (previousId) {
        const prevController = controllersRef.current.get(previousId);
        prevController?.clearEmergency();
      }
      activeEmergencyIntersectionRef.current = targetEmergencyId;
    }

    const targetController = controllersRef.current.get(targetEmergencyId);
    targetController?.triggerEmergency(directionForLane, lane);

    if (nextLine === undefined) {
      setApproachPath(null);
      setCorridorPreview(null);
      return;
    }

    const distanceToIntersection = Math.abs(nextLine - axisPosition);
    if (distanceToIntersection > 60) {
      setApproachPath(null);
      setCorridorPreview(null);
      return;
    }

    setApproachPath((prev) => {
      if (
        prev &&
        prev.id === previewId &&
        prev.lane === lane &&
        prev.centerX === previewCenterX &&
        prev.centerZ === previewCenterZ
      ) {
        return prev;
      }
      return {
        id: previewId,
        centerX: previewCenterX,
        centerZ: previewCenterZ,
        lane,
      };
    });

    setCorridorPreview((prev) => {
      const lanes = TURN_PREVIEW_MAP[lane];
      if (
        prev &&
        prev.id === previewId &&
        prev.lanes[0] === lanes[0] &&
        prev.lanes[1] === lanes[1] &&
        prev.lanes[2] === lanes[2]
      ) {
        return prev;
      }
      return {
        id: previewId,
        centerX: previewCenterX,
        centerZ: previewCenterZ,
        lanes,
      };
    });
  }, [getNearestIntersectionFromWorldPos]);

  const handleAmbulanceRouteDecision = useCallback((centerX: number, centerZ: number, selectedLane: ApproachLane) => {
    const id = getIntersectionId(centerX, centerZ);
    setCorridorSelections((prev) => ({ ...prev, [id]: selectedLane }));
    setCorridorPreview((prev) => (prev?.id === id ? null : prev));
    setApproachPath((prev) => (prev?.id === id ? null : prev));
  }, []);

  const handlePassed = useCallback(() => {
    // Clear emergency from all intersections
    for (const [, controller] of controllersRef.current) {
      controller.clearEmergency();
    }
    activeEmergencyIntersectionRef.current = null;
    activeEMVRef.current = null;
    setApproachPath(null);
    setCorridorPreview(null);
    setCorridorSelections({});
    setAmbulanceActive(false);
  }, []);

  const dispatchEMV = useCallback((incoming: EMVDispatch) => {
    const current = activeEMVRef.current;
    if (current !== null) {
      const inRank = PRIORITY_CLASS_RANK[incoming.priorityClass];
      const curRank = PRIORITY_CLASS_RANK[current.priorityClass];
      const wins = inRank > curRank || (inRank === curRank && incoming.etaSeconds < current.etaSeconds);
      if (!wins) return;
    }
    activeEMVRef.current = { priorityClass: incoming.priorityClass, etaSeconds: incoming.etaSeconds };
    activeEmergencyIntersectionRef.current = null;
    setApproachPath(null);
    setCorridorPreview(null);
    setCorridorSelections({});
    setAmbulanceDir(incoming.direction);
    setAmbulanceActive(true);
    setEmvSpawnKey((prev) => prev + 1);
  }, []);

  const spawnAmbulance = useCallback((dir: Direction) => {
    dispatchEMV({ direction: dir, priorityClass: 'HIGH', etaSeconds: 30 });
  }, [dispatchEMV]);

  // Auto-dispatch an ambulance periodically when none is active.
  useEffect(() => {
    if (ambulanceActive) {
      if (autoDispatchRef.current) {
        clearTimeout(autoDispatchRef.current);
        autoDispatchRef.current = null;
      }
      return;
    }

    const delay = 15000 + Math.random() * 15000; // 15–30s between automatic calls
    autoDispatchRef.current = window.setTimeout(() => {
      const dir: Direction = Math.random() > 0.5 ? 'NS' : 'EW';
      dispatchEMV({ direction: dir, priorityClass: 'NORMAL', etaSeconds: 60 });
    }, delay);

    return () => {
      if (autoDispatchRef.current) {
        clearTimeout(autoDispatchRef.current);
        autoDispatchRef.current = null;
      }
    };
  }, [ambulanceActive, dispatchEMV]);

  const handleIntersectionClick = useCallback((intersectionId: string) => {
    // Send message to parent window
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({
        type: 'INTERSECTION_SELECTED',
        intersectionId: intersectionId
      }, '*');
    }
  }, []);

  const getCarOffsets = (lane: ApproachLane) => {
    const laneMap: Record<ApproachLane, string> = { N: 'NORTH', S: 'SOUTH', E: 'EAST', W: 'WEST' };
    const vehicleCounts = (window as any).__simVehicleCounts;
    const count = vehicleCounts ? vehicleCounts[laneMap[lane]] : null;
    
    // Convert count to spacing. If count is 0, make spacing huge so no cars spawn.
    const spacing = count !== null 
      ? (count === 0 ? 9999 : Math.max(12, 120 - count * 4)) 
      : 20;

    const offsets: number[] = [];
    if (spacing > 1000) return offsets;

    const INTERSECTION_CENTERS = [0, 100, -100];
    const INTERSECTION_CLEAR_RADIUS = 22;

    for (let v = -180; v <= 180; v += spacing) {
      const insideIntersectionZone = INTERSECTION_CENTERS.some(
        (c) => Math.abs(v - c) <= INTERSECTION_CLEAR_RADIUS,
      );
      if (!insideIntersectionZone) offsets.push(v);
    }

    return offsets;
  };

  const laneLightPlacement = (centerX: number, centerZ: number, lane: ApproachLane) => {
    switch (lane) {
      case 'N':
        // Approaching from south moving north; right side is +X.
        return { position: [centerX + 14, 0, centerZ + 17] as [number, number, number], rotation: 0 };
      case 'S':
        // Approaching from north moving south; right side is -X.
        return { position: [centerX - 14, 0, centerZ - 17] as [number, number, number], rotation: Math.PI };
      case 'E':
        // Approaching from west moving east; right side is +Z.
        return { position: [centerX - 17, 0, centerZ + 14] as [number, number, number], rotation: -Math.PI / 2 };
      case 'W':
      default:
        // Approaching from east moving west; right side is -Z.
        return { position: [centerX + 17, 0, centerZ - 14] as [number, number, number], rotation: Math.PI / 2 };
    }
  };

  // Helper function to get vehicle type based on index for variety
  const getVehicleComponent = (lane: string, offset: number, index: number) => {
    const vehicleType = index % 3; // 0: car, 1: bike, 2: auto
    const laneIndex = index % 2; // Alternate between lanes 0 and 1
    
    const emergencyYield = mode === 'emergency' &&
      ((lane === 'N' || lane === 'S') ? ambulanceDir === 'NS' : ambulanceDir === 'EW');

    // Signal getter that determines the correct intersection based on position
    const getSignalForLaneAware = (l: ApproachLane, position?: number) => {
      // Use the offset as position hint if position not provided
      const pos = position ?? offset;
      const intersectionCenter = getIntersectionCenterForVehicle(l, pos);
      return getLaneSignalAtIntersection(intersectionCenter.x, intersectionCenter.z, l);
    };

    switch (vehicleType) {
      case 0:
        return <RealisticCivilianCar
          key={`${lane}${index}`}
          lane={lane as 'N' | 'S' | 'E' | 'W'}
          offset={offset}
          laneIndex={laneIndex}
          getSignalForLane={getSignalForLaneAware}
          emergencyYield={emergencyYield}
        />;
      case 1:
        return <RealisticCivilianBike
          key={`${lane}${index}`}
          lane={lane as 'N' | 'S' | 'E' | 'W'}
          offset={offset}
          laneIndex={laneIndex}
          getSignalForLane={getSignalForLaneAware}
          emergencyYield={emergencyYield}
        />;
      case 2:
        return <RealisticCivilianAuto
          key={`${lane}${index}`}
          lane={lane as 'N' | 'S' | 'E' | 'W'}
          offset={offset}
          laneIndex={laneIndex}
          getSignalForLane={getSignalForLaneAware}
          emergencyYield={emergencyYield}
        />;
      default:
        return null;
    }
  };

  // Get state from main intersection for HUD
  const mainId = getIntersectionId(MAIN_INTERSECTION_CENTER.x, MAIN_INTERSECTION_CENTER.z);
  const mainSnapshot = signalSnapshots.get(mainId);
  const hasAnyEmergency = INTERSECTION_CENTERS.some(({ x, z }) => {
    const state = signalSnapshots.get(getIntersectionId(x, z));
    return state?.mode === 'emergency';
  });
  const mode = hasAnyEmergency ? 'emergency' : 'normal';
  const nsSignal = mainSnapshot?.nsSignal ?? 'red';
  const ewSignal = mainSnapshot?.ewSignal ?? 'red';

  return (
    <>
      <Road />
      <Buildings />
      <Crosswalks />
      <DelhiLandmarks />
      <HospitalLandmark />
      {/* <Pedestrians nsSignal={nsSignal} ewSignal={ewSignal} /> */}

      {/* One signal per approach lane for all 9 intersections */}
      {([0, 100, -100] as const).flatMap((cx) =>
        ([0, 100, -100] as const).flatMap((cz) =>
          (['N', 'E', 'S', 'W'] as ApproachLane[]).map((lane) => {
            const placement = laneLightPlacement(cx, cz, lane);
            const localMetrics = getLocalSignalMetrics(cx, cz, lane);
            const signal = getLaneSignalAtIntersection(cx, cz, lane);
            const timeRemaining = getLaneRemainingSecondsAtIntersection(cx, cz, lane);
            return (
              <TrafficLight
                key={`sig-${cx}-${cz}-${lane}`}
                position={placement.position}
                signal={signal}
                timeRemaining={timeRemaining}
                queueCount={localMetrics.queueCount}
                ambulanceDetected={localMetrics.ambulanceDetected}
                rotation={placement.rotation}
              />
            );
          })
        )
      )}

      {/* Flashing emergency override banner for every intersection currently in override mode */}
      {INTERSECTION_CENTERS.map(({ x, z }) => {
        const id = getIntersectionId(x, z);
        if (activeEmergencyIntersectionRef.current !== id) return null;

        const marker = INTERSECTION_MARKERS.find((m) => m.position[0] === x && m.position[2] === z);
        return (
          <EmergencyOverrideOverlay
            key={`override-${x}-${z}`}
            centerX={x}
            centerZ={z}
            label={marker?.intersectionName ?? `Intersection ${x},${z}`}
          />
        );
      })}

      {/* Flashing three-route preview at upcoming intersection */}
      {corridorPreview?.lanes.map((lane, idx) => {
        const hasSelectedLane = corridorSelections[corridorPreview.id];
        if (hasSelectedLane && hasSelectedLane !== lane) return null;
        return (
          <DirectionArrowMarker
            key={`corridor-preview-arrow-${corridorPreview.id}-${lane}-${idx}`}
            centerX={corridorPreview.centerX}
            centerZ={corridorPreview.centerZ}
            lane={lane}
            flashing={!hasSelectedLane}
          />
        );
      })}

      {/* Selected route arrows kept per visited intersection */}
      {Object.entries(corridorSelections).map(([id, lane]) => {
        const [xStr, zStr] = id.split('_');
        const centerX = Number(xStr);
        const centerZ = Number(zStr);
        if (!Number.isFinite(centerX) || !Number.isFinite(centerZ)) return null;
        return (
          <DirectionArrowMarker
            key={`corridor-selected-arrow-${id}`}
            centerX={centerX}
            centerZ={centerZ}
            lane={lane}
          />
        );
      })}

      {/* Civilian vehicles on main roads with variety (cars, bikes, autos) */}
      {getCarOffsets('N').map((o, i) => getVehicleComponent('N', o, i))}
      {getCarOffsets('S').map((o, i) => getVehicleComponent('S', -o, i + 6))}
      {getCarOffsets('E').map((o, i) => getVehicleComponent('E', o, i + 12))}
      {getCarOffsets('W').map((o, i) => getVehicleComponent('W', -o, i + 18))}

      {/* Realistic Ambulance */}
      <RealisticAmbulanceMoving
        active={ambulanceActive}
        direction={ambulanceDir}
        spawnKey={emvSpawnKey}
        hospitalTarget={HOSPITAL_TARGET}
        hospitalApproachPoint={HOSPITAL_APPROACH_POINT}
        hospitalTerminalPoint={HOSPITAL_TERMINAL_POINT}
        onApproachIntersection={handleApproach}
        onPassedIntersection={handlePassed}
        onPositionUpdate={handleAmbulancePositionUpdate}
        onRouteDecision={handleAmbulanceRouteDecision}
        getSignalForLane={(lane, position, worldX, worldZ) => {
          const hasWorldPosition = typeof worldX === 'number' && typeof worldZ === 'number';
          const center = hasWorldPosition
            ? getNearestIntersectionFromWorldPos(worldX!, worldZ!)
            : getIntersectionCenterForVehicle(lane, position ?? 0);
          return getLaneSignalAtIntersection(center.x, center.z, lane);
        }}
      />

      {/* Intersection Markers */}
      {INTERSECTION_MARKERS.map((marker) => {
        const corridorData = (window as any).__simCorridor;
        const cityJunctions = (window as any).__simCityJunctions || [];
        
        const isCorridor = corridorData?.active && corridorData.route.some((r: string) => 
          marker.intersectionId === r || 
          marker.intersectionName.toLowerCase().includes(r.toLowerCase())
        );

        const junctionData = cityJunctions.find((j: any) => 
          j.id === marker.intersectionId || 
          j.name.toLowerCase().includes(marker.intersectionName.toLowerCase().replace(' junction', ''))
        );
        
        return (
          <IntersectionMarker
            key={marker.intersectionId}
            position={marker.position}
            intersectionId={marker.intersectionId}
            intersectionName={marker.intersectionName}
            onClick={handleIntersectionClick}
            isCorridor={isCorridor}
            congestionScore={junctionData?.congestionScore}
          />
        );
      })}

      <HUDBridge
        spawnAmbulance={spawnAmbulance}
        dispatchEMV={dispatchEMV}
        ambulanceActive={ambulanceActive}
        ambulanceDir={ambulanceDir}
        mode={mode}
        nsSignal={nsSignal}
        ewSignal={ewSignal}
        flowRate={flowRate}
      />
    </>
  );
}

function HUDBridge({
  spawnAmbulance,
  dispatchEMV,
  ambulanceActive,
  ambulanceDir,
  mode,
  nsSignal,
  ewSignal,
  flowRate
}: {
  spawnAmbulance: (dir: Direction) => void;
  dispatchEMV: (d: EMVDispatch) => void;
  ambulanceActive: boolean;
  ambulanceDir: Direction;
  mode: string;
  nsSignal: string;
  ewSignal: string;
  flowRate: number;
}) {
  const frameCountRef = useRef(0);

  useFrame(() => {
    // Update global state for HUD
    (window as any).__simState = {
      spawnAmbulance,
      dispatchEMV,
      ambulanceActive,
      mode,
      nsSignal,
      ewSignal,
      flowRate
    };

    // Send lane data to parent window every 20 frames (~3 times per second)
    frameCountRef.current++;
    if (frameCountRef.current >= 20) {
      frameCountRef.current = 0;

      // Convert Direction to 'NS' | 'EW'
      const ambulanceDirSimple: 'NS' | 'EW' = ambulanceDir === 'NS' ? 'NS' : 'EW';

      // Get current intersection lane data
      const laneData = laneDataTracker.getIntersectionData(
        'main-intersection',
        nsSignal as SignalState,
        ewSignal as SignalState,
        ambulanceActive,
        ambulanceDirSimple
      );

      // Send to parent window
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({
          type: 'LANE_DATA_UPDATE',
          data: laneData
        }, '*');
      }
    }
  });

  return null;
}

export function SimulationScene() {
  const [simState, setSimState] = useState({
    mode: 'normal',
    nsSignal: 'green' as SignalState,
    ewSignal: 'red' as SignalState,
    ambulanceActive: false,
    flowRate: 42,
  });

  const pollRef = useRef<number>();
  if (!pollRef.current) {
    pollRef.current = window.setInterval(() => {
      const s = (window as any).__simState;
      if (s) {
        // Also check if there's an override for HUD
        const override = (window as any).__simSignalOverride;
        setSimState({
          mode: s.mode,
          nsSignal: override?.NORTH === 'green' || override?.SOUTH === 'green' ? 'green' : override?.NORTH === 'yellow' ? 'yellow' : s.nsSignal,
          ewSignal: override?.EAST === 'green' || override?.WEST === 'green' ? 'green' : override?.EAST === 'yellow' ? 'yellow' : s.ewSignal,
          ambulanceActive: s.ambulanceActive,
          flowRate: s.flowRate,
        });
      }
    }, 100);
  }

  useEffect(() => {
    // Notify parent that we are ready
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'SIM_READY' }, '*');
    }

    const onMessage = (ev: MessageEvent) => {
      const msg = ev.data;
      if (!msg || typeof msg.type !== 'string') return;

      if (msg.type === 'DISPATCH_AMBULANCE_ACK' || msg.type === 'DISPATCH_AMBULANCE') {
        const s = (window as any).__simState;
        if (s?.dispatchEMV) {
          s.dispatchEMV({
            direction: msg.direction || 'NS',
            priorityClass: msg.priorityClass || 'NORMAL',
            etaSeconds: msg.etaSeconds ?? 60,
          });
        }
      } else if (msg.type === 'EMERGENCY_UPDATE') {
        const s = (window as any).__simState;
        if (s?.dispatchEMV && msg.active) {
          s.dispatchEMV({
            direction: msg.direction || 'NS',
            priorityClass: msg.priorityClass || 'NORMAL',
            etaSeconds: msg.etaSeconds ?? 60,
          });
        }
      } else if (msg.type === 'SIGNAL_STATE_UPDATE') {
        (window as any).__simSignalOverride = msg.signals;
      } else if (msg.type === 'VEHICLE_COUNT_UPDATE') {
        (window as any).__simVehicleCounts = msg.counts;
      } else if (msg.type === 'CORRIDOR_UPDATE') {
        (window as any).__simCorridor = { active: !!msg.active, route: msg.active?.route || [] };
      } else if (msg.type === 'CITY_STATE_UPDATE') {
        (window as any).__simCityJunctions = msg.junctions || [];
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const handleSpawn = useCallback((dir: Direction) => {
    const s = (window as any).__simState;
    if (s?.spawnAmbulance) s.spawnAmbulance(dir);
  }, []);

  const createSafeRenderer = useCallback((canvas: HTMLCanvasElement) => {
    // Prefer WebGL2 when available, but gracefully fall back to WebGL1 to avoid black-screen failures.
    const attrs: WebGLContextAttributes = {
      alpha: false,
      antialias: true,
      depth: true,
      stencil: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    };

    const context = canvas.getContext('webgl2', attrs) ?? canvas.getContext('webgl', attrs);

    if (!context) {
      throw new Error('Unable to create WebGL context');
    }

    const renderer = new THREE.WebGLRenderer({
      canvas,
      context,
      antialias: true,
      powerPreference: 'high-performance',
    });

    // Filmic tone-mapping + soft shadows for a realistic daytime look.
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    return renderer;
  }, []);

  return (
    <div className="relative w-full h-screen bg-background overflow-hidden">
      <Canvas
        dpr={[1, 1.75]}
        shadows
        camera={{ position: [60, 50, 60], fov: 50 }}
        gl={createSafeRenderer}
      >
        {/* Atmospheric sky + haze for depth (Delhi daytime) */}
        <color attach="background" args={[0xcfd9e6]} />
        <fog attach="fog" args={[0xd3dae3, 200, 470]} />
        <Sky
          distance={4500}
          sunPosition={[120, 90, 80]}
          turbidity={6}
          rayleigh={1.1}
          mieCoefficient={0.005}
          mieDirectionalG={0.85}
        />

        <ambientLight intensity={0.4} />
        <hemisphereLight args={[0xbfd4ff, 0x6b7a4a, 0.55]} />
        <directionalLight
          position={[120, 130, 80]}
          intensity={1.5}
          color={0xfff1d6}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-near={1}
          shadow-camera-far={540}
          shadow-camera-left={-260}
          shadow-camera-right={260}
          shadow-camera-top={260}
          shadow-camera-bottom={-260}
          shadow-bias={-0.0004}
        />

        <TrafficSystem />
        <OrbitControls
          maxPolarAngle={Math.PI / 2.2}
          minDistance={15}
          maxDistance={300} // Increased from 250 to accommodate even longer road
          target={[0, 0, 0]}
        />
      </Canvas>

      <SystemHUD
        mode={simState.mode}
        nsSignal={simState.nsSignal}
        ewSignal={simState.ewSignal}
        ambulanceActive={simState.ambulanceActive}
        flowRate={simState.flowRate}
        onSpawnAmbulance={handleSpawn}
      />
    </div>
  );
}
