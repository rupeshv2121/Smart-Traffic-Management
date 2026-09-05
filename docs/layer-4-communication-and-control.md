# 04 · Layer 4 — Communication & Control

> **Role:** carry Layer 3's decision to the physical signal controller, and carry the controller's real state back.
> Layer 4 is an **executor with a hard safety floor**, never a second decision-maker.

| Property | Value |
|---|---|
| **Wire contract** | [`L3-L4-actuation-contract.md`](L3-L4-actuation-contract.md) — v1.0-draft, normative |
| **Transport** | MQTT (adopted default), QoS 1 |
| **Field protocol** | NTCIP SNMP SETs against the controller |
| **Layer-3 side** | `ActuationCommand` produced in `stm-orchestrator.ts` |
| **Read-back** | `ControllerSnapshot` inside every `CycleSnapshot` |
| **Current implementation status** | Command production and read-back modelling are implemented; the MQTT publisher and NTCIP driver are specified and not yet wired to hardware. `controllerType` reports `SIMULATED`. |

---

## 1. Position in the loop

```
   LAYER 3                                LAYER 4                       FIELD
 ┌────────────────┐                ┌────────────────────────┐     ┌──────────────┐
 │ Safety         │ ActuationCmd   │ 1. schema validate     │ SNMP│ Traffic      │
 │ Supervisor ────┼───────────────►│ 2. staleness check     │ SET │ signal       │
 │ approves       │  MQTT QoS 1    │ 3. mode resolution     ├────►│ controller   │
 │                │  retained=false│ 4. clearance clamp     │     │ (NTCIP)      │
 └────────────────┘                │ 5. NTCIP SET sequence  │     └──────┬───────┘
        ▲                          │ 6. dedupe on commandId │            │
        │                          └───────────┬────────────┘            │
        │  ControllerSnapshot                  │ status, retained=true   │
        │  (signalState, ack, health)          ▼                         │
        └──────────────────────────  stm/junction/{id}/status  ◄─────────┘
```

---

## 2. The `ActuationCommand`

```json
{
  "junctionId": "DEL_ITO_01",
  "commandId": "cmd-7f3a9c20-0001",
  "targetPhaseId": "EAST",
  "durationSeconds": 30,
  "clearanceIntervals": { "yellowSeconds": 3, "allRedSeconds": 2 },
  "executionMode": "NORMAL_MAX_PRESSURE",
  "issuedAt": "2026-06-22T10:15:30.000Z",
  "schemaVersion": "1.0"
}
```

| Field | Type | Required | Owner | Notes |
|---|---|---|---|---|
| `junctionId` | string | yes | L3 | Stable identity shared by all layers |
| `commandId` | string | yes | L3 | Globally unique; L4 keys its PENDING/EXECUTED record on it and dedupes redeliveries |
| `targetPhaseId` | `NORTH\|SOUTH\|EAST\|WEST` | yes | L3 | Maps to NTCIP `activePhase` |
| `durationSeconds` | int ≥ minGreen | yes | L3 | Maps to NTCIP `greenTime` |
| `clearanceIntervals.yellowSeconds` | int | yes | L3 | Maps to NTCIP `yellowTime` |
| `clearanceIntervals.allRedSeconds` | int | yes | L3 | Maps to NTCIP `allRedTime` |
| `executionMode` | enum, section 3 | yes | L3 | The decision path that produced the command |
| `issuedAt` | ISO-8601 UTC | yes | L3 | Staleness check + audit |
| `schemaVersion` | semver | yes | both | Reject on major mismatch |

**Naming note.** Layer 4's internal model historically used `phase`, `duration`, `mode`. The wire keys are
`targetPhaseId`, `durationSeconds`, `executionMode`; **L4 maps on receipt, L3 does not rename.** This avoids
disturbing the `ActuationCommand` type already in production Layer-3 code.

The Layer-3 in-code type also permits `MANUAL_OVERRIDE`, produced when an operator override is applied. It is
handled as a Normal-path command (L4 honours `durationSeconds`).

---

## 3. Execution-mode resolution

Layer 4 MUST handle every mode. The mapping is normative.

| L3 `executionMode` | L4 path | Duration source | Rationale |
|---|---|---|---|
| `NORMAL_MAX_PRESSURE` | **Normal** | command `durationSeconds` | Steady-state optimiser output |
| `GREEN_CORRIDOR` | **Corridor** | command `durationSeconds` | EMV preemption; immediate green |
| `HISTORICAL_FALLBACK` | **Normal** | command `durationSeconds` | It *is* a calculated duration, from L3's historical database. It MUST NOT collapse to the fixed 30 s Safe Default, or L3's time-of-day timing is silently discarded. |
| `SAFE_DEFAULT` | **Safe Default** | ignore command; use fixed 30 s rotation | A safety gate forced a safe state; L4 applies its own deterministic fallback |
| `MANUAL_OVERRIDE` | **Normal** | command `durationSeconds` | Audited operator hold; already clearance-bounded by L3 |

**Rule.** L4 substitutes its own fixed duration for `SAFE_DEFAULT` **only**. For every other mode it MUST honour
`durationSeconds`.

**Validation.** An `executionMode` not in this table ⇒ reject the command, apply Safe Default (fail-safe), log a
`SCHEMA_VIOLATION`, and do **not** write an EXECUTED record.

---

## 4. Clearance ownership — Layer 3 owns, Layer 4 floors

**Adopted: Option A — L3 owns clearances.** L4 passes `yellowSeconds` and `allRedSeconds` straight through to the
NTCIP `yellowTime` / `allRedTime` SETs. **L4 stops hardcoding YELLOW=5 / ALL-RED=2.**

*Rationale:* Layer 3's Safety Supervisor already computes clearances per phase. A hardcoded value in Layer 4 would
silently override safety logic and could violate a min-yellow or min-all-red invariant the Decision Engine
intended.

**Safety floor (defence in depth).** L4 still enforces a hard minimum: a command arriving with
`yellowSeconds < 3` or `allRedSeconds < 2` is clamped **up** to the floor — never down — and logs
`CLEARANCE_CLAMPED`. This protects the intersection even if L3 sends a bad value, while never weakening L3's intent.

The rejected alternative (Option B, L4 owns fixed 5 s / 2 s) is simpler for L4 but discards L3's safety-derived
per-phase values, and was not adopted.

---

## 5. Transport — MQTT

| Direction | Topic | Payload |
|---|---|---|
| L3 → L4 command | `stm/junction/{junctionId}/command` | `ActuationCommand` JSON |
| L4 → status | `stm/junction/{junctionId}/status` | `{ "commandId": "...", "status": "DONE" }` |

| Setting | Default | Rationale |
|---|---|---|
| QoS | **1 (at-least-once)** | The command must arrive; L4 dedupes on `commandId`, so a redelivery is harmless |
| Retained (command) | **false** | A retained stale command would re-fire on reconnect — dangerous for actuation |
| Retained (status) | **true** | Late subscribers (dashboards) get the last known junction status |
| Payload | UTF-8 JSON, this schema | — |
| Auth | **mTLS or username/password per broker policy** | Actuation topics must not be world-writable |
| Staleness | drop if `issuedAt` older than **2× cycle (60 s)** | Prevents executing a backed-up command after an outage |

The only item still requiring infrastructure input is the broker credential / mTLS specifics; the messaging shape
above is the adopted default.

**Link health feeds back into Layer 3.** Broker connectivity is reported to `LinkMonitor.setBrokerConnected()`; a
disconnected broker drops the resilience ladder to `LOCALLY_AUTONOMOUS`, where the edge keeps optimising but
cross-junction coordination is known to be gone.

---

## 6. NTCIP mapping

```
SNMP SET activePhase = <targetPhaseId>
SNMP SET greenTime   = <durationSeconds>
SNMP SET yellowTime  = <clearanceIntervals.yellowSeconds>    # Option A pass-through
SNMP SET allRedTime  = <clearanceIntervals.allRedSeconds>    # Option A pass-through
```

### Worked example — EMV green corridor on EAST

L3 emits:

```json
{
  "junctionId": "DEL_ITO_01",
  "commandId": "cmd-7f3a9c20-0042",
  "targetPhaseId": "EAST",
  "durationSeconds": 45,
  "clearanceIntervals": { "yellowSeconds": 5, "allRedSeconds": 2 },
  "executionMode": "GREEN_CORRIDOR",
  "issuedAt": "2026-06-22T10:16:00.000Z",
  "schemaVersion": "1.0"
}
```

L4 resolves to **Corridor** mode and issues:

```
SNMP SET activePhase = EAST
SNMP SET greenTime   = 45
SNMP SET yellowTime  = 5
SNMP SET allRedTime  = 2
```

---

## 7. Controller read-back

Layer 4 reports actual field state back into the `CycleSnapshot` as `ControllerSnapshot`
(`Layer-3_STM/src/dashboard/snapshot.ts`, contract id `stm.l4.controller.v1`):

```typescript
interface ControllerSnapshot {
  controllerType: "NTCIP" | "GPIO" | "VENDOR" | "SIMULATED";
  signalState: Record<"NORTH"|"SOUTH"|"EAST"|"WEST", "RED"|"GREEN"|"YELLOW">;
  commandAck: { applied: boolean; rttMs: number };
  junctionHealth: {
    edgeStatus: "ONLINE" | "DEGRADED" | "OFFLINE";
    brokerConnected: boolean;
    lastHeartbeat: string;   // ISO-8601
  };
}
```

**Current derivation** (simulated controller): the commanded green phase reports `GREEN`, all others `RED`;
`commandAck.applied` mirrors `safetyValidationPassed`. `brokerConnected` and `lastHeartbeat` are **real**, taken
from the resilience `LinkMonitor` — not hardcoded. `edgeStatus` is derived from the ladder:

| Condition | `edgeStatus` |
|---|---|
| `ladderState === "TOTAL_FAILSAFE"` | `OFFLINE` |
| ladder not `FULL_ADAPTIVE`, or perception source is `MOCK_FALLBACK` | `DEGRADED` |
| otherwise | `ONLINE` |

This snapshot drives the System Health screen and the simulator's signal overlay.

**When real hardware is attached:** replace the derivation with the controller's own read-back, set
`controllerType` accordingly, and populate `commandAck.rttMs` from the measured SET round trip. No consumer changes
— the contract is unchanged.

---

## 8. Layer-4 obligations checklist

A conforming Layer-4 implementation MUST:

1. Reject a command whose `schemaVersion` major differs from its own.
2. Drop a command whose `issuedAt` is older than 60 s.
3. Dedupe on `commandId`; a redelivery must not re-actuate.
4. Resolve `executionMode` per section 3, honouring `durationSeconds` for all modes except `SAFE_DEFAULT`.
5. Pass `clearanceIntervals` through to NTCIP, clamping **up** to the 3 s / 2 s floor and logging `CLEARANCE_CLAMPED`.
6. Reject unknown `executionMode` values, apply Safe Default, log `SCHEMA_VIOLATION`, write no EXECUTED record.
7. Publish a retained status message keyed on `commandId`.
8. Report broker connectivity and controller health back for the `ControllerSnapshot`.

## 9. Sign-off status

| Team | Owner | Date | Approved |
|---|---|---|---|
| Layer 3 — Decision Engine | | | ☐ |
| Layer 4 — Communication & Control | | | ☐ |

**Defaults adopted (objection-only):** clearance ownership → Option A (L3 owns); transport → MQTT with the settings
in section 5. These stand unless a team objects before sign-off. **Still needs infrastructure input
(non-blocking for design):** broker credential / mTLS specifics.
