# Layer 3 → Layer 4 Actuation Command Contract (v1.0-draft)

**Status:** DRAFT — pending sign-off by Layer-3 (Decision Engine) and Layer-4 (Communication & Control) teams.
**Scope:** The single message Layer 3 emits to Layer 4 every ~30s per junction: the `ActuationCommand`.
**Source of truth (L3):** `Layer-3_STM/src/types/types.ts` → `ActuationCommand`.
**Source of truth (L4):** RUDRA-X Architecture Diagrams 1–3 (validate: `junctionId · phase · duration · mode`).

---

## 1. Canonical message schema

This is the agreed wire format. Field names are **normative** — both sides use exactly these keys.

```json
{
  "junctionId": "DEL_ITO_01",
  "commandId": "cmd-7f3a9c20-0001",
  "targetPhaseId": "EAST",
  "durationSeconds": 30,
  "clearanceIntervals": {
    "yellowSeconds": 3,
    "allRedSeconds": 2
  },
  "executionMode": "NORMAL_MAX_PRESSURE",
  "issuedAt": "2026-06-22T10:15:30.000Z",
  "schemaVersion": "1.0"
}
```

### Field definitions

| Field | Type | Required | Description | Owner |
|---|---|---|---|---|
| `junctionId` | string | yes | Junction this command targets. Stable ID shared across all layers. | L3 |
| `commandId` | string | yes | Globally unique per command. L4 keys its PENDING/EXECUTED DB record on this. | L3 |
| `targetPhaseId` | enum: `NORTH \| SOUTH \| EAST \| WEST` | yes | Phase (approach) to drive green. Maps to L4 "phase" / NTCIP `activePhase`. | L3 |
| `durationSeconds` | number (int, ≥ minGreen) | yes | Green hold time. Maps to L4 "duration" / NTCIP `greenTime`. | L3 |
| `clearanceIntervals.yellowSeconds` | number (int) | yes | Yellow before switch. Maps to NTCIP `yellowTime`. **See §3.** | L3 |
| `clearanceIntervals.allRedSeconds` | number (int) | yes | All-red interlock. Maps to NTCIP `allRedTime`. **See §3.** | L3 |
| `executionMode` | enum (see §2) | yes | Decision path that produced this command. Maps to L4 mode. | L3 |
| `issuedAt` | string (ISO-8601 UTC) | yes | When L3 produced the command. L4 uses for staleness check + audit. | L3 |
| `schemaVersion` | string (semver) | yes | This contract version. Both sides reject on major mismatch. | both |

**Naming note (gap #1 partial):** L4's internal model previously referred to `phase`, `duration`, `mode`. Per this
contract the wire keys are `targetPhaseId`, `durationSeconds`, `executionMode`. L4 maps these on receipt; L3 does
not rename. This avoids touching the L3 `ActuationCommand` type already in production code.

---

## 2. `executionMode` ↔ Layer-4 mode mapping (closes gap #1)

L3 emits **four** modes. L4 must handle all four. The previously-missing `HISTORICAL_FALLBACK` is mapped explicitly.

| L3 `executionMode` | L4 execution path | Duration source | Notes |
|---|---|---|---|
| `NORMAL_MAX_PRESSURE` | **Normal** | Use `durationSeconds` from command | Steady-state optimizer output. |
| `GREEN_CORRIDOR` | **Corridor** | Use `durationSeconds` from command | EMV / green-corridor preemption. Immediate green. |
| `HISTORICAL_FALLBACK` | **Normal** | Use `durationSeconds` from command | ⚠️ Was orphaned. It IS a calculated duration (from L3's historical DB), so L4 treats it like Normal — it must NOT collapse to the fixed 30s Safe Default, or L3's historical timing is lost. |
| `SAFE_DEFAULT` | **Safe Default** | Ignore `durationSeconds`; use fixed 30s rotation | Safety gate forced a safe state; L4 applies its own fixed fallback. |

**Rule:** L4 only substitutes its own fixed 30s duration for `SAFE_DEFAULT`. For the other three modes L4 **must honor
`durationSeconds`** from the command.

**Validation:** An `executionMode` value not in this table → L4 rejects the command and applies Safe Default (fail-safe),
logs a `SCHEMA_VIOLATION`, and does NOT write EXECUTED.

---

## 3. Clearance interval ownership (closes gap #2)

**DEFAULT (adopted unless a team objects before sign-off): Option A — L3 owns clearances.**

L4 passes `clearanceIntervals.yellowSeconds` and `allRedSeconds` straight through to the NTCIP `yellowTime` /
`allRedTime` SETs. **L4 stops hardcoding YELLOW=5 / ALL-RED=2.**
Rationale: L3's Safety Supervisor already computes these per-phase; a hardcoded value in L4 silently overrides
safety logic and could violate a min-yellow/min-all-red invariant the Decision Engine intended.

**Safety floor:** L4 still enforces a hard minimum — if a command arrives with `yellowSeconds < 3` or
`allRedSeconds < 2`, L4 clamps up to the floor (never down) and logs `CLEARANCE_CLAMPED`. This protects the
intersection even if L3 sends a bad value; it never weakens L3's intent.

<details><summary>Rejected alternative — Option B (L4 owns clearances)</summary>

L3 stops populating `clearanceIntervals` and L4's fixed 5s/2s is authoritative. Simpler for L4, but discards
L3's safety-derived per-phase values. Not adopted.
</details>

---

## 4. Transport (closes the open item)

**DEFAULT (adopted unless a team objects before sign-off): MQTT**, symmetric with L4's existing status topic and the
arch's MQTT bus. L3 publishes the command; L4 subscribes, executes, and publishes status back.

| Direction | Topic | Payload |
|---|---|---|
| L3 → L4 command | `stm/junction/{junctionId}/command` | the `ActuationCommand` JSON above |
| L4 → status (existing) | `stm/junction/{junctionId}/status` | `{ "commandId": "...", "status": "DONE" }` |

**Default MQTT settings:**

| Setting | Default | Rationale |
|---|---|---|
| QoS | **1 (at-least-once)** | Command must arrive; L4 dedupes on `commandId` so a redelivery is harmless. |
| Retained | **false** on `command` | A retained stale command would re-fire on reconnect — dangerous for actuation. |
| Retained | **true** on `status` | Late subscribers (dashboards) get the last known junction status. |
| Payload | UTF-8 JSON, this schema | — |
| Auth | **mTLS or username/password per broker policy** | Actuation topics must not be world-writable. Finalize with infra. |
| Staleness | L4 drops a command if `issuedAt` is older than **2× the 30s cycle (60s)** | Prevents executing a backed-up command after an outage. |

> The one item still genuinely needing infra input is the broker credential/mTLS specifics; the messaging shape above
> is the adopted default.

---

## 5. Worked example — EMV green corridor on EAST

**L3 emits:**
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

**L4 resolves → Corridor mode → NTCIP SET sequence:**
```
SNMP SET activePhase = EAST
SNMP SET greenTime   = 45
SNMP SET yellowTime  = 5    # from clearanceIntervals (Option A)
SNMP SET allRedTime  = 2    # from clearanceIntervals (Option A)
```

---

## 6. Sign-off

| Team | Owner | Date | Approved |
|---|---|---|---|
| Layer 3 — Decision Engine |  |  | ☐ |
| Layer 4 — Communication & Control |  |  | ☐ |

**Defaults adopted (objection-only):** §3 clearance ownership → **Option A (L3 owns)**; §4 transport → **MQTT** with the
settings table above. These stand unless a team objects before sign-off.

**Still needs infra input (non-blocking for design):** §4 broker credential / mTLS specifics.
