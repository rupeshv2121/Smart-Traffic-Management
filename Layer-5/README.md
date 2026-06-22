# 🚦 Layer 5 — Junction Operations Dashboard

The **Data / Logging / Analytics** layer's live read-out. A React + Vite + TypeScript
dashboard that shows, in real time, what Layer 3 is deciding at a junction:
signal phase, per-approach demand, CV confidence, the active EMV green corridor,
the safety verdict, and the orchestrator's decision audit trail.

```
Layer-3 live loop ──(CycleSnapshot + CitySnapshot, every cycle)──► SSE gateway :8200/events ──► this dashboard
                  ◄──(manual phase override, audited)──────────── POST :8200/control/override
```

The dashboard is **read-only by default** — it observes the control path. The one
sanctioned write-path is the **Signal Control** manual phase override, brokered
through an audited, safety-bounded control channel (single phase only, enforced
clearances, time-bounded, always superseded by an emergency). See
[`INTEGRATION_WIRING_PLAN.md`](INTEGRATION_WIRING_PLAN.md).

Access is **role-gated** (Administrator / Operator / Inspector / Dispatcher) —
see [`ROLE_ACCESS_MATRIX.md`](ROLE_ACCESS_MATRIX.md).

---

## How it connects

Layer 3's live loop (`Layer-3_STM`, `npm run live`) now hosts a
[`DashboardGateway`](../Layer-3_STM/src/dashboard/dashboard-gateway.ts) that
broadcasts one [`CycleSnapshot`](../Layer-3_STM/src/dashboard/snapshot.ts) per
cycle over **Server-Sent Events**. A newly-opened dashboard is replayed the
recent-history buffer, then receives every new cycle live. `EventSource`
auto-reconnects if the loop restarts.

The snapshot contract is mirrored in [`src/types/snapshot.ts`](src/types/snapshot.ts)
— **the Layer-3 file is the source of truth**; keep the two in sync.

---

## Run it

**1. Start Layer 3 (produces the feed)** — from `Layer-3_STM/`:

```bash
npm run live      # boots the pipeline + EMV intake (:8100) + dashboard gateway (:8200)
```

**2. Start this dashboard** — from `Layer-5/`:

```bash
npm install       # first time only
npm run dev       # opens http://localhost:5273
```

That's it. If Layer 3 isn't running yet, the dashboard shows a "no connection"
state and connects automatically once the gateway comes up.

### See an emergency corridor
With both running, dispatch a token (from `Layer-3_STM/`):

```bash
npm run emv:dispatch -- EAST 35 CRITICAL
```

The dashboard shows the pulsing **GREEN CORRIDOR** banner and EAST flips green.

---

## Configuration

| Variable | Default | Meaning |
|----------|---------|---------|
| `VITE_GATEWAY_URL` | `http://localhost:8200` | Base URL of the Layer-3 SSE gateway. Set in a `.env.local` if the backend runs elsewhere. |

The backend port is `DASHBOARD_PORT` (default `8200`) in
[`Layer-3_STM/src/config.ts`](../Layer-3_STM/src/config.ts).

---

## Design

Light, minimal, large-type UI in the visual language of an Indian-government
service: the national tricolour strip, an Ashoka-Chakra emblem, deep-navy
headings, and bilingual (English / हिन्दी) titles, branded **Government of NCT of
Delhi · Transport Department**. Fonts: Mukta (display) + Noto Sans (body).

## Authentication & roles

Sign-in is at `/login` (role selection — demo personas until JWT lands). The
[`MODULES`](src/types/auth.ts) matrix is the single source of truth: it drives
both the sidebar (only permitted modules appear) and the `RequireModule` route
guard (a disallowed role is redirected to its first allowed screen). Full matrix
in [`ROLE_ACCESS_MATRIX.md`](ROLE_ACCESS_MATRIX.md).

## Routes

| Path | Page | Roles | Shows |
|------|------|-------|-------|
| `/` | **Landing** | public | Govt masthead, hero, feature cards, CTA |
| `/login` | **Sign in** | public | Operator role selection |
| `/dashboard/command` | **Command Dashboard** | all | City SVG map, congestion heatmap, live incident feed, junction matrix |
| `/dashboard/live` | **Live Operations** | all | Junction diagram, approach demand, decision + safety, confidence, audit |
| `/dashboard/emergency` | **Emergency Corridor** | Admin, Dispatcher | EMV banner, token/ETA/priority, trust & safety gate, corridor audit |
| `/dashboard/signal` | **Signal Control** | Admin, Operator | Manual phase override (write-path) + control audit trail |
| `/dashboard/challan` | **Challan Review** | Admin, Inspector | Violation queue → ANPR evidence → approve/reject |
| `/dashboard/ti` | **Corridor Inspector** | Admin, Inspector | BSZ Marg expected-vs-actual green, compliance score |
| `/dashboard/analytics` | **Analytics** | all | Cycle aggregates, mode distribution, green-time by approach |
| `/dashboard/admin` | **Administration** | Admin | Users/roles, zones, edge-node health, system audit |
| `/dashboard/health` | **System Health** | all | Feed connection, perception source, per-layer status |

All dashboard pages share **one** SSE connection via `StreamProvider`
(`context/StreamContext.tsx`), which now carries both the per-junction
`snapshot` and the city-wide `city` event.

## Layout

```
src/
  main.tsx                   BrowserRouter root
  App.tsx                    route table (landing + nested /dashboard)
  config.ts                  gateway URL
  styles.css                 light govt design system
  types/snapshot.ts          mirror of the Layer-3 dashboard contract
  hooks/useSnapshotStream.ts SSE subscription + connection state + history
  context/StreamContext.tsx  shares one stream across all pages
  layout/
    DashboardLayout.tsx      sidebar + content bar + <Outlet/>
    Sidebar.tsx              nav between dashboard pages
  pages/
    LandingPage.tsx          public landing
    LiveOpsPage.tsx          live junction operations
    EmergencyPage.tsx        EMV green-corridor focus
    AnalyticsPage.tsx        aggregates over the history buffer
    SystemHealthPage.tsx     layer/connection status
  components/
    gov/  Emblem · GovHeader · GovFooter   (government chrome)
    JunctionDiagram · ApproachList · EmergencyBanner · DecisionPanel
    ConfidenceGauge · ReasonChain · CycleHistory · StatCard
    ConnectionChip · EmptyState
```

## Next (not built yet)

Real auth (JWT) enforcing the role matrix **server-side** (today the matrix is
enforced client-side only); a database-backed audit/history store (the gateway
keeps an in-memory ring); ANPR plate-event ingest to back the Challan queue with
live data; and a real device registry for edge-node health. Each of these swaps
a mock/in-memory source for a live one with no component changes — see
[`INTEGRATION_WIRING_PLAN.md`](INTEGRATION_WIRING_PLAN.md).
