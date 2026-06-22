# Role Access Matrix — STM Delhi Layer 5

Single source of truth in code: [`src/types/auth.ts`](src/types/auth.ts) (`MODULES`).
The Sidebar and the `RequireModule` route guard both read from it, so a
screen can never be reachable by a role that the matrix forbids.

## Roles

| Role | Icon | Scope |
|------|------|-------|
| **ADMIN** | 🛡️ | Full command access — every module, plus users, zones & edge nodes. |
| **OPERATOR** | 🎛️ | Live monitoring and manual signal phase control. |
| **INSPECTOR** | 🔍 | Corridor compliance (TI) and violation (Challan) review. |
| **DISPATCHER** | 🚑 | Dispatch and track emergency green corridors. |

The **public** Common-User surface (landing portal at `/`) needs no sign-in.

## Module → role matrix

| Module | Route | ADMIN | OPERATOR | INSPECTOR | DISPATCHER | Status |
|--------|-------|:-----:|:--------:|:---------:|:----------:|--------|
| Command Dashboard | `/dashboard/command` | ✅ | ✅ | ✅ | ✅ | planned |
| Live Operations | `/dashboard/live` | ✅ | ✅ | ✅ | ✅ | **built** |
| Emergency Corridor (EMVS) | `/dashboard/emergency` | ✅ | — | — | ✅ | **built** |
| Signal Control | `/dashboard/signal` | ✅ | ✅ | — | — | planned |
| Challan Review | `/dashboard/challan` | ✅ | — | ✅ | — | planned |
| Corridor Inspector (TI) | `/dashboard/ti` | ✅ | — | ✅ | — | planned |
| Analytics | `/dashboard/analytics` | ✅ | ✅ | ✅ | ✅ | **built** |
| Administration | `/dashboard/admin` | ✅ | — | — | — | planned |
| System Health | `/dashboard/health` | ✅ | ✅ | ✅ | ✅ | **built** |

`Status: planned` modules already exist in the matrix (so access is fixed up
front) but are not yet routed; each flips its `built` flag in `MODULES` as the
screen ships.

## How it is enforced

- **Sidebar** renders only modules where `built && role ∈ roles`.
- **Route guard** (`RequireModule`) redirects a disallowed role to its first
  permitted screen (`firstAllowedPath`) rather than showing a forbidden page.
- **Session** is held in `AuthContext` (localStorage key `stm.auth`). Today
  sign-in is role selection with demo personas; this swaps to real JWT auth
  without touching the matrix — see the integration plan.

> Until JWT lands, access control is **client-side only** and meant for the
> demo. Server-side enforcement arrives with the Layer-3 REST/auth endpoints.
