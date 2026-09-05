# 05 · Layer 5 — Data, Logging, Analytics & Command

> **Role:** the human face of the system. Layer 5 renders live junction state, gives four operator personas the
> exact controls their role requires, keeps the audit and analytics record, and exposes a public citizen view.

| Property | Value |
|---|---|
| **Directory** | `Layer-5/` |
| **Stack** | React 18 · TypeScript 5.6 · Vite 5 · React Router 6 · Leaflet / react-leaflet · GSAP · lucide-react |
| **Port** | `5273` |
| **Upstream** | Layer-3 gateway at `VITE_GATEWAY_URL` (default `http://localhost:8200`) |
| **Embedded** | 3D simulator at `VITE_SIM_URL` (default `http://localhost:8081`) |
| **Design language** | Light india.gov.in government-portal styling, bilingual (English / हिन्दी) |
| **Scale** | ~6 600 lines · 11 screens · 40+ components |

The backend for Layer 5 is **not** a separate service: it is the Layer-3 dashboard gateway. That is a deliberate
architectural decision — one control plane, one audit log, one source of live state.

---

## 1. Application structure

```
src/
├── main.tsx · App.tsx ──────── router; StreamProvider scoping
│
├── context/
│   ├── AuthContext.tsx ─────── session, JWT storage, login verbs
│   ├── StreamContext.tsx ───── ONE SSE connection shared by every screen
│   └── LangContext.tsx ─────── EN / HI toggle
│
├── hooks/
│   ├── useSnapshotStream.ts ── EventSource subscription, de-dupe, reconnect state
│   └── useReveal.ts ────────── scroll-reveal animation
│
├── lib/
│   ├── api.ts ──────────────── typed client for every gateway REST endpoint
│   ├── congestion.ts ───────── shared congestion ramp helpers
│   └── mockData.ts ─────────── fallback data when the gateway is unreachable
│
├── types/
│   ├── snapshot.ts ─────────── MIRROR of the Layer-3 contract (keep in sync)
│   └── auth.ts ─────────────── roles + the module access matrix (single source of truth)
│
├── layout/    DashboardLayout · Sidebar
├── components/
│   ├── (live ops)  JunctionDiagram · ApproachList · DecisionPanel · ReasonChain
│   │               ConfidenceGauge · CycleHistory · EmergencyBanner · AuditTrail
│   ├── (maps)      DelhiMap · PublicMap
│   ├── command/    CityMap · JunctionMatrix · IncidentFeed · AiPanel
│   ├── gov/        GovHeader · GovFooter · Emblem · MinistryCrest · DelhiSkyline · ...
│   └── (shell)     RequireAuth · Modal · StatCard · EmptyState · ConnectionChip · Reveal
└── pages/     11 screens, section 4
```

---

## 2. The data path

### 2.1 One stream, shared

```typescript
<StreamProvider>          // opens exactly ONE EventSource for the whole dashboard
  <DashboardLayout />     // every screen calls useStream()
</StreamProvider>
```

Without this provider, each screen mounting its own `EventSource` would multiply connections and reset history on
every navigation. `StreamProvider` wraps both the authenticated dashboard tree and the public `/live-traffic` route
independently.

`useSnapshotStream()` behaviour:

| Aspect | Implementation |
|---|---|
| Events | `snapshot` (`CycleSnapshot`) and `city` (`CitySnapshot`) |
| Connection state | `connecting` → `live` on open/frame → `disconnected` on error; surfaced by `ConnectionChip` |
| Reconnect | `EventSource` reconnects automatically; the gateway replays its history buffer on connect |
| De-duplication | A `Set<number>` of seen cycle numbers, so replayed frames update `latest` but do not duplicate `history` |
| History bound | 60 cycles (≈30 min at a 30 s cycle) |
| Malformed frames | Swallowed per-frame; the stream is never torn down by one bad payload |

### 2.2 Writes

`lib/api.ts` is the single typed client. `setAuthToken()` is called by `AuthContext` after login; every request then
carries `Authorization: Bearer <jwt>`. Read helpers throw on non-2xx; `dispatchEmv()` is special-cased because
**HTTP 409 is a normal outcome** (corridor conflict), not an error.

```
GET   /control/state · /audit · /analytics · /analytics/series · /challans · /registry
POST  /auth/login · /auth/sso
POST  /control/override · /control/clear        [ADMIN, OPERATOR]
POST  /control/dispatch                         [ADMIN, DISPATCHER]
POST  /challans/:id/issue · /challans/:id/reject [ADMIN, INSPECTOR]
```

---

## 3. Roles and the access matrix

`src/types/auth.ts` is the **single source of truth** for access control. Both the sidebar and the `RequireModule`
route guard read `MODULES`, so a screen can never appear in navigation for a role that cannot open it.

| Role | Label | Remit |
|---|---|---|
| `ADMIN` | Administrator / प्रशासक | Full command access — all modules, users and nodes |
| `OPERATOR` | Signal Operator / सिग्नल संचालक | Live monitoring and manual phase control |
| `INSPECTOR` | Enforcement Inspector / प्रवर्तन निरीक्षक | Corridor compliance and challan review |
| `DISPATCHER` | Emergency Dispatcher / आपातकालीन प्रेषक | Dispatch and track emergency green corridors |

| Module | Path | ADMIN | OPERATOR | INSPECTOR | DISPATCHER |
|---|---|:--:|:--:|:--:|:--:|
| Command Dashboard | `/dashboard/command` | ✔ | ✔ | ✔ | ✔ |
| Live Operations | `/dashboard/live` | ✔ | ✔ | ✔ | ✔ |
| Emergency Corridor | `/dashboard/emergency` | ✔ | | | ✔ |
| Signal Control | `/dashboard/signal` | ✔ | ✔ | | |
| Challan Review | `/dashboard/challan` | ✔ | | ✔ | |
| Corridor Inspector (TI) | `/dashboard/ti` | ✔ | | ✔ | |
| Analytics | `/dashboard/analytics` | ✔ | ✔ | ✔ | ✔ |
| Administration | `/dashboard/admin` | ✔ | | | |
| System Health | `/dashboard/health` | ✔ | ✔ | ✔ | ✔ |
| 3D Simulation | `/dashboard/simulation` | ✔ | ✔ | ✔ | ✔ |

`firstAllowedPath(role)` sends a freshly authenticated user to the first screen their role can open.

> **Security note.** This matrix is a *usability* boundary. The security boundary is server-side: the gateway
> re-checks the JWT role on every write and answers `403` regardless of what the client rendered.

### Authentication routes

| Method | Screen affordance | Backend |
|---|---|---|
| Username + password | Login form | `POST /auth/login {username, password}` — scrypt verification |
| SSO | Email field | `POST /auth/sso {email}` — IdP stub mapping email to role |
| Demo persona | Role quick-buttons | `POST /auth/login {role}` — gated by `ALLOW_DEMO_LOGIN` |

Demo password: `stm@1234`.

---

## 4. Screens

### 4.1 Landing (`/`) — public

Government-portal front page: emblem, ministry crest, Delhi skyline, bilingual copy from `i18n/landingContent.ts`,
scroll-reveal sections, and entry points to the public live view and the operator login.

### 4.2 Login (`/login`)

Three authentication affordances (above) plus role descriptions. On success `AuthContext` stores the session and
JWT, `api.setAuthToken()` is primed, and the user is redirected to `firstAllowedPath(role)`.

### 4.3 Command Dashboard (`/dashboard/command`) — all roles

City-scale situational awareness, driven by the `city` SSE event.

- **CityMap** — all nine Delhi junctions plotted, coloured by the 5-step congestion ramp, live junction marked.
- **JunctionMatrix** — per-junction table: active phase (NS/EW), plan type, congestion level, vehicle count,
  emergency flag.
- **IncidentFeed** — derived incidents: `GRIDLOCK`, `EMERGENCY`, `SAFETY`, `DEGRADED`, with severity
  (`critical` / `warning` / `info`).
- **AiPanel** — an advisory panel producing typed, confidence-scored recommendations. **This is a documented
  heuristic, not a trained model.**
- KPI tiles: total junctions, nodes online, active corridors, total vehicles.

### 4.4 Live Operations (`/dashboard/live`) — all roles

The single-junction deep view of the current cycle.

| Component | Shows |
|---|---|
| `JunctionDiagram` | Four approaches with live signal colour, the green phase highlighted |
| `ApproachList` | Per-approach occupancy, vehicle count, queue length (m), wait time, congestion level, class split |
| `DecisionPanel` | Chosen phase, duration, execution mode, plan type, clearance intervals, safety verdict |
| `ReasonChain` | The orchestrator's ordered `reasonChain` — the audit trail of *why*, verbatim |
| `ConfidenceGauge` | CV confidence against the 0.70 / 0.80 thresholds |
| `CycleHistory` | Recent cycles with mode and phase |
| `EmergencyBanner` | Active corridor: EMV id, priority class, target phase, ETA |
| `ConnectionChip` | `connecting` / `live` / `disconnected` |

### 4.5 Emergency Corridor / EMVS (`/dashboard/emergency`) — ADMIN, DISPATCHER

Four-state dispatch console mirroring `CorridorSnapshot.status`:

```
IDLE ──dispatch──► CORRIDOR_ACTIVE ──arrival──► ARRIVED
                        │
                   another EMV converges
                        ▼
                    CONFLICT   (loser HELD, with the reason shown verbatim)
```

Dispatch form: target phase, ETA seconds, priority class, optional EMV id. A `409` response renders the conflict
state naming the EMV that currently holds the corridor and its priority class — the held request is queued for safe
sequencing, not discarded. The route legs (`RESERVED` / `CLEARED` / `PENDING` / `ABANDONED`) and re-plan count are
displayed live.

### 4.6 Signal Control (`/dashboard/signal`) — ADMIN, OPERATOR

The manual override console — the one operator write-path into the control loop.

- Select phase, duration (clamped 10–120 s server-side), and a mandatory reason.
- `POST /control/override`; clear with `POST /control/clear`.
- The screen shows the active override, its expiry, and — importantly — when an override has been **deferred**
  because an emergency corridor is active.
- Every request, application, deferral and clear appears in the audit trail.

### 4.7 Challan Review (`/dashboard/challan`) — ADMIN, INSPECTOR

The enforcement queue fed by ANPR plate events and bus-lane violations.

| Column | Source |
|---|---|
| Plate | ANPR read (real when an OCR backend is installed, synthetic otherwise) |
| Junction | Code and name at time of capture |
| Violation | `RED_LIGHT` · `NO_HELMET` · `WRONG_LANE` · `SPEEDING` · `STOP_LINE` |
| Fine | ₹1 000 / ₹1 000 / ₹1 500 / ₹2 000 / ₹500 |
| Speed | Present on `SPEEDING` |
| Confidence | Detection confidence |
| Status | `PENDING` → `ISSUED` or `REJECTED`, with resolver identity and timestamp |

Actions call `POST /challans/:id/issue|reject`; each resolution writes an audit record naming the inspector.

### 4.8 Corridor Inspector / TI (`/dashboard/ti`) — ADMIN, INSPECTOR

Corridor compliance review, driven by `CorridorSnapshot.tiState`:

```
STANDBY ──► MONITORING ──(re-plan)──► DEVIATION ──► COMPLETED
```

Shows the planned route as junction codes, per-leg state, re-plan count, and the compliance score
(`cleared / total legs`).

### 4.9 Analytics (`/dashboard/analytics`) — all roles

- Aggregate KPIs from `GET /analytics`: cycles, mean green, mean vehicles per cycle, safety pass rate, mean
  confidence, mean congestion.
- Distribution charts over execution mode and plan type.
- 24-hour time series from `GET /analytics/series?hours=24&buckets=48`: throughput (PCU), mean wait, congestion,
  confidence, safety pass — with the covered window labelled, since a fresh start has only partial data.
- Congestion heatmap and junction comparison.

### 4.10 Administration (`/dashboard/admin`) — ADMIN only

Reads `GET /registry`:

- **Edge nodes** — id, name, zone, status (`ONLINE`/`DEGRADED`/`OFFLINE`), last heartbeat, junctions served, CPU %,
  uptime %. The live junction's node `EN-118` is refreshed every cycle.
- **Users** — id, name, role, zone, status, last seen.
- **Zones** — junction and node counts.
- **Audit trail** — `GET /audit?limit=n`, most recent first.

Falls back to `lib/mockData.ts` if the gateway is unreachable, so the screen degrades to read-only rather than
breaking.

### 4.11 System Health (`/dashboard/health`) — all roles

Surfaces the Layer-4 `ControllerSnapshot` and the resilience state: controller type, per-approach signal state,
command acknowledgement and round-trip time, edge status, broker connectivity, last heartbeat, and the current
ladder rung (`FULL_ADAPTIVE` / `DEGRADED_SENSING` / `LOCALLY_AUTONOMOUS` / `TOTAL_FAILSAFE`).

### 4.12 3D Simulation (`/dashboard/simulation`) — all roles

Embeds `green-corridor-sim` in an iframe and bridges it to real Layer-3 state. See section 5.

### 4.13 Public Live Traffic (`/live-traffic`) — open, no auth

The Common User application: a bilingual citizen view with a live Leaflet map, congestion colouring, clearest and
avoid-route guidance, and public alerts. It reads the same SSE stream through its own `StreamProvider` and offers no
controls.

---

## 5. The simulator bridge

`SimulationPage.tsx` establishes a bidirectional `window.postMessage` channel with the iframe. Handshake: the
simulator posts `SIM_READY`; the page then begins forwarding.

**Layer-5 → simulator**

| Message | Payload | Effect in the sim |
|---|---|---|
| `SIGNAL_STATE_UPDATE` | `{ signals: {NORTH\|SOUTH\|EAST\|WEST: "red"\|"green"\|"yellow"} }` | Overrides the sim's local lights with real Layer-3 state |
| `EMERGENCY_UPDATE` | `{ active, direction: "NS"\|"EW", emvId, etaSeconds, targetPhase }` | Spawns / clears the ambulance and its corridor |
| `VEHICLE_COUNT_UPDATE` | `{ counts: Record<approach, number> }` | Drives spawn density per approach |
| `CORRIDOR_UPDATE` | `{ active, route }` | Highlights the corridor route |
| `CITY_STATE_UPDATE` | `{ junctions }` | Populates the multi-junction overlay |

**Simulator → Layer-5**

| Message | Payload | Effect |
|---|---|---|
| `SIM_READY` | — | Unblocks forwarding |
| `LANE_DATA_UPDATE` | `{ intersectionId, lanes[], timestamp }` | Renders live per-lane queue / entered / signal / ambulance state |
| `DISPATCH_AMBULANCE` | `{ direction }` | Calls the **real** `POST /control/dispatch`, so an in-sim dispatch produces a genuine signed token |
| `INTERSECTION_SELECTED` | `{ intersectionId }` | Focuses the selected junction |

`postToSim()` is guarded by the ready flag and wrapped in try/catch, so a cross-origin or timing failure is
non-fatal.

---

## 6. Configuration

`src/config.ts`:

| Variable | Default | Purpose |
|---|---|---|
| `VITE_GATEWAY_URL` | `http://localhost:8200` | Layer-3 gateway base; `EVENTS_URL` derives from it |
| `VITE_SIM_URL` | `http://localhost:8081` | Simulator iframe source |

```bash
cd Layer-5
npm install
npm run dev        # http://localhost:5273
npm run build      # tsc -b && vite build
npm run preview
```

---

## 7. Contract mirroring

`src/types/snapshot.ts` is a **hand-maintained mirror** of `Layer-3_STM/src/dashboard/snapshot.ts` and `city.ts`.
Layer 3 is the source of truth.

> **Normative:** a change to the Layer-3 snapshot or city contract MUST be applied to the Layer-5 mirror in the same
> change set. There is no runtime schema negotiation; drift shows up as silently missing fields in the UI.

---

## 8. Resilience of the UI

| Failure | Behaviour |
|---|---|
| Gateway down at load | `ConnectionChip` shows `disconnected`; `EventSource` retries automatically |
| Gateway restarts | Reconnect replays the history buffer; de-duplication prevents double entries |
| Registry / analytics unreachable | Screens fall back to `lib/mockData.ts`, clearly a degraded read-only view |
| Malformed SSE frame | Dropped silently; the stream survives |
| Simulator not running | The Simulation page shows the iframe placeholder and an external link; nothing else is affected |
| Token expired | Writes return `401`; the user is returned to login |
