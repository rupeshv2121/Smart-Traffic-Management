# 07 · Cross-Cutting Spine A — Security & Trust

> **Principle:** trust is verified at the point of use. Dispatch authority does not confer junction authority; a
> rendered UI does not confer write authority. Every gate is fail-closed.

---

## 1. Threat model

The system has two attack surfaces that matter, because both terminate in the ability to change a traffic light.

| # | Threat | Impact | Control |
|---|---|---|---|
| **T1** | **Forged corridor token** — an attacker crafts a token to force greens on demand | Arbitrary signal control; gridlock or collision risk | Ed25519 signature over canonical claims; public key only at junctions |
| **T2** | **Replayed token** — a genuine expired token is resubmitted | Unauthorised preemption | Time-bound `issuedAt`/`expiresAt` with bounded clock skew |
| **T3** | **Out-of-scope use** — a token issued for one route is used elsewhere | Preemption at junctions the vehicle will never reach | Route scope: `routeJunctions` must contain this junction id |
| **T4** | **Cancelled run still active** | Cross-traffic held for a vehicle that is not coming | Revocation list keyed on `tokenId`, permanent at that junction |
| **T5** | **Stolen token on a different vehicle** — valid signature, wrong vehicle | Preemption by an impostor | GPS track-consistency: live position, speed and derived ETA must match the signed claims |
| **T6** | **Unauthorised operator write** — override, dispatch or challan resolution without authority | Manual control of the junction; enforcement fraud | Server-side HS256 JWT + role matrix enforced in the gateway |
| **T7** | **Privilege escalation through the client** — a modified frontend renders a forbidden screen | None, if the server is the boundary | Role re-checked server-side on every write; client guard is convenience only |
| **T8** | **Camera spoofing** — a picture of an ambulance shown to a camera | Would be preemption-by-image | `Ambulance` is never emitted from vision; emergencies enter only via the signed-token channel |

T8 is worth stating explicitly: the COCO-to-STM class map in `perception.py` deliberately has no path that produces
an `Ambulance` detection. Vision can corroborate an emergency (ANPR pass-detection), but it can never *authorise*
one.

---

## 2. The corridor token trust model

```
   ┌──────────────────────────── DISPATCH AUTHORITY ────────────────────────────┐
   │  Verifies the vehicle ONCE (out of band).                                   │
   │  Holds the Ed25519 PRIVATE key.                                             │
   │  Issues: signed · time-bound · route-scoped · revocable · priority-classed  │
   └───────────────────────────────────┬────────────────────────────────────────┘
                                       │  EmergencyToken
                                       ▼
   ┌──────────────────── VEHICLE DEVICE (untrusted transport) ───────────────────┐
   │  Carries the token unchanged. Streams live GPS (NOT signed).               │
   └───────────────────────────────────┬────────────────────────────────────────┘
                                       │  POST :8100/emergency/token
                                       ▼
   ┌──────────────────── JUNCTION (EmvVerifier) — THE GATE ─────────────────────┐
   │  Holds only the PUBLIC key. Verifies EVERY token, EVERY cycle.             │
   │  5 independent checks; any failure ⇒ reject ⇒ token treated as absent.     │
   │  FAIL-CLOSED: no trust config ⇒ EMV_TRUST_NOT_CONFIGURED ⇒ reject.         │
   └────────────────────────────────────────────────────────────────────────────┘
```

**Why the GPS track is unsigned.** Signing continuous telemetry would require the private key on the vehicle — the
single worst place for it. Instead the private key stays at dispatch, and the junction checks that the *unsigned,
live* track is **consistent with** the *signed, static* claims. This converts a key-distribution problem into a
physics problem: an impostor would have to be in the right place, moving at the right speed, on the right route.

---

## 3. The five-check verifier

`Layer-3_STM/src/emv/emv-verifier.ts`. All five run; every failure reason is collected, so an operator sees *all*
the ways a token was bad, not just the first.

### Check 1 — Signature

```typescript
verifyClaims(tokenClaims(token), token.signature, cfg.publicKeyPem)
```

Ed25519 over a **canonical claim string** with pinned field order and delimiters — never JSON key ordering, which is
not guaranteed byte-identical across implementations:

```
emv-v1|<emvId>|<priorityClass>|<etaSeconds>|<targetPhaseId>|<routeJunctions joined by ,>|<issuedAt>|<expiresAt>|<tokenId>
```

`verifyClaims()` never throws: a malformed key, signature or base64 string returns `false`. Failure reason:
`SIGNATURE_INVALID`.

### Check 2 — Time-bound

```
now + clockSkewMs < issuedAt   ⇒ TOKEN_NOT_YET_VALID
now - clockSkewMs > expiresAt  ⇒ TOKEN_EXPIRED (Ns past)
```

Default skew tolerance 5 000 ms.

### Check 3 — Route scope

```typescript
token.routeJunctions.includes(cfg.junctionId)
```

Failure: `ROUTE_SCOPE_MISMATCH (junction X not on token route)`. A token valid at ITO cannot preempt AIIMS.

### Check 4 — Revocation

A per-junction `Set<string>` of revoked `tokenId`s. Failure: `TOKEN_REVOKED`. Once revoked, permanent at that
junction — a valid, unexpired, correctly scoped replay still fails.

### Check 5 — GPS track consistency

Five sub-checks, all must pass:

| Sub-check | Condition | Failure reason |
|---|---|---|
| Presence | `gpsTrack` exists | `GPS_MISSING` |
| Freshness | `now - fix.timestamp ≤ gpsMaxAgeMs` (300 s) | `GPS_STALE (Ns old)` |
| Plausible speed | `0 ≤ speedMps ≤ gpsMaxSpeedMps` (40 m/s ≈ 144 km/h) | `GPS_SPEED_IMPLAUSIBLE` |
| Approach zone | `haversine(fix, junction) ≤ gpsMaxDistanceMeters` (3 000 m) | `GPS_OUT_OF_APPROACH_ZONE (Nm > Mm)` |
| ETA feasibility | `distance / max(etaSeconds,1) ≤ gpsMaxSpeedMps` | `ETA_IMPOSSIBLE (needs X m/s ...)` |
| ETA agreement | when `speedMps > 0.5`: `\|distance/speed − etaSeconds\| ≤ max(etaToleranceAbsSeconds, etaSeconds × etaToleranceRatio)` | `ETA_GPS_MISMATCH (gps≈Xs vs claim Ys)` |

The last two are what defeat T5. A thief replaying a stolen token from a stationary car in a car park fails the
approach-zone or ETA-agreement check; a token replayed from far away fails ETA feasibility.

### Verdict

```typescript
interface EmvVerdict {
  valid: boolean;                       // true only when reasons is empty
  reasons: string[];                    // every failure, for the audit trail
  checks: Record<EmvCheck, boolean>;    // per-check breakdown for the dashboard
}
```

The orchestrator records the outcome verbatim in `reasonChain`, so a rejection is fully explainable:

```
EMV token REJECTED: AMB-7781 — SIGNATURE_INVALID; ROUTE_SCOPE_MISMATCH (junction DEL_DL_ITO_01 not on token route). Corridor request ignored.
```

---

## 4. Key management

`Layer-3_STM/src/emv/emv-keys.ts` — resolution order, first hit wins:

| # | Source | Use |
|---|---|---|
| 1 | `EMV_PRIVATE_KEY_PEM` + `EMV_PUBLIC_KEY_PEM` | Production / CI |
| 2 | `.emv-keys.json` at the package root (`npm run emv:keygen`) | Development — lets the signer CLI and the verifier process agree **across processes** |
| 3 | Ephemeral in-memory keypair, with a warning | Single-process tests only; cross-process dispatch will fail |

Keys are Ed25519, exported SPKI (public) and PKCS#8 (private) PEM.

> **Deployment requirement.** A junction MUST hold only the public key. The private key belongs at the dispatch
> authority, ideally HSM-backed. `.emv-keys.json` is a development convenience and is git-ignored; it must never
> reach a field node.

**Pre-provisioning enables offline operation.** Because verification needs only the public key and the token itself,
a junction that has lost its uplink can still verify and honour a corridor token — the offline certificate story
falls straight out of the design.

---

## 5. Operator authentication and authorisation

### 5.1 Tokens

`Layer-3_STM/src/auth/jwt.ts` — dependency-free HS256 over `node:crypto`.

```
header.payload.signature      (all base64url)
claims: { sub, name, role, iat, exp }
```

- `HMAC-SHA256` with `JWT_SECRET`; comparison via `timingSafeEqual` (constant time, length-checked first).
- `exp` enforced on every verification; default TTL 8 h (`JWT_TTL_SECONDS`).
- `claimsFromHeader()` parses `Authorization: Bearer <token>`.

### 5.2 Login paths

| Path | Endpoint | Verification | Disable with |
|---|---|---|---|
| Username + password | `POST /auth/login {username, password}` | scrypt hash comparison against `AuthStore` (persisted) | — |
| Demo role | `POST /auth/login {role}` | none — issues a token for a seeded persona | `ALLOW_DEMO_LOGIN=false` |
| SSO stub | `POST /auth/sso {email}` | maps an email to a role | `ALLOW_SSO_STUB=false` |

> **Production requirement.** Set `JWT_SECRET`, set `ALLOW_DEMO_LOGIN=false`, and replace the SSO stub with a real
> OIDC/SAML validation before any deployment that is not a demonstration. The stub exists so the role model can be
> exercised without an IdP; it is not an authentication mechanism.

### 5.3 The role matrix, enforced server-side

```typescript
private authorize(req, res, roles: Role[]) {
  let claims;
  try { claims = claimsFromHeader(req.headers.authorization); }
  catch (err) { this.json(res, 401, { error: errMsg(err) }); return null; }
  if (!roles.includes(claims.role)) {
    this.json(res, 403, { error: `role ${claims.role} not permitted` });
    return null;
  }
  return claims;
}
```

| Write endpoint | Permitted roles |
|---|---|
| `POST /control/override`, `POST /control/clear` | `ADMIN`, `OPERATOR` |
| `POST /control/dispatch` | `ADMIN`, `DISPATCHER` |
| `POST /challans/:id/issue`, `POST /challans/:id/reject` | `ADMIN`, `INSPECTOR` |

Reads (SSE, health, audit, analytics, challan list, registry, fallback plan, metrics) are open by design so any
dashboard or monitoring system can observe a junction. **The client-side `RequireModule` guard is a convenience,
not the security boundary** — a modified frontend gains nothing.

---

## 6. Defence in depth on the control path

Even a fully authenticated, correctly-roled operator cannot make the junction unsafe:

| Layer of defence | Mechanism |
|---|---|
| **Structural** | An override names exactly one phase. A single green phase cannot conflict by construction. |
| **Temporal** | Duration clamped to [10, 120] s; the override carries `expiresAt`. |
| **Interlock** | The live loop applies the configured clearance minima to every override. |
| **Priority** | An active emergency corridor always wins; the override is deferred, and the deferral is audited. |
| **Audit** | `OVERRIDE_REQUESTED`, `OVERRIDE_APPLIED`, `OVERRIDE_DEFERRED`, `OVERRIDE_CLEARED` — each with actor identity. |

Similarly on the EMV path: the dashboard dispatch endpoint issues a token, but the junction **verifies it again**
from scratch on the next cycle. Being permitted to dispatch does not mean being able to preempt.

---

## 7. Audit trail

Append-only, durable, and never mutated in place.

```typescript
interface AuditEntry {
  id: string; ts: string; actor: string;
  action: "DECISION" | "OVERRIDE_REQUESTED" | "OVERRIDE_APPLIED" | "OVERRIDE_DEFERRED"
        | "OVERRIDE_CLEARED" | "SAFETY_BLOCK" | "EMERGENCY";
  junctionId: string; detail: string;
  outcome: "ok" | "blocked" | "info";
}
```

- One `DECISION` / `EMERGENCY` / `SAFETY_BLOCK` record per cycle, carrying mode, phase, duration and confidence.
- One record per operator action, naming the actor as `"<name> (<sub>)"` from the verified JWT claims — the actor
  is taken from the token, never from the request body.
- Stored in `.data/audit.jsonl` (cap 5 000, self-trimming) or the `audit_log` table.
- Exposed at `GET /audit?limit=n`, newest first; rendered by the `AuditTrail` component.

---

## 8. Transport security posture

| Channel | Current | Required for production |
|---|---|---|
| Layer 2 → Layer 3 | Plain HTTP on localhost | TLS, or co-located on the edge node with a loopback bind |
| EMV intake `:8100` | Plain HTTP, open | mTLS or a signed-request gateway; must not be world-writable |
| Dashboard gateway `:8200` | Plain HTTP, `access-control-allow-origin: *` | TLS termination; restrict CORS to the operator origin |
| MQTT to Layer 4 | Specified, not yet wired | mTLS or username/password per broker policy; actuation topics restricted |
| Perception CORS | `allow_origins=["*"]` | The exact frontend origin(s) |
| Secrets | `JWT_SECRET` has a dev default; `.emv-keys.json` on disk | Secret manager; keys never on a field node beyond the public key |

---

## 9. Security review checklist

Before any non-demonstration deployment:

- [ ] `JWT_SECRET` set to a high-entropy value from a secret manager
- [ ] `ALLOW_DEMO_LOGIN=false`
- [ ] `ALLOW_SSO_STUB=false` and a real IdP wired
- [ ] Default password `stm@1234` rotated for every seeded account
- [ ] `EMV_PUBLIC_KEY_PEM` provisioned per junction; **no private key on any field node**
- [ ] `.emv-keys.json` absent from all deployed images
- [ ] TLS on `:8200`; CORS restricted to the operator origin
- [ ] mTLS on the EMV intake and the MQTT actuation topics
- [ ] GPS tolerances (`EMV_GPS_*`, `EMV_ETA_*`) reviewed against the real fleet's telemetry quality
- [ ] Revocation propagation designed for city scale (a revoked token must die everywhere, not just locally)
- [ ] Audit log shipped to append-only external storage
