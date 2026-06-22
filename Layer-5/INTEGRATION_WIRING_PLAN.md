# Integration & Wiring Plan — STM Delhi Layer 5

How Layer 5 connects to Layer 3 today, and what each "go-live" swap looks like.
Companion docs: [`README.md`](README.md), [`ROLE_ACCESS_MATRIX.md`](ROLE_ACCESS_MATRIX.md).

## Data flow

```
GatiShakti-ML (CV)         Layer-3_STM live loop (npm run live)            Layer-5 (this app)
  /perception/layer2  ──►  M1→M2→M3→M4 orchestrator                          React + Vite
                           │  ├─ buildSnapshot()   → CycleSnapshot           useSnapshotStream
                           │  ├─ CitySimulator     → CitySnapshot            ├─ "snapshot" event → latest/history
                           │  └─ ControlChannel    → audit log               └─ "city" event     → city
                           ▼
                    DashboardGateway :8200
                      GET  /events       (SSE: snapshot + city)  ──────────►  StreamProvider
                      GET  /control/state                          ◄────────  Signal Control
                      POST /control/override  (audited write)      ◄────────  Signal Control
                      POST /control/clear                          ◄────────  Signal Control
                      GET  /audit?limit=n                          ◄────────  Signal Control, Administration
                      GET  /analytics                              ◄────────  Administration
```

- **Reads** go over SSE (`useSnapshotStream`) and REST (`src/lib/api.ts`).
- **Writes** are limited to the manual phase override (`POST /control/override`),
  brokered by [`ControlChannel`](../Layer-3_STM/src/control/control-channel.ts):
  single phase only (never a conflicting green), enforced clearance minima,
  time-bounded, **always superseded by an active emergency corridor**, and fully
  audited. Verified end-to-end (request → applied next cycle → expiry → clear).

## Contracts (source of truth → mirror)

| Contract | Source of truth (Layer 3) | Mirror (Layer 5) |
|----------|---------------------------|------------------|
| `CycleSnapshot` | `dashboard/snapshot.ts` | `src/types/snapshot.ts` |
| `CitySnapshot` / `JunctionSummary` / `CityIncident` | `dashboard/city.ts` | `src/types/snapshot.ts` |
| Congestion ramp / class counts | `dashboard/congestion.ts` | `src/lib/congestion.ts` |
| Control + audit + analytics REST | `dashboard/dashboard-gateway.ts` + `control/control-channel.ts` | `src/lib/api.ts` |

> Rule: if the gateway adds a field, add it to the Layer-5 mirror. ISO-8601 UTC
> timestamps and a shared junction-id space everywhere.

## What is live vs simulated today

| Surface | Source today | Go-live swap |
|---------|--------------|--------------|
| Live junction (ITO) | **Real** — Layer-3 orchestrator | already live |
| City map peers (8 junctions) | **Real** — each driven through the M1–M4 orchestrator (`MultiJunctionController`) on mock per-node perception | real cameras per node |
| Incident feed | Derived from junction states + live decision flags | add explicit incident events |
| Streaming transport | **SSE + WebSocket** (`/events`, `/stream`) | — |
| Hot state store | Redis (`junction:{id}:state`, `city:state`) when `REDIS_URL` set, else in-memory | run `docker compose up redis` |
| Fallback timing (fail-safe loop) | **Real** — `/fallback-plan` derived from durable history; orchestrator uses it on low CV confidence | — |
| Observability | **Prometheus** `/metrics` | add OTel traces + structlog shipping |
| ANPR plate events | **Real pipe** — Python CV emits `plate_events` → bridge → Challan store (plate strings synthesized pending OCR) | real plate OCR model |
| Signal Control override | **Real** write-path (audited, JWT-guarded) | — |
| Analytics aggregate | **Real**, **durable** (`/analytics`, file or Postgres) | — |
| Audit trail | **Real**, **durable** append-only (`/audit`) | — |
| Persistence | **File (default) or Postgres/TimescaleDB** (`DATABASE_URL`) | run `docker compose up` for the DB |
| Challan queue | **Real** store, ANPR-fed (`/challans`) — synth when Layer-2 sends none | real CV `plate_events[]` (bridge passes them through) |
| Edge nodes / users / zones | **Real** persisted registry (`/registry`) | live device heartbeats already wired (EN-118) |
| Corridor compliance (TI) | Live junction real + peers simulated | real per-junction green timing |
| Auth / RBAC | **Server-side JWT + scrypt password store** (`/auth/login`, persisted users) + client guard | external SSO/IdP; password-form in UI |
| L4 controller read-back | **Real** in snapshot (`controller`), simulated hardware | NTCIP/GPIO/vendor driver |

## Go-live: the one-line intent

Front-end pages render the contract shapes regardless of origin. Pointing a
screen at live data is a data-source swap (env / endpoint / ingest), **not** a
component rewrite — the same principle the original SSE feed was built on.
