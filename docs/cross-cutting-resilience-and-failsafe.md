# 08 · Cross-Cutting Spine B — Resilience & Fail-Safe

> **Principle:** degrade, never fail. Every failure mode has a defined, less-capable but *safe* successor state.
> A traffic controller that stops is more dangerous than one that runs a fixed-time plan.

---

## 1. The two failure axes

Failures are classified along two independent axes, then combined into a single ladder rung.

| Axis | Sensed by | Failure examples |
|---|---|---|
| **Perception** | CV confidence in the `Layer2Payload` | Rain, glare, fog, lens dirt, blur, feed loss, model degradation |
| **Link / compute** | `LinkMonitor` | MQTT broker down, heartbeat silence, edge compute or hardware-validation fault |

Keeping them separate matters: losing the camera and losing the broker are different problems requiring different
responses. Collapsing them into one "unhealthy" flag would either over-react to a dirty lens or under-react to a
dead edge node.

---

## 2. The four-state ladder

`Layer-3_STM/src/resilience-handler.ts`

```
STATE 0 · FULL_ADAPTIVE
   Live CV → person-weighted max-pressure → coordinated over the bus.
   Full capability.
        │  CV confidence < 0.70
        ▼
STATE 1 · DEGRADED_SENSING
   Perception is untrustworthy. Switch to historical time-of-day timing plans
   derived from this junction's own persisted history.
   Still safe, still locally adaptive in schedule, no longer reactive.
        │  broker disconnected OR heartbeat stale (> 30 s)
        ▼
STATE 2 · LOCALLY_AUTONOMOUS
   Cross-junction coordination is gone. The edge keeps running max-pressure on
   its own perception. Corridors and green waves that need coordination are not
   available. The condition is flagged in every reasonChain and snapshot.
        │  edge compute / hardware-validation fault
        ▼
STATE 3 · TOTAL_FAILSAFE
   Short-circuit the entire optimisation path. Emit SAFE_DEFAULT immediately.
   Layer 4 applies its own fixed 30 s rotation. Nothing clever runs.
```

### Rung computation

```typescript
export function computeLadderState(
  cvConfidence: number, criticalConfidence: number, link: LinkSnapshot,
): LadderState {
  if (!link.edgeComputeOk)                            return "TOTAL_FAILSAFE";
  if (!link.brokerConnected || link.heartbeatStale)   return "LOCALLY_AUTONOMOUS";
  if (cvConfidence < criticalConfidence)              return "DEGRADED_SENSING";
  return "FULL_ADAPTIVE";
}
```

**Most-severe wins.** A total fault outranks a lost broker, which outranks degraded sensing. Defaults are healthy,
so the ladder sits at STATE 0 until something is genuinely wrong.

### The one exception — a verified corridor

A verified EMV corridor is **GPS- and token-primary**: it does not depend on the camera, so `DEGRADED_SENSING` must
not suppress it. The orchestrator's `emvPrimary` flag bypasses both perception-degradation fallbacks (staleness and
confidence) for that cycle. Only `TOTAL_FAILSAFE` overrides a corridor.

```
EMV corridor is GPS/token-primary — bypassing perception-degradation fallbacks
(stale data / low CV confidence) for this preemption.
```

---

## 3. `LinkMonitor`

```typescript
class LinkMonitor {
  constructor(heartbeatTimeoutMs = 30_000, now = () => Date.now())
  heartbeat(): void                       // edge proves liveness each cycle
  setBrokerConnected(connected: boolean): void
  setEdgeFault(faulted: boolean): void
  snapshot(): LinkSnapshot
}

interface LinkSnapshot {
  brokerConnected: boolean;
  heartbeatAgeMs: number;
  heartbeatStale: boolean;     // age > heartbeatTimeoutMs
  edgeComputeOk: boolean;
}
```

The injectable clock keeps the monitor deterministic under test. Snapshots are stamped onto every
`OrchestratorResult` and surface in the `CycleSnapshot` as `resilience` and inside `controller.junctionHealth`.

### Chaos toggles

```bash
BROKER_CONNECTED=false npm run live    # force STATE 2 — locally autonomous
EDGE_FAULT=true        npm run live    # force STATE 3 — total fail-safe
```

Both are read in `live.ts:main()` and announced at startup, so a degraded run is never silent.

---

## 4. The confidence gate — hysteresis

`ResilienceHandler.evaluateConfidenceAndDecide()`

| Band | Confidence | Action |
|---|---|---|
| **Nominal** | ≥ 0.80 | `USE_OPTIMIZED_PLAN` |
| **Warning** | 0.70 – 0.80 | `USE_OPTIMIZED_PLAN`, logged `CONFIDENCE_WARNING`, monitored |
| **Critical** | < 0.70 | `SWITCH_TO_HISTORICAL_FALLBACK`, fallback **latched** |
| **Latched** | still < 0.70 | `MAINTAIN_FALLBACK` |
| **Recovery** | latched and ≥ 0.70 | `USE_OPTIMIZED_PLAN`, latch cleared, logged `CONFIDENCE_RECOVERED` |

**Why the latch.** Without it, confidence oscillating around 0.70 would flip the junction between adaptive and
historical timing every cycle — the worst of both. The latch clears only on a clean recovery above the *critical*
threshold, so the system commits to a mode rather than dithering.

The two thresholds are asymmetric on purpose: 0.80 warns, 0.70 acts. The gap is the observation window in which an
operator can see degradation coming before behaviour changes.

---

## 5. The enforcement point

`hijackAndEnforceHistorical()` is the last thing that touches the command, after the optimiser and after safety
validation:

```typescript
if (!state.isFallbackActive) return proposedCommand;          // pass-through

const plan = historicalPlans.find(p => p.phaseId === proposedCommand.targetPhaseId);
if (!plan) return { ...proposedCommand, executionMode: "HISTORICAL_FALLBACK" };

return { ...proposedCommand,
         durationSeconds: plan.recommendedGreenTime,
         executionMode: "HISTORICAL_FALLBACK" };
```

Note the design: it does not merely *veto* the optimiser, it **substitutes** a known-good duration. If no historical
plan exists for the target phase, the proposed duration survives but the mode is still rewritten so Layer 4 and the
dashboard know the decision was not made on live perception.

---

## 6. Closing the fail-safe loop with real history

`Layer-3_STM/src/control/fallback.ts` — the fallback plans are **not** static constants; they are derived from what
this junction actually did.

```
for each phase in [NORTH, SOUTH, EAST, WEST]:
    served    = snapshots where decision.targetPhaseId == phase
    thisHour  = served where timestamp.hour == now.hour

    use = thisHour if |thisHour| >= 3 else served
    if |use| < 3:  return the static default for this phase

    recommendedGreenTime = mean(use[].decision.durationSeconds)
    historicalDemand     = mean(use[].approach[phase].totalVehicles)
```

Three tiers, so the loop is always answerable:

1. **Time-of-day** — same hour, ≥3 samples. Genuine time-of-day behaviour: the 09:00 plan reflects 09:00 traffic.
2. **All history** — any samples for that phase.
3. **Static defaults** — from the mock generator, so a cold start still has a plan.

Derived fresh every cycle in `live.ts`, and served to Layer 5 at `GET /fallback-plan` so operators can inspect what
the system would fall back to *before* it needs to.

---

## 7. Post-corridor recovery

An emergency corridor holds cross-traffic. When it dissolves, the held approaches carry accumulated spillback that
the steady-state max-pressure objective would under-serve — the exact moment the junction most needs extra capacity.

```typescript
public resume(junctionId: string): void {
  this.pausedJunctions.delete(junctionId);
  this.recoveryCycles.set(junctionId, RECOVERY_CYCLES);   // 3 cycles
}

// inside pressure computation, while recovery is armed:
recoveryBoost = RECOVERY_BOOST_WEIGHT * downstreamOccupancyPct;   // 2.0 × occupancy
upstreamDemand = priorityScore + recoveryBoost;
```

For three cycles, high-occupancy held approaches receive an explicit demand boost so the optimiser grants extended
green to clear the backlog. The window is consumed one cycle at a time and logged:

```
[RECOVERY] Junction DEL_DL_ITO_01 — post-corridor recovery active (2 cycle(s) left): boosting held approaches.
```

---

## 8. Component-level degradation matrix

Every external dependency has a defined fallback. None of them can stop the control loop.

| Dependency | Failure detected by | Fallback | Operator visibility |
|---|---|---|---|
| Perception service | `Layer2Bridge.fetchLayer2()` throws | `MockDataGenerator` payload | `perception.source = "MOCK_FALLBACK"`; `edgeStatus = DEGRADED` |
| Bus-lane endpoint | `fetchBusLane()` throws | Skip for this cycle | Console warning; `busLane` absent from the snapshot |
| Postgres / TimescaleDB | `persistence.init()` throws | `FilePersistence` on `.data/` | Startup warning |
| Redis hot store | `hotStore.init()` throws | `NullHotStore` (in-memory only) | Startup warning |
| OTel collector | `OTEL_*` unset or unreachable | No-op tracer | None needed — zero overhead |
| MQTT broker | `setBrokerConnected(false)` | Ladder → `LOCALLY_AUTONOMOUS` | `resilience.ladderState`, System Health screen |
| Edge compute | `setEdgeFault(true)` | Ladder → `TOTAL_FAILSAFE`, `SAFE_DEFAULT` | `edgeStatus = OFFLINE` |
| Gateway (from the UI's view) | `EventSource` error | Auto-reconnect; history replayed on reconnect | `ConnectionChip` shows `disconnected` |
| Registry / analytics REST | fetch failure | Layer-5 `lib/mockData.ts`, read-only | Screen renders in a clearly degraded state |
| Layer-2 frame missing | HTTP 500 naming the approach | Treated as a perception outage | Same as perception service failure |

---

## 9. Safety behaviour under degradation

Degradation never weakens the safety interlocks. In every rung:

| Invariant | STATE 0 | STATE 1 | STATE 2 | STATE 3 |
|---|:--:|:--:|:--:|:--:|
| No conflicting greens | ✔ | ✔ | ✔ | ✔ |
| Minimum green enforced | ✔ | ✔ | ✔ | ✔ (fixed plan) |
| Yellow ≥ 5 s, all-red ≥ 2 s | ✔ | ✔ | ✔ | ✔ |
| Pedestrian walk integrity | ✔ | ✔ | ✔ | ✔ |
| Adaptive optimisation | ✔ | — | ✔ (local only) | — |
| Cross-junction coordination | ✔ | ✔ | — | — |
| EMV corridor available | ✔ | ✔ (token-primary) | ✔ (single junction) | — |

The Safety Supervisor is *outside* the ladder: it validates in every state, including the fallback paths, and its
verdicts are what the fallback commands are built from.

---

## 10. Observing resilience state

**In the snapshot:**

```typescript
resilience: {
  ladderState: "FULL_ADAPTIVE" | "DEGRADED_SENSING" | "LOCALLY_AUTONOMOUS" | "TOTAL_FAILSAFE";
  brokerConnected: boolean;
  heartbeatAgeMs: number;
  edgeComputeOk: boolean;
}
```

**In the reason chain** — every degradation states its cause in prose, for example:

```
RESILIENCE STATE 2 — LOCALLY_AUTONOMOUS: broker disconnected → running max-pressure at the edge (no cross-junction coordination).
RESILIENCE STATE 3 — TOTAL_FAILSAFE: edge compute/hardware fault → Safety Supervisor fixed-time default.
STALE_DATA: Layer 2 data is 14s old (threshold: 10s)
Confidence too low: 62.40%
```

**In metrics:** `stm_safety_pass_ratio`, `stm_avg_congestion_pct`, `stm_live_congestion_score`,
`stm_sse_clients`, and the mode distribution from `GET /analytics` (a rising `HISTORICAL_FALLBACK` share is the
leading indicator of camera degradation).

**In the UI:** the System Health screen renders the ladder rung, edge status, broker connectivity and last
heartbeat; the Command Dashboard incident feed raises a `DEGRADED` incident.

---

## 11. Testing resilience

```bash
cd Layer-3_STM

npm run test                                  # includes the low-confidence and stale-data scenarios
BROKER_CONNECTED=false npm run live           # STATE 2
EDGE_FAULT=true        npm run live           # STATE 3

# force degraded sensing from the perception service itself:
curl "http://localhost:8000/perception/layer2?confidence=0.6"
```

Stopping the Python service mid-run is the cleanest end-to-end check: the loop should continue uninterrupted, the
console should report `MOCK_FALLBACK`, and the dashboard should show `DEGRADED` without any gap in the cycle stream.
