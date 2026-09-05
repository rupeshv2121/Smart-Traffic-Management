# 03 · Layer 3 — Decision & Optimisation (Layer-3_STM)

> **Role:** the brain. Layer 3 decides which approach gets green, for how long, whether an emergency corridor
> preempts that decision, and whether any of it is safe to execute. It is also the system's Data Access Layer:
> everything Layer 5 reads or writes passes through its gateway.

| Property | Value |
|---|---|
| **Directory** | `Layer-3_STM/` |
| **Stack** | TypeScript 6 · Node.js (CommonJS) · `ws` · `pg` · `redis` · `dotenv` · OpenTelemetry |
| **Ports** | `8200` dashboard gateway (SSE/WS/REST) · `8100` EMV token intake |
| **Cycle** | 30 s (`PIPELINE_CYCLE_MS`) |
| **Entrypoints** | `npm run live` (real perception) · `npm run dev` (mock loop) · `npm run test` (integration + chaos harness) |
| **Source scale** | ~7 800 lines across 41 modules |

---

## 1. Module map

```
src/
├── config.ts ──────────── single source of truth: tunables, env, safety + trust config
├── types/types.ts ─────── domain contracts + the person-flow scoring functions
│
├── live.ts ────────────── PRODUCTION LOOP: perception → decide → broadcast → persist
├── main.ts ────────────── mock-driven continuous loop (no Python service needed)
├── index.ts ───────────── integration + asserted regression/chaos harness
├── continuous-simulator.ts
│
├── stm-orchestrator.ts ── the 6-stage decision pipeline (the coordinator)
├── max-pressure-optimizer.ts ── phase selection + green duration (pure fn + stateful class)
├── safety-supervisor.ts ─ deterministic interlocks; owns every signal change
├── resilience-handler.ts ─ confidence gate + LinkMonitor + 4-state ladder
├── layer2-bridge.ts ───── live perception client (+ bus-lane fetch, plate normalisation)
├── mock-data/mock_generator.ts ── synthetic perception + historical plans
│
├── emv/                   EMERGENCY VEHICLE SUBSYSTEM
│   ├── emv-crypto.ts ──── Ed25519 sign/verify + canonical claim serialisation
│   ├── emv-keys.ts ────── key provisioning (env → file → ephemeral)
│   ├── keygen.ts ──────── `npm run emv:keygen`
│   ├── emv-verifier.ts ── the 5-check junction trust gate (fail-closed)
│   ├── emv-dispatch.ts ── mock central authority: issues signed tokens + plausible GPS
│   ├── emv-dispatch-cli.ts ── `npm run emv:dispatch -- EAST 35 CRITICAL`
│   ├── emv-ingest-server.ts ── :8100 token intake (presence/expiry/revocation only)
│   ├── junction-graph.ts ── the city road network as a weighted graph
│   ├── emv-router.ts ──── A* initial route + D* Lite incremental re-plan
│   ├── corridor-manager.ts ── multi-junction corridor lifecycle + conflict sequencing
│   ├── geo.ts ─────────── haversine + destination-point helpers
│   └── corridor-conflict.test.ts ── corridor invariant test suite
│
├── dashboard/             LAYER-5 FACING
│   ├── dashboard-gateway.ts ── :8200 SSE + WebSocket + REST + Prometheus
│   ├── snapshot.ts ────── CycleSnapshot contract (SOURCE OF TRUTH)
│   ├── city.ts ────────── CitySnapshot contract + incident derivation
│   ├── junctions.ts ───── Delhi junction registry (1 live + 8 peers)
│   └── congestion.ts ──── 5-step congestion ramp + class-count collapse
│
├── control/
│   ├── control-channel.ts ── the ONE operator write-path + append-only audit
│   └── fallback.ts ────── time-of-day historical plans derived from real history
│
├── persistence/           FilePersistence (default) | PostgresPersistence (TimescaleDB)
├── hotstore/              RedisHotStore | NullHotStore
├── auth/                  HS256 JWT (dependency-free) + scrypt user store
├── challan/               violation queue + fines
├── registry/              edge nodes · users · zones
├── multi/                 peer-junction orchestration (real M1–M4 per peer)
└── observability/         OpenTelemetry tracing (OTLP / console / no-op)
```

The internal team vocabulary maps to modules as: **Member 1** scoring (`types.ts:scoreAllApproaches`),
**Member 2** optimiser + emergency pathfinding (`max-pressure-optimizer.ts`, corridor subsystem),
**Member 3** safety (`safety-supervisor.ts`), **Member 4** data & resilience (`resilience-handler.ts`,
`persistence/`). The console output of `npm run live` is labelled with these names.

---

## 2. Stage-by-stage: `STMOrchestrator.orchestrateActuation()`

Signature:

```typescript
orchestrateActuation(
  layer2Data: Layer2Payload,
  emergencyToken: EmergencyToken | null,
  historicalPlans: HistoricalTimingPlan[],
): OrchestratorResult
```

Every stage appends to `reasonChain: string[]` — the human-readable audit trail rendered verbatim on the dashboard.

### Stage 0-pre · EMV trust gate

```typescript
if (emergencyToken) {
  const verdict = this.emvVerifier ? this.emvVerifier.verify(emergencyToken)
                                   : { valid: false, reasons: ["EMV_TRUST_NOT_CONFIGURED"] };
  if (!verdict.valid) emergencyToken = null;   // downgrade to "no emergency"
}
```

**Fail-closed.** With no trust configuration the orchestrator rejects every token rather than trusting blindly. A
rejected token is *nulled*, not merely ignored — so the rest of the pipeline, including corridor teardown, treats it
as absent. The five checks are detailed in [Security & Trust](cross-cutting-security-and-trust.md#3-the-five-check-verifier).

### Stage 0 · Corridor reconciliation

```typescript
if (!emergencyToken && this.emvCorridorActive) {
  this.optimizer.resume(layer2Data.junctionId);   // also arms the recovery window
  this.emvCorridorActive = false;
}
```

Teardown happens **up-front**, before any short-circuit return. This is load-bearing: if teardown lived at the end,
a corridor opened in a prior cycle would stay "active" indefinitely across fallback cycles that return early.

### Stage 0b · Resilience ladder

```typescript
this.lastLink       = this.linkMonitor.snapshot();
this.lastLadderState = computeLadderState(layer2Data.cvConfidenceScore,
                                          this.criticalConfidence, this.lastLink);

if (ladderState === "TOTAL_FAILSAFE")     return produceFallbackCommand(..., "SAFE_DEFAULT");
if (ladderState === "LOCALLY_AUTONOMOUS") /* continue, flagged in reasonChain */;
```

### The `emvPrimary` bypass

```typescript
const emvPrimary = emergencyToken !== null;   // i.e. a token that SURVIVED verification
```

A verified corridor is **GPS- and token-primary**. It does not depend on the camera, so it must not be suppressed by
perception-degradation fallbacks. Stages 1 and 2 below are skipped when `emvPrimary` is true. Only a
`TOTAL_FAILSAFE` (handled above) can override a corridor.

### Stage 1 · Data staleness

```typescript
if (dataAge > (config.maxDataAgeSeconds ?? 10) && !emvPrimary)
  return produceFallbackCommand(..., "HISTORICAL_FALLBACK");
```

### Stage 2 · Confidence gate

`ResilienceHandler.evaluateConfidenceAndDecide()` returns one of four actions:

| Action | Trigger | Effect |
|---|---|---|
| `USE_OPTIMIZED_PLAN` | conf ≥ 0.70, or recovered from fallback | proceed to optimisation |
| `SWITCH_TO_HISTORICAL_FALLBACK` | conf < 0.70 | latch fallback, return historical plan |
| `MAINTAIN_FALLBACK` | already latched, conf still < 0.70 | stay in fallback |
| (warning) | 0.70 ≤ conf < 0.80 | proceed, but logged as `CONFIDENCE_WARNING` |

The handler is **hysteretic**: once latched it stays in fallback until confidence recovers above the *critical*
threshold, which prevents flapping around the boundary.

### Stage 3 · Proposal generation

**Emergency branch** — `generateEmergencyResponse()`:

```typescript
conflictIndex          = PRIORITY_CLASS_MULTIPLIER[priorityClass] * 100 - etaSeconds
                         // CRITICAL=3, HIGH=2, NORMAL=1
requiredGreenDuration  = clamp(etaSeconds + 25, 30, 90)
```

The optimiser is paused for this junction (`optimizer.pause(junctionId)`) so normal max-pressure yields control.

**Normal branch** — convert the payload to `ApproachMetrics`, build downstream densities, average the historical
plans into a fallback green time, and run the optimiser (section 3).

The resulting phase-state mutation is held in `pendingPlan` and **deliberately not applied yet** — it is committed
only after Stage 4 approves.

### Stage 4 · Safety validation

```typescript
const safetyResult = this.safetyValidator.validateProposedActuation(
  currentState, proposedState, activeTimers,
  { emergencyOverride: executionPath === "EMERGENCY_MODE" },
);
```

| Verdict | Meaning | Orchestrator response |
|---|---|---|
| `EXECUTE_PHASE_TRANSITION` | safe, with injected clearances | proceed, commit phase state |
| `ACTUATE_OPTIMIZED_PLAN` | no transition needed | proceed |
| `MAINTAIN_CURRENT_STATE` | soft interlock (min-green / ped walk) | `produceHoldCommand()` — hold current green, advance dwell timer |
| `FORCE_FALLBACK` | hard interlock (conflicting greens) | `produceFallbackCommand(..., "SAFE_DEFAULT")` |

Only after a non-blocking verdict is the deferred phase transition committed:

```typescript
if (executionPath === "EMERGENCY_MODE") { /* jump to the corridor phase, reset dwell */ }
else if (pendingPlan)                   { this.updatePhaseState(pendingPlan); }
```

### Stages 5–6 · Command construction and resilience enforcement

```typescript
const finalCommand: ActuationCommand = {
  junctionId, commandId: `CMD-${Date.now()}`,
  targetPhaseId, durationSeconds,
  clearanceIntervals: {
    yellowSeconds: safetyResult.command.yellowSeconds || MIN_YELLOW_SECONDS,
    allRedSeconds: safetyResult.command.allRedSeconds || 2,
  },
  executionMode: executionPath === "EMERGENCY_MODE" ? "GREEN_CORRIDOR" : "NORMAL_MAX_PRESSURE",
};

return { finalCommand: resilienceHandler.hijackAndEnforceHistorical(finalCommand, historicalPlans), ... };
```

`hijackAndEnforceHistorical()` is the last word: if the fallback latch is set, it substitutes the historical green
time for the matching phase and rewrites `executionMode` to `HISTORICAL_FALLBACK`, regardless of what the optimiser
proposed.

### Orchestrator state

| Field | Purpose |
|---|---|
| `currentPhaseState` | `{ currentPhaseId, phaseElapsedSeconds, currentGreenDuration, currentDensity }` |
| `lastGreenTracker` | Seconds since each approach last had green — feeds starvation detection |
| `emvCorridorActive` | Whether a corridor currently holds this junction |
| `lastLadderState` / `lastLink` | Stamped onto every result for the dashboard |

The controller boots assuming NORTH has already been green for a full cycle, so the first optimisation can transition
cleanly without spuriously tripping the minimum-green interlock.

---

## 3. The Max-Pressure Optimiser

`src/max-pressure-optimizer.ts`. Two layers: a **pure function** (`runMaxPressureOptimizer`) and a **stateful class**
(`MaxPressureOptimizer`) that owns the pause registry and the recovery window.

### 3.1 Step 1 — person-centric priority scoring

`types.ts:scoreAllApproaches()`. For each approach:

```
personFlow        = Σ (count × VEHICLE_WEIGHTS[type])          # PCU, person-centric
waitingComponent  = avgWaitingTime × 0.5                       # WAITING_TIME_FACTOR
queueUtilisation  = min(queueLength / roadCapacity, 1.0)
queueComponent    = queueUtilisation × 100 × 0.8               # QUEUE_FACTOR
arrivalComponent  = arrivalRate × 2
busBonus          = 3 if any Bus present                       # BUS_BONUS

priorityScore     = personFlow + waitingComponent + queueComponent + arrivalComponent + busBonus
                  + 15  if spillback   (queueLength / capacity > 0.85)   # SPILLBACK_BOOST
                  + 20  if starvation  (lastGreenSeconds > 45)           # STARVATION_BOOST
```

**Vehicle weights** (`VEHICLE_WEIGHTS`) are the person-centric core of the design: a bus counts 3.0 and a motorcycle
0.5, so the optimiser maximises *people* moved rather than *vehicles* moved.

| Type | Weight | Type | Weight |
|---|---|---|---|
| Motorcycle | 0.5 | Bus | 3.0 |
| Car | 1.0 | HeavyTruck | 4.0 |
| AutoRickshaw | 1.2 | Ambulance | 10.0 |
| MiniTruck | 2.0 | | |

`roadCapacity` is fixed at 100 (`ROAD_CAPACITY` in the orchestrator); `queueLength` is derived from
`spatialOccupancyPct` as `round(occupancy/100 × 100)`, falling back to raw vehicle count.

### 3.2 Step 2 — the max-pressure differential

```
Pm = max(0,  Σ_upstream(Wi·Oi)  −  Σ_downstream(Wj·Oj) )
```

Implemented as:

```typescript
upstreamDemand    = priorityScore + (recoveryActive ? 2.0 * downstreamOccupancyPct : 0)
downstreamPenalty = starvationOverride ? 0 : 1.0 * downstreamOccupancyPct   // DOWNSTREAM_WEIGHT
pressure          = Math.max(0, upstreamDemand - downstreamPenalty)
```

Classic max-pressure releases the movement whose upstream demand most exceeds what the downstream can absorb. Three
deliberate modifications:

1. **Upstream term is the person-weighted score**, not a raw count — so `Wi·Oi` is already folded in via
   `VEHICLE_WEIGHTS` plus queue and wait terms.
2. **Starved approaches bypass the downstream penalty entirely.** Without this, an approach whose exit is
   permanently saturated could starve forever.
3. **Post-corridor recovery boost.** After a corridor dissolves, held approaches have accumulated spillback. For
   `RECOVERY_CYCLES = 3` cycles they receive `2.0 × occupancy` extra demand, so the optimiser grants them extended
   green to clear it. Without this, a corridor leaves a persistent queue the steady-state objective under-serves.

The winning direction is `argmax(pressure)`.

### 3.3 Step 3 — green duration

```
greenDuration = round(clamp(MIN_GREEN + priorityScore × SCALING_FACTOR, 15, 90))
```

**Adaptive extension:** if the winner is the *currently green* phase, density is `high`, the phase has already run
its full allocation, and the current duration is below `MAX_GREEN`, the green is extended by `EXTENSION_SEC = 10`
rather than re-derived. This lets a genuinely saturated approach keep discharging instead of being reset by score
noise.

### 3.4 Confidence gate and control handoff

```typescript
if (confidenceScore < CONF_THRESHOLD /* 0.70 */) return buildHistoricalFallback(...);
if (this.pausedJunctions.has(junctionId)) return buildEMVOverridePlan(junctionId);
```

The `EMV_OVERRIDE` plan carries `targetPhaseId: "PHASE_EMV_CONTROLLED"` and zeroed timings — an explicit statement
that the optimiser has yielded control, not a silent no-op.

### 3.5 `ProposedPlan` output

```typescript
{
  junctionId, timestamp,
  dataSource: "LIVE" | "HISTORICAL" | "EMV_OVERRIDE",
  targetPhaseId: "PHASE_<DIR>_GREEN",
  greenDuration, yellowDuration: 5, allRedDuration: 2,
  pressureSnapshot: Record<dir, number>,   // full per-direction telemetry,
  priorityScores:   Record<dir, number>,   // so a decision is always explainable
  personFlows:      Record<dir, number>,
  spillbackFlags:   Record<dir, boolean>,
  starvationFlags:  Record<dir, boolean>,
  extendGreen: boolean,
  winningDirection: string,
}
```

### 3.6 Per-instance state isolation

`pausedJunctions` and `recoveryCycles` are **instance fields**, not module globals. A corridor at one junction can
never leak into another junction served by a different optimiser instance, nor into a later run that reuses the same
junction id.

---

## 4. The Safety Supervisor

`src/safety-supervisor.ts`. Strictly synchronous, side-effect free, and the **only** path from proposal to command.
It is the deterministic core the whole architecture leans on: if the optimiser hallucinates, this module still
produces a safe outcome.

### Rule 1 — no conflicting greens (hard interlock)

```typescript
for (const phaseA of proposedState.activeGreens)
  for (const phaseB of proposedState.activeGreens)
    if (conflictMatrix[phaseA]?.includes(phaseB)) return forceSafeDefault("CRITICAL_CONFLICTING_GREENS_DETECTED");
```

Conflict matrix: `NORTH↔SOUTH`, `EAST↔WEST`. **This rule is enforced even under emergency preemption** — there is no
override. Violation forces `FORCE_FALLBACK` to a fixed-time default loop phase.

### Rule 2 — clearance intervals on transition

On any phase change:

- If the proposed phase conflicts with the *current* phase and there is no emergency override, refuse
  (`FORCE_FALLBACK`, `PROPOSED_PHASE_CONFLICTS_WITH_CURRENT_PHASE`).
- If the current phase has run less than `minGreenEnforced` (10 s) and there is no emergency override, refuse the
  transition and order a hold (`MAINTAIN_CURRENT_STATE`, `MINIMUM_GREEN_NOT_MET`).
- Otherwise approve, **injecting clearances**:

```typescript
yellowSeconds = max(proposed.yellowSeconds ?? 0, config.minYellowSeconds)   // ≥ 5
allRedSeconds = max(proposed.allRedSeconds ?? 0, config.minAllRedSeconds)   // ≥ 2
```

Clearances are **always** applied, emergency preemption included, so opposing traffic is brought to a safe stop
before the corridor phase goes green. Emergency transitions are tagged `reason: "EMERGENCY_PREEMPTION"`.

### Rule 3 — pedestrian phase integrity

If a pedestrian walk is active and has run less than `minPedestrianWalkSeconds` (8 s), the transition is refused —
unless an emergency override is in force, in which case the clearance intervals from Rule 2 still protect anyone
mid-crossing.

### What "isSafe" means

`isSafe: true` with `EXECUTE_PHASE_TRANSITION` means *the transition is permitted provided the clearances are
honoured*. It is not a claim that the raw proposal was already safe. The orchestrator honours both the boolean and
the `action`, and a `MAINTAIN_CURRENT_STATE` verdict produces a hold command rather than executing the refused
switch.

---

## 5. The Emergency Vehicle subsystem

### 5.1 Component roles

| Component | Responsibility | Trust posture |
|---|---|---|
| `MockEmvDispatch` | Central authority. Signs claims, synthesises the GPS fix. Holds the **private** key. | Trusted issuer |
| `EmvIngestServer` | Presence, expiry, revocation. | Untrusted pipe |
| `EmvVerifier` | The junction gate. Five independent checks. Holds only the **public** key. | The single authority on trust |
| `CorridorManager` | Multi-junction lifecycle: routing, reservations, sequencing. | Operates only on verified tokens |
| `MaxPressureOptimizer` | Pauses/resumes; recovery window. | Subordinate to the corridor |

### 5.2 The city graph

`src/emv/junction-graph.ts` — nodes are the nine registry junctions with real Delhi coordinates; edges are
undirected road links weighted by great-circle distance (`haversineMeters`). Edges can be blocked at runtime, which
is what triggers D\* Lite re-planning.

```
DEL_DL_ITO_01   (ITO)            ── CP, Mandi House, India Gate
DEL_DL_CP_02    (Connaught Pl.)  ── ITO, Mandi House, Punjabi Bagh, Dhaula Kuan
DEL_DL_MH_03    (Mandi House)    ── ITO, CP, India Gate
DEL_DL_IG_04    (India Gate)     ── ITO, Mandi House, AIIMS, Moolchand, Ashram
DEL_DL_AIIMS_05 (AIIMS)          ── India Gate, Dhaula Kuan, Moolchand
DEL_DL_DK_06    (Dhaula Kuan)    ── CP, AIIMS, Punjabi Bagh
DEL_DL_ASH_07   (Ashram Chowk)   ── India Gate, Moolchand
DEL_DL_MC_08    (Moolchand)      ── India Gate, AIIMS, Ashram
DEL_DL_PB_09    (Punjabi Bagh)   ── CP, Dhaula Kuan
```

The straight-line heuristic is admissible (never overestimates road cost), so A\* is optimal on this graph.

### 5.3 Routing — A\* then D\* Lite

`src/emv/emv-router.ts`.

- **A\*** computes the initial fastest origin→destination route at dispatch time.
- **D\* Lite** (Koenig & Likhachev, 2002) incrementally re-plans when an edge is blocked or the vehicle deviates,
  recomputing from the vehicle's *current* junction without redoing the whole search. The key modifier `km`
  accumulates the heuristic shift as the start node advances.

### 5.4 Corridor lifecycle

`src/emv/corridor-manager.ts` owns the multi-junction state machine.

```
 register(token)
    ├─ resolveRoute()   A*-fill between declared junctions, or origin→destination
    ├─ reserve everything ahead of the origin
    └─ resolveGrants()  ── sort by priorityClass, tie-break ETA, then startedAt
                           winner: granted=true
                           losers: granted=false, heldReason set (HELD, never dropped)

 updateGps(emvId, gps)   pass-detection: any route node within PASS_RADIUS_M (180 m)
    └─ advanceTo(index)  mark passed junctions CLEARED, release their reservations,
                         advance the D* Lite start node

 tick()                  ETA-based progress fallback (prototype GPS is static);
                         expire tokens past expiresAt; re-resolve grants

 blockEdge(a, b)         chaos/deviation input:
                         every corridor using that edge re-plans (D* Lite),
                         reservations on the abandoned tail are RELEASED so
                         cross-traffic is not held for a vehicle no longer coming

 endRun / endRunByTokenId   revoke/abort: release everything, re-resolve
```

**States:** corridor `IDLE | CORRIDOR_ACTIVE | CONFLICT | ARRIVED`; leg `RESERVED | CLEARED | PENDING | ABANDONED`;
inspector `STANDBY | MONITORING | DEVIATION | COMPLETED`.

**The single-grant invariant.** At most one corridor may hold the grant at any instant. This is enforced in
`advanceTo()`: on arrival the corridor sets `granted = false` and immediately re-resolves, so a held EMV is promoted
the moment the winner clears rather than waiting for the arrived token to expire.

> **Regression note.** An earlier version left `granted = true` on an arrived corridor, which both blocked promotion
> and allowed `resolveGrants()` to grant a *second* corridor on top of it — a double-grant. The fix covers every
> arrival path (tick and GPS pass-detection) and is locked in by `src/emv/corridor-conflict.test.ts`.

**Conflict resolution order:** priority class (`CRITICAL` 3 > `HIGH` 2 > `NORMAL` 1) → lower ETA → earlier
`startedAt` (stable). The loser is **held with a reason**, e.g.
`"held behind AMB-2041 (CRITICAL, ETA 35s)"`, surfaced verbatim on the EMVS screen.

**Compliance metric:** `cleared.size / route.length`, rounded to 3 decimals — the Corridor Inspector's score.

### 5.5 Dispatch flow (dashboard path)

```
POST /control/dispatch  {targetPhaseId, etaSeconds, priorityClass, emvId?}
  │  [ADMIN | DISPATCHER]
  ▼
dispatchEmv()  in live.ts
  ├─ destination = params.destinationJunctionId ?? DEL_DL_AIIMS_05 (hospital default)
  ├─ route = aStarRoute(JUNCTION_ID, destination)
  ├─ token = dispatchAuthority.issue({...route})       ← Ed25519 signed
  ├─ corridorManager.register(token)
  │     granted  → emvIngest.submit(token)   → 200 { ok: true, token }
  │     held     → 409 { ok:false, conflict:true, active:{emvId, priorityClass} }
  └─ next cycle: orchestrator verifies the token again at the junction gate
```

Note the double gate: dispatch signs, the junction independently verifies. Dispatch authority does not confer
junction trust.

---

## 6. Resilience

Full treatment in [Resilience & Fail-Safe](cross-cutting-resilience-and-failsafe.md). Summary of the Layer-3
machinery:

| Component | Responsibility |
|---|---|
| `LinkMonitor` | Tracks broker connectivity, heartbeat age (30 s timeout), edge-compute fault |
| `computeLadderState()` | Combines the perception axis (CV confidence) and link axis into one rung; most-severe wins |
| `ResilienceHandler` | Hysteretic confidence gate + the final `hijackAndEnforceHistorical()` enforcement point |
| `deriveFallbackPlans()` | Distils durable cycle history into per-phase time-of-day green times |

**The fail-safe loop closes on real data.** `control/fallback.ts` reads the persisted `CycleSnapshot` history,
filters to cycles that served each phase, prefers samples from the *current hour of day* when there are at least 3,
falls back to all-history, then to static defaults. So the historical plan the system falls back to is derived from
how this junction actually behaved at this time of day.

---

## 7. The Dashboard Gateway (Data Access Layer)

`src/dashboard/dashboard-gateway.ts` — reads are open, writes are JWT- and role-guarded.

```
                     ┌──────────────── DashboardGateway :8200 ────────────────┐
  SSE  GET /events ──┤ replay history buffer → live snapshot + city frames    │
  WS   /stream ──────┤ same frames as {event, data} JSON                      │
  REST reads ────────┤ /health /control/state /audit /analytics[/series]      │
                     │ /challans /registry /fallback-plan /metrics            │
  REST writes ───────┤ /auth/login /auth/sso                                  │
   (Bearer JWT) ─────┤ /control/override /control/clear   [ADMIN, OPERATOR]   │
                     │ /control/dispatch                  [ADMIN, DISPATCHER] │
                     │ /challans/:id/{issue,reject}       [ADMIN, INSPECTOR]  │
                     └───────────────────────────────────────────────────────┘
```

**Broadcast path.** `broadcast(snapshot)` pushes to every SSE client and WebSocket client, appends to the bounded
in-memory history (20) and analytics window (240 ≈ 2 h), writes through to durable persistence, and mirrors to the
Redis hot store. New clients receive the history buffer immediately on connect, so a freshly opened dashboard is
populated without waiting a full cycle.

**Analytics.** `computeAnalytics()` aggregates the rolling window: cycles, mean green, mean vehicles/cycle,
safety pass rate, mean confidence, mean congestion, and distributions over execution mode and plan type.
`computeSeries(hours, buckets)` buckets the full persisted history into an evenly spaced time series (throughput
PCU, mean wait, congestion, confidence, safety pass) with empty buckets omitted.

**Prometheus.** `GET /metrics` exposes `stm_snapshots_total`, `stm_city_snapshots_total`, `stm_sse_clients`,
`stm_safety_pass_ratio`, `stm_avg_congestion_pct`, `stm_live_congestion_score`, `stm_challans_total`,
`stm_audit_entries`.

Complete endpoint reference: [API Reference](api-reference.md).

---

## 8. The operator write-path

`src/control/control-channel.ts` is the *only* sanctioned way a human can drive the junction, and it is constrained
by construction:

| Constraint | Mechanism |
|---|---|
| **Cannot create a conflict** | Single phase only (`NORTH \| SOUTH \| EAST \| WEST`); one green phase is safe by construction |
| **Clearances still enforced** | The live loop applies `control.clearanceIntervals()` (the configured minima) |
| **Time-bounded** | Duration clamped to [10, 120] s; `expiresAt` set on issue |
| **Subordinate to emergencies** | An active corridor always wins; the override is *deferred* and the deferral audited |
| **Fully audited** | Request / apply / defer / clear each append an `AuditEntry` |

In `live.ts`:

```typescript
if (pendingOverride && emergencyToken)  control.recordDeferred(pendingOverride, "emergency corridor active");
else if (pendingOverride) { /* rewrite targetPhase, duration, mode=MANUAL_OVERRIDE, path=OVERRIDE_MODE */ }
```

**Audit actions:** `DECISION` · `OVERRIDE_REQUESTED` · `OVERRIDE_APPLIED` · `OVERRIDE_DEFERRED` ·
`OVERRIDE_CLEARED` · `SAFETY_BLOCK` · `EMERGENCY`. Outcomes: `ok` · `blocked` · `info`.

---

## 9. Persistence and state

### 9.1 Two adapters, one synchronous interface

```typescript
interface PersistenceStore {
  init(): Promise<void>;
  appendAudit(entry: AuditEntry): void;
  recentAudit(limit: number): AuditEntry[];
  appendSnapshot(snap: CycleSnapshot): void;
  recentSnapshots(limit: number): CycleSnapshot[];
  readDoc<T>(name: string, fallback: T): T;
  writeDoc(name: string, value: unknown): void;
}
```

Reads and appends are **synchronous by design** so callers (control channel, gateway, challan store, registry) need
no async plumbing. The Postgres adapter satisfies this with an in-memory cache hydrated during `init()` plus
write-behind inserts.

| Adapter | Selected when | Storage |
|---|---|---|
| `FilePersistence` | default | `.data/audit.jsonl` (cap 5 000), `.data/history.jsonl` (cap 2 000), `.data/*.json` docs |
| `PostgresPersistence` | `DATABASE_URL` set, or `STORE=postgres` | TimescaleDB pg16; `cycle_history` promoted to a hypertable; tables created on first run |

JSONL files self-trim: when a file exceeds twice its cap it is rewritten keeping the newest `cap` lines.

**Degradation:** if `persistence.init()` throws (unreachable database), `live.ts` catches it, logs a warning, and
falls back to `FilePersistence` rather than crashing the stack. The same pattern applies to the Redis hot store,
which falls back to `NullHotStore`.

### 9.2 Hot store

`hotstore/` mirrors live state to Redis under `junction:{id}:state` and `city:state` for other readers. It is
strictly optional; the gateway's in-memory copy is authoritative for the SSE stream.

### 9.3 Stores built on persistence

| Store | Document | Contents |
|---|---|---|
| `ChallanStore` | `challans.json` (cap 200) | Violation queue, fines, resolution state |
| `RegistryStore` | registry docs | Edge nodes (heartbeat, CPU, uptime), users, zones |
| `AuthStore` | user doc | scrypt-hashed credentials; default password `stm@1234` |

---

## 10. Authentication and RBAC (server side)

`src/auth/jwt.ts` — dependency-free HS256 using `node:crypto`.

```
POST /auth/login  { role }                    → demo role login (gated by ALLOW_DEMO_LOGIN)
POST /auth/login  { username, password }      → scrypt verification against AuthStore
POST /auth/sso    { email }                   → IdP stub, maps email to role (ALLOW_SSO_STUB)
                                              → { token, user: { sub, name, role, iat, exp } }
```

Verification uses `timingSafeEqual` on the signature and rejects expired tokens. `claimsFromHeader()` parses the
`Authorization: Bearer` header on every write. The role matrix is enforced **server-side** in `authorize()`:

| Write | Permitted roles |
|---|---|
| `/control/override`, `/control/clear` | `ADMIN`, `OPERATOR` |
| `/control/dispatch` | `ADMIN`, `DISPATCHER` |
| `/challans/:id/issue`, `/challans/:id/reject` | `ADMIN`, `INSPECTOR` |

The React app's route guard is a convenience, not the security boundary. Responses: `401` missing/invalid token,
`403` wrong role.

---

## 11. Multi-junction operation

`src/multi/junctions-controller.ts` runs the **real** M1–M4 orchestrator for each of the eight peer junctions on
their own (currently mock) perception, rather than a random walk. Peer summaries feed the Command Dashboard city
map. Peers are display-and-analysis only — they never enter the live junction's control path.

---

## 12. Observability

| Facility | Configuration | Output |
|---|---|---|
| OpenTelemetry | `OTEL_EXPORTER_OTLP_ENDPOINT` (OTLP) or `OTEL_CONSOLE=true` | One `pipeline.cycle` span per cycle, tagged `stm.cycle`, `stm.mode`, `stm.phase`, `stm.cvConfidence`, `stm.safetyPassed` |
| Prometheus | always on | `GET :8200/metrics` |
| Audit log | always on | `.data/audit.jsonl` or `audit_log` table; `GET /audit?limit=n` |
| Console | always on | Per-cycle labelled trace of Member 1–4 stages and the decision chain |

With no `OTEL_*` variables set, tracing is a no-op — zero overhead, no configuration required.

---

## 13. Testing

`npm run test` executes `src/index.ts`: an integration and chaos harness covering

1. Normal operation (high confidence, no emergency)
2. Emergency mode (verified token detected)
3. Low-confidence hijack (winter smog scenario)
4. Stale Layer-2 data (network outage)
5. Asserted regression scenarios covering the safety-hold fix, the EMV verification fix and the max-pressure
   differential fix

`src/emv/corridor-conflict.test.ts` covers the corridor invariants — single-grant, promotion on arrival, held-not-
dropped sequencing, reservation release on re-plan.

---

## 14. Configuration reference

All values in `src/config.ts`; environment template in `.env.example`.

| Variable | Default | Purpose |
|---|---|---|
| `PERCEPTION_URL` | `http://localhost:8000` | Layer-2 base URL |
| `JUNCTION_ID` | `DEL_DL_ITO_01` | Junction under live control |
| `JUNCTION_LAT` / `JUNCTION_LNG` | `28.6304` / `77.2177` | Physical position for GPS checks |
| `EMV_INGEST_PORT` | `8100` | Token intake |
| `DASHBOARD_PORT` | `8200` | Gateway |
| `DATA_DIR` | `.data` | File store location |
| `DATABASE_URL` / `STORE` | unset | Selects the Postgres adapter |
| `REDIS_URL` | unset | Enables the Redis hot store |
| `JWT_SECRET` | dev default | **Must be overridden in production** |
| `JWT_TTL_SECONDS` | 28 800 (8 h) | Token lifetime |
| `ALLOW_DEMO_LOGIN` | `true` | Set `false` to force username+password |
| `ALLOW_SSO_STUB` | `true` | Set `false` once a real IdP is wired |
| `EMV_*` | see [Layer 1 §5](layer-1-sensing-and-emv-telemetry.md#5-sensing-configuration-reference) | Trust-gate tuning |
| `BROKER_CONNECTED` | `true` | Chaos toggle → `LOCALLY_AUTONOMOUS` |
| `EDGE_FAULT` | `false` | Chaos toggle → `TOTAL_FAILSAFE` |
| `OTEL_CONSOLE` / `OTEL_EXPORTER_OTLP_ENDPOINT` | unset | Tracing |
