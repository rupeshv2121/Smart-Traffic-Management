# 🚦 Layer 5 — Junction Operations Dashboard

The **Data / Logging / Analytics** layer's live read-out. A React + Vite + TypeScript
dashboard that shows, in real time, what Layer 3 is deciding at a junction:
signal phase, per-approach demand, CV confidence, the active EMV green corridor,
the safety verdict, and the orchestrator's decision audit trail.

```
Layer-3 live loop ──(CycleSnapshot, every 30s)──► SSE gateway :8200/events ──► this dashboard
```

The dashboard is **read-only**. It observes the control path; it never commands
the junction.

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

## Routes

| Path | Page | Shows |
|------|------|-------|
| `/` | **Landing** | Govt masthead, hero, feature cards, "Enter Control Center" CTA |
| `/dashboard/live` | **Live Operations** | Stat tiles, junction diagram, approach demand, decision + safety, confidence, audit trail, recent cycles |
| `/dashboard/emergency` | **Emergency Corridor** | Active EMV banner, token/ETA/priority, trust & safety gate, corridor audit (or an all-clear state) |
| `/dashboard/analytics` | **Analytics** | Cycle aggregates, execution-mode distribution, green-time by approach, history chart |
| `/dashboard/health` | **System Health** | Feed connection, perception source, per-layer status |

All dashboard pages share **one** SSE connection via `StreamProvider`
(`context/StreamContext.tsx`).

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

Multi-junction / city map view, a persisted (not just in-memory) history store
behind the analytics page, and operator controls — which would need a command
path back through the Safety Supervisor (not just the read-only SSE feed).
