# 06 · 3D Simulator (green-corridor-sim)

> **Role:** a physically-rendered testbed for the green-corridor concept. It visualises a real double-intersection
> with moving traffic, and — when embedded in Layer 5 — is driven by genuine Layer-3 decisions rather than its own.

| Property | Value |
|---|---|
| **Directory** | `green-corridor-sim/` |
| **Stack** | React · TypeScript · Vite · Three.js via React Three Fiber · Tailwind · Radix UI (shadcn) · Vitest · Playwright |
| **Port** | `8081` |
| **Embedded in** | Layer-5 `/dashboard/simulation` (iframe + `postMessage`) |
| **Scale** | ~7 400 lines |

---

## 1. Two operating modes

The simulator is deliberately dual-mode, which is what makes it useful as more than a demo.

| Mode | Signal authority | Use |
|---|---|---|
| **Standalone** (`localhost:8081` directly) | Its own `TrafficController` — a self-contained adaptive controller | Develop and inspect vehicle behaviour, queueing and emergency preemption without the rest of the stack |
| **Embedded** (inside Layer 5) | Layer 3, via `SIGNAL_STATE_UPDATE` written to `window.__simSignalOverride` | Watch real decisions play out physically; dispatch a real signed EMV token from inside the 3D view |

In embedded mode the local controller keeps running the physics and queue accounting, but the rendered lights and
the emergency state are overridden by the real system. An ambulance dispatched from the 3D UI calls the **real**
`POST /control/dispatch`, so it produces a genuine Ed25519-signed token that passes the junction verifier — not a
cosmetic animation.

---

## 2. Architecture

```
src/
├── App.tsx · main.tsx ────────── providers, router, toaster
│
├── simulation/                   ── HEADLESS LOGIC (unit-testable, no Three.js)
│   ├── TrafficController.ts ──── adaptive 4-lane controller with strict preemption
│   ├── VehicleManager.ts ─────── shared vehicle registry, car-following queries
│   └── LaneDataTracker.ts ────── per-lane queue / entered counters → telemetry
│
├── components/simulation/        ── SCENE GRAPH
│   ├── SimulationScene.tsx ───── root: canvas, TrafficSystem, HUDBridge, message bus
│   ├── Road.tsx ──────────────── carriageways, LANE_POSITIONS lookup
│   ├── TrafficLight.tsx ──────── per-approach heads with countdown
│   ├── Crosswalks.tsx · Buildings.tsx · DelhiLandmarks.tsx · IntersectionMarker.tsx
│   ├── SystemHUD.tsx ─────────── mode, signals, ambulance state, flow rate
│   └── Realistic*.tsx ────────── moving vehicle behaviours (ambulance, car, auto, bike)
│
├── components/vehicles/          ── STATIC 3D MODELS (ambulance, car, auto, bike)
├── pages/         Index · Traffic · LiveTraffic · SignalControl · NotFound
├── config/cameraStreams.ts
├── lib/textures.ts · utils.ts
└── test/          Vitest setup + example specs
```

**Separation that matters:** everything in `src/simulation/` is plain TypeScript with no rendering dependency, so
the controller and queue logic are unit-testable under Vitest without a WebGL context.

---

## 3. The local `TrafficController`

A four-lane (`N`, `E`, `S`, `W`) adaptive controller with a strict two-phase cycle.

### 3.1 Parameters

| Parameter | Value | Meaning |
|---|---|---|
| `baseGreenTime` | 5 s | Floor before queue contribution |
| `additionalTimePerVehicle` | 2 s | Green added per queued vehicle |
| `minGreenTime` / `maxGreenTime` | 5 / 30 s | Green bounds |
| `yellowDuration` | 2 s | Dual-yellow transition |
| `w1Density` / `w2Waiting` | 1.0 / 1.0 | Priority term weights |
| `maxWaitingTime` | 120 s | Wait accumulation cap |
| `waitingTimeScale` | 0.1 | Wait scaling into the priority term |
| `starvationThreshold` | 60 s | Wait beyond which a lane is starved |
| `passRate` | 0.8 veh/s | Discharge rate used for queue accounting |

### 3.2 Priority and duration

```
priority(lane)   = queueCount[lane] * w1Density
                 + min(waitingTime[lane], 120) * 0.1 * w2Waiting

greenTime(lane)  = clamp(5 + queueCount[lane] * 2, 5, 30)
greenTime_emv    = clamp(5 + queueCount[lane] * 2, 10, 30)     # higher floor under preemption
```

### 3.3 Lane selection

```
1. emergencyLane set?          → that lane (strict preemption)
2. any non-empty lane starved  → the longest-waiting starved lane (priority breaks ties)
3. any non-empty lane          → argmax priority
4. all empty                   → stable round-robin rotation
```

### 3.4 The cycle

```
 Phase B — GREEN
   elapsed += dt
   elapsed >= currentGreenDuration ?
      ├─ finishGreenPhase():
      │     vehiclesPassed = min(queue, floor(greenDuration * 0.8))
      │     queue[selected] -= vehiclesPassed
      │     waiting[selected] = 0
      │     waiting[others]  += (greenDuration + 2), capped at 120
      └─ transitioningLane = selectNextLane();  both corridors show YELLOW

 Phase A — DUAL YELLOW (2 s)
   outgoing lane AND incoming lane both yellow; all others red
   on expiry: applyActiveLane(next); recompute currentGreenDuration
```

**Emergency preemption is strict.** `triggerEmergency(direction, lane?)` sets the emergency lane and, if that lane
is not already green, immediately starts a yellow buffer toward it — retargeting an in-flight transition if
necessary. Cycle accounting happens once per completed phase, never mid-cycle, so queue and wait bookkeeping stays
consistent under preemption.

### 3.5 Countdown estimation

`getLaneRemainingSeconds(lane)` powers the on-screen countdown for lanes that are *not* currently green. It runs a
**virtual forward projection**: it clones the queue and waiting tables, replays `applyGreenPhaseVirtual()` and
`selectNextLaneVirtual()` for up to four full rotations, and accumulates elapsed time until the target lane would be
served. This gives a defensible ETA instead of a fixed guess, and correctly accounts for starvation overrides and
emergency preemption in the projection.

---

## 4. `VehicleManager` — shared spatial registry

A single `Map<string, VehicleEntry>` that every vehicle component registers into. It is how vehicles see each other
without prop drilling or per-frame scene traversal.

```typescript
interface VehicleEntry {
  id: string; lane: string; position: number;
  worldX?: number; worldZ?: number; isEmergency: boolean;
}
```

| Query | Purpose |
|---|---|
| `hasVehicleNear(lane, position, minGap, selfId?)` | Coarse occupancy test |
| `getDistanceToVehicleAhead(id, lane, position, dir)` | Car-following gap; `dir` (+1/−1) makes "ahead" direction-aware |
| `isEmergencyNearby(lane, position)` | Only traffic *ahead of* an approaching ambulance in the same lane yields |

`register` / `update` / `updateState` / `unregister` maintain the registry across component lifecycles.

---

## 5. `LaneDataTracker` — telemetry

Produces the `IntersectionLaneData` frames sent to Layer 5.

- Maintains an `enteredCounters` map per lane and a `trackedVehicles` set so each vehicle is counted **once** as it
  crosses into the detection zone (`detectionZone = 15` units from centre).
- Skips emergency vehicles from civilian counts.
- Emits per lane: `laneId`, `laneName`, `signal`, `queueCount`, `enteredCount`, `ambulanceDetected`.

```typescript
interface IntersectionLaneData {
  intersectionId: string;
  lanes: LaneData[];
  timestamp: number;
}
```

---

## 6. The scene

| Element | Component | Notes |
|---|---|---|
| Carriageways, markings | `Road.tsx` | Exports `LANE_POSITIONS` — the single source of lane offsets used by markers and glow transforms |
| Signal heads | `TrafficLight.tsx` | Per-approach, with countdown from `getLaneRemainingSeconds()` |
| Crosswalks | `Crosswalks.tsx` | Pedestrian geometry |
| Context | `Buildings.tsx`, `DelhiLandmarks.tsx`, `HospitalLandmark` | Delhi-flavoured surroundings; the hospital is the default corridor destination |
| Intersection identity | `IntersectionMarker.tsx`, `getIntersectionId()` | Grid of intersections keyed by centre coordinates |
| Emergency overlay | `EmergencyOverrideOverlay` | Visual corridor state |
| Direction arrows | `DirectionArrowMarker` | Per-lane rotation and offset from `LANE_POSITIONS` |
| HUD | `SystemHUD.tsx` | Mode, NS/EW signals, ambulance state, flow rate |
| Vehicles | `Realistic*` + `components/vehicles/*` | Behaviour components wrap static models |

**Per-intersection metrics.** `getLocalSignalMetrics(centerX, centerZ, lane)` scans the vehicle registry within a
`LANE_CENTER_TOLERANCE` of 10 units to derive a per-intersection queue for that lane, so a grid of intersections can
each run their own controller state rather than sharing one global queue.

**Renderer robustness.** `createSafeRenderer()` prefers WebGL2 and falls back to WebGL1 rather than presenting a
black canvas on constrained hardware.

---

## 7. The bridge protocol

Handshake and message loop live in `SimulationScene.tsx`. Cross-window state is deposited on `window` globals that
the render loop polls, which keeps the React tree free of high-frequency re-renders.

### Inbound (Layer 5 → simulator)

| Message | Handling | Global |
|---|---|---|
| `SIGNAL_STATE_UPDATE` | Real Layer-3 lights override local ones | `__simSignalOverride` |
| `EMERGENCY_UPDATE` | `active: true` calls `dispatchEMV({direction, priorityClass, etaSeconds})` | via `__simState` |
| `DISPATCH_AMBULANCE` / `DISPATCH_AMBULANCE_ACK` | Same dispatch entry point | via `__simState` |
| `VEHICLE_COUNT_UPDATE` | Per-approach spawn density | `__simVehicleCounts` |
| `CORRIDOR_UPDATE` | `{active, route}` corridor highlight | `__simCorridor` |
| `CITY_STATE_UPDATE` | Peer junction overlay | `__simCityJunctions` |

### Outbound (simulator → Layer 5)

| Message | Cadence | Payload |
|---|---|---|
| `SIM_READY` | once on mount | — |
| `LANE_DATA_UPDATE` | every 20 frames (~3 Hz) | `IntersectionLaneData` |
| `DISPATCH_AMBULANCE` | on user action | `{ direction }` → Layer 5 calls the real dispatch API |
| `INTERSECTION_SELECTED` | on user action | `{ intersectionId }` |

A 100 ms interval polls `window.__simState` to refresh the HUD, applying the signal override when present so the HUD
and the rendered lights never disagree.

---

## 8. Running and testing

```bash
cd green-corridor-sim
npm install
npm run dev          # http://localhost:8081  (auto-embeds into Layer-5's Simulation page)
npm run build        # production bundle
npm run test         # vitest run
npm run test:watch
npm run lint
```

Playwright is configured (`playwright.config.ts`, `playwright-fixture.ts`) for browser-level checks; `vercel.json`
supports static deployment.

**Standalone routes:** `/` (Index), `/traffic` (Traffic), `/live-traffic` (LiveTraffic),
`/signal-control` (SignalControl).

---

## 9. Relationship to the production controller

The simulator's `TrafficController` and Layer-3's max-pressure optimiser are **different algorithms serving
different purposes**, and should not be confused:

| | Simulator `TrafficController` | Layer-3 optimiser |
|---|---|---|
| Objective | Queue + waiting time, per lane | Person-weighted max-pressure differential (upstream demand minus downstream saturation) |
| Vehicle weighting | None — a vehicle is a vehicle | `VEHICLE_WEIGHTS`, bus 3.0 vs motorcycle 0.5 |
| Cycle | Continuous, seconds-scale, 5–30 s greens | Discrete 30 s decision cycle, 15–90 s greens |
| Safety | Fixed 2 s dual-yellow | Full Safety Supervisor: conflict matrix, min-green, pedestrian integrity, clearance injection |
| Emergency | Local flag, immediate preemption | Cryptographically verified token, multi-junction corridor, reservations, sequencing |
| Role | Physical plausibility and visualisation | The system of record |

When embedded, the simulator's own decisions are visually superseded by Layer 3 — which is precisely the point: it
becomes a physical rendering of the real control system.
