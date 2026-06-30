// ============================================================
// corridor-conflict.test.ts — EMV conflict-resolution test harness
//
// Exercises CorridorManager.resolveGrants() — the logic that fires when two or
// more emergency vehicles converge on the same junction/corridor. The contract
// (corridor-manager.ts §header) is:
//
//   • Exactly ONE corridor is granted at any instant — never simultaneous
//     competing grants.
//   • Winner is chosen by priority class (CRITICAL>HIGH>NORMAL), then ETA
//     (closer wins), then start time (stable).
//   • Losers are HELD (with a reason), not dropped, and promoted the moment the
//     winner CLEARS (arrives / expires / is revoked).
//
// Standalone runner (no test framework in this repo). Run with:
//   npx ts-node src/emv/corridor-conflict.test.ts
// ============================================================

import { CorridorManager } from "./corridor-manager";
import { JUNCTION_ID } from "../config";
import type {
  EmergencyToken,
  EmvGpsTrack,
  PriorityClass,
} from "../types/types";

// ─── deterministic clock ──────────────────────────────────────────────────────
const clock = { t: 1_700_000_000_000 }; // fixed epoch ms; advanced explicitly
const now = () => clock.t;
const advance = (ms: number) => {
  clock.t += ms;
};

// ─── token factory (CorridorManager only reads token fields, never verifies) ───
const ITO = JUNCTION_ID; // DEL_DL_ITO_01 — the live/origin junction
const IG = "DEL_DL_IG_04";
const AIIMS = "DEL_DL_AIIMS_05";
const MC = "DEL_DL_MC_08";

const STATIC_GPS: EmvGpsTrack = {
  lat: 28.6304,
  lng: 77.2177,
  headingDeg: 0,
  speedMps: 12,
  timestamp: 0,
};

let tokenSeq = 0;
function makeToken(opts: {
  emvId: string;
  priorityClass: PriorityClass;
  etaSeconds: number;
  routeJunctions?: string[];
  ttlMs?: number;
}): EmergencyToken {
  tokenSeq += 1;
  const issuedAt = now();
  return {
    emvId: opts.emvId,
    priorityClass: opts.priorityClass,
    etaSeconds: opts.etaSeconds,
    targetPhaseId: "NORTH",
    routeJunctions: opts.routeJunctions ?? [ITO, AIIMS],
    issuedAt,
    expiresAt: issuedAt + (opts.ttlMs ?? 600_000),
    tokenId: `TKN-TEST-${tokenSeq}`,
    signature: "mock-signature",
    gpsTrack: STATIC_GPS,
  };
}

// ─── tiny assertion harness ─────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    const msg = `${label}${detail ? ` — ${detail}` : ""}`;
    failures.push(msg);
    console.log(`  ✗ ${label}${detail ? `\n      ${detail}` : ""}`);
  }
}

function eq<T>(label: string, actual: T, expected: T): void {
  check(
    label,
    actual === expected,
    actual === expected ? "" : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
}

/** Core invariant: at most one corridor is ever granted. */
function assertSingleGrant(mgr: CorridorManager, label: string): void {
  const snap = mgr.snapshot();
  const grantedCount = snap.all.filter((v) => v.granted).length;
  check(
    `${label}: at most one granted (invariant)`,
    grantedCount <= 1,
    `granted corridors = ${grantedCount}`,
  );
}

function section(title: string): void {
  console.log(`\n── ${title} ──`);
}

// ════════════════════════════════════════════════════════════════════════════
// TEST 1 — single EMV: granted, no conflict
// ════════════════════════════════════════════════════════════════════════════
section("Test 1: single EMV is granted with no conflict");
{
  const mgr = new CorridorManager(ITO, now);
  const r = mgr.register(makeToken({ emvId: "AMB-1", priorityClass: "HIGH", etaSeconds: 60 }));
  const snap = mgr.snapshot();
  eq("granted", r.granted, true);
  eq("no held reason", r.heldReason, null);
  eq("status CORRIDOR_ACTIVE", snap.status, "CORRIDOR_ACTIVE");
  eq("tiState MONITORING", snap.tiState, "MONITORING");
  eq("no conflicts", snap.conflicts.length, 0);
  eq("grantedEmvId", mgr.grantedEmvId(), "AMB-1");
  assertSingleGrant(mgr, "single");
}

// ════════════════════════════════════════════════════════════════════════════
// TEST 2 — priority class wins (CRITICAL beats HIGH regardless of ETA)
// ════════════════════════════════════════════════════════════════════════════
section("Test 2: higher priority class wins even with a worse ETA");
{
  const mgr = new CorridorManager(ITO, now);
  // HIGH arrives first and is closer (ETA 30) — but CRITICAL must still win.
  mgr.register(makeToken({ emvId: "HIGH-1", priorityClass: "HIGH", etaSeconds: 30 }));
  assertSingleGrant(mgr, "after HIGH-1");
  const r = mgr.register(makeToken({ emvId: "CRIT-1", priorityClass: "CRITICAL", etaSeconds: 120 }));
  const snap = mgr.snapshot();
  eq("CRITICAL granted despite worse ETA", r.granted, true);
  eq("grantedEmvId is CRITICAL", mgr.grantedEmvId(), "CRIT-1");
  eq("status CONFLICT", snap.status, "CONFLICT");
  eq("one held", snap.conflicts.length, 1);
  eq("held one is HIGH-1", snap.conflicts[0]?.emvId, "HIGH-1");
  check(
    "held reason names winner",
    !!snap.conflicts[0]?.heldReason?.includes("CRIT-1"),
    snap.conflicts[0]?.heldReason ?? "null",
  );
  assertSingleGrant(mgr, "after CRIT-1 preempts");
}

// ════════════════════════════════════════════════════════════════════════════
// TEST 3 — same class → ETA tie-break (closer wins)
// ════════════════════════════════════════════════════════════════════════════
section("Test 3: same class, closer ETA wins");
{
  const mgr = new CorridorManager(ITO, now);
  mgr.register(makeToken({ emvId: "FAR", priorityClass: "HIGH", etaSeconds: 200 }));
  mgr.register(makeToken({ emvId: "NEAR", priorityClass: "HIGH", etaSeconds: 40 }));
  eq("nearer EMV granted", mgr.grantedEmvId(), "NEAR");
  const snap = mgr.snapshot();
  eq("farther EMV held", snap.conflicts[0]?.emvId, "FAR");
  assertSingleGrant(mgr, "eta tie-break");
}

// ════════════════════════════════════════════════════════════════════════════
// TEST 4 — full tie (same class + same ETA) → stable by registration order
// ════════════════════════════════════════════════════════════════════════════
section("Test 4: identical class+ETA → first registered holds (stable)");
{
  const mgr = new CorridorManager(ITO, now);
  mgr.register(makeToken({ emvId: "FIRST", priorityClass: "NORMAL", etaSeconds: 90 }));
  advance(1); // distinct startedAt, FIRST still earlier
  mgr.register(makeToken({ emvId: "SECOND", priorityClass: "NORMAL", etaSeconds: 90 }));
  eq("first registered wins", mgr.grantedEmvId(), "FIRST");
  assertSingleGrant(mgr, "full tie");
}

// ════════════════════════════════════════════════════════════════════════════
// TEST 5 — three-way convergence: strict ordering, two held
// ════════════════════════════════════════════════════════════════════════════
section("Test 5: three EMVs converge — exactly one granted, ordered correctly");
{
  const mgr = new CorridorManager(ITO, now);
  mgr.register(makeToken({ emvId: "N-1", priorityClass: "NORMAL", etaSeconds: 50 }));
  mgr.register(makeToken({ emvId: "H-1", priorityClass: "HIGH", etaSeconds: 80 }));
  mgr.register(makeToken({ emvId: "C-1", priorityClass: "CRITICAL", etaSeconds: 100 }));
  const snap = mgr.snapshot();
  eq("CRITICAL granted", mgr.grantedEmvId(), "C-1");
  eq("two held", snap.conflicts.length, 2);
  const heldIds = snap.conflicts.map((c) => c.emvId).sort();
  check("held set = {H-1,N-1}", heldIds.join(",") === "H-1,N-1", heldIds.join(","));
  eq("status CONFLICT", snap.status, "CONFLICT");
  assertSingleGrant(mgr, "three-way");
}

// ════════════════════════════════════════════════════════════════════════════
// TEST 6 — winner CLEARS by revoke → held EMV promoted immediately
// ════════════════════════════════════════════════════════════════════════════
section("Test 6: revoking the winner promotes the held EMV");
{
  const mgr = new CorridorManager(ITO, now);
  const winner = makeToken({ emvId: "WIN", priorityClass: "CRITICAL", etaSeconds: 60 });
  mgr.register(winner);
  mgr.register(makeToken({ emvId: "WAIT", priorityClass: "HIGH", etaSeconds: 60 }));
  eq("winner granted before revoke", mgr.grantedEmvId(), "WIN");
  mgr.endRunByTokenId(winner.tokenId);
  eq("held EMV promoted after revoke", mgr.grantedEmvId(), "WAIT");
  const snap = mgr.snapshot();
  eq("no remaining conflicts", snap.conflicts.length, 0);
  eq("status CORRIDOR_ACTIVE", snap.status, "CORRIDOR_ACTIVE");
  assertSingleGrant(mgr, "after revoke");
}

// ════════════════════════════════════════════════════════════════════════════
// TEST 7 — winner CLEARS by expiry → held EMV promoted on tick()
// ════════════════════════════════════════════════════════════════════════════
section("Test 7: winner token expiry promotes the held EMV via tick()");
{
  const mgr = new CorridorManager(ITO, now);
  mgr.register(makeToken({ emvId: "EXP", priorityClass: "CRITICAL", etaSeconds: 60, ttlMs: 10_000 }));
  mgr.register(makeToken({ emvId: "NEXT", priorityClass: "HIGH", etaSeconds: 60, ttlMs: 600_000 }));
  eq("winner granted before expiry", mgr.grantedEmvId(), "EXP");
  advance(11_000); // push past EXP's expiresAt
  mgr.tick();
  eq("expired winner removed, held promoted", mgr.grantedEmvId(), "NEXT");
  assertSingleGrant(mgr, "after expiry");
}

// ════════════════════════════════════════════════════════════════════════════
// TEST 8 — late higher-priority EMV preempts a running lower-priority corridor
// ════════════════════════════════════════════════════════════════════════════
section("Test 8: late CRITICAL preempts an already-active NORMAL corridor");
{
  const mgr = new CorridorManager(ITO, now);
  mgr.register(makeToken({ emvId: "RUNNING", priorityClass: "NORMAL", etaSeconds: 45 }));
  eq("NORMAL active first", mgr.grantedEmvId(), "RUNNING");
  advance(5_000);
  mgr.register(makeToken({ emvId: "LATE-CRIT", priorityClass: "CRITICAL", etaSeconds: 90 }));
  eq("CRITICAL preempts", mgr.grantedEmvId(), "LATE-CRIT");
  const held = mgr.snapshot().conflicts;
  eq("previous winner now held", held[0]?.emvId, "RUNNING");
  assertSingleGrant(mgr, "after preemption");
}

// ════════════════════════════════════════════════════════════════════════════
// TEST 9 — invariant fuzz: many random converging EMVs, never 2 grants
// ════════════════════════════════════════════════════════════════════════════
section("Test 9: randomized convergence fuzz — single-grant invariant holds");
{
  const classes: PriorityClass[] = ["CRITICAL", "HIGH", "NORMAL"];
  let everViolated = false;
  let maxGranted = 0;
  // deterministic LCG so the run is reproducible
  let seed = 12345;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

  const mgr = new CorridorManager(ITO, now);
  for (let i = 0; i < 200; i++) {
    advance(Math.floor(rnd() * 1000));
    const action = rnd();
    if (action < 0.6) {
      mgr.register(
        makeToken({
          emvId: `F-${i}`,
          priorityClass: classes[Math.floor(rnd() * 3)] ?? "NORMAL",
          etaSeconds: 10 + Math.floor(rnd() * 300),
          ttlMs: 5_000 + Math.floor(rnd() * 60_000),
        }),
      );
    } else if (action < 0.8) {
      mgr.tick();
    } else {
      // revoke a random live corridor
      const live = mgr.snapshot().all;
      const victim = live[Math.floor(rnd() * Math.max(1, live.length))];
      if (victim) mgr.endRun(victim.emvId);
    }
    const g = mgr.snapshot().all.filter((v) => v.granted).length;
    maxGranted = Math.max(maxGranted, g);
    if (g > 1) everViolated = true;
  }
  check("invariant never violated across 200 random ops", !everViolated, `maxGranted=${maxGranted}`);
}

// ════════════════════════════════════════════════════════════════════════════
// TEST 10 — winner that ARRIVES (not expires/revokes): does the held one move?
//   This probes the "promoted the moment the winner clears" claim for the
//   ARRIVAL path, which goes through tick()->advanceTo() rather than endRun().
// ════════════════════════════════════════════════════════════════════════════
section("Test 10: winner ARRIVES via tick() — promotion-on-clear behavior");
{
  const mgr = new CorridorManager(ITO, now);
  // Short ETA so a single time jump drives the corridor to ARRIVED; long TTL so
  // it does NOT also expire in the same tick (isolating the arrival path).
  mgr.register(
    makeToken({ emvId: "ARR", priorityClass: "CRITICAL", etaSeconds: 5, ttlMs: 600_000, routeJunctions: [ITO, AIIMS] }),
  );
  mgr.register(
    makeToken({ emvId: "BEHIND", priorityClass: "HIGH", etaSeconds: 60, ttlMs: 600_000, routeJunctions: [ITO, MC] }),
  );
  eq("CRITICAL granted before arrival", mgr.grantedEmvId(), "ARR");
  advance(10_000); // well past ARR's 5s ETA → arrives, but NOT past its TTL
  mgr.tick();
  const arrView = mgr.snapshot().all.find((v) => v.emvId === "ARR");
  eq("ARR reached ARRIVED", arrView?.status, "ARRIVED");
  const grantedAfter = mgr.grantedEmvId();
  // Document whichever behavior the implementation exhibits, and flag the gap.
  if (grantedAfter === "BEHIND") {
    check("BEHIND promoted after winner arrived", true);
  } else {
    check(
      "BEHIND promoted after winner arrived",
      false,
      `still held — grant=${grantedAfter || "(none/arrived ARR)"}. ` +
        `ARRIVAL path does not call resolveGrants(); held EMV waits until winner's ` +
        `token expires or is revoked. See corridor-manager.ts tick()/advanceTo().`,
    );
  }
  assertSingleGrant(mgr, "after arrival");
}

// ════════════════════════════════════════════════════════════════════════════
// TEST 11 — reservedJunctions reflects only the GRANTED corridor
// ════════════════════════════════════════════════════════════════════════════
section("Test 11: reservedJunctions counts only the granted corridor's legs");
{
  const mgr = new CorridorManager(ITO, now);
  mgr.register(makeToken({ emvId: "G", priorityClass: "CRITICAL", etaSeconds: 60, routeJunctions: [ITO, AIIMS] }));
  mgr.register(makeToken({ emvId: "H", priorityClass: "HIGH", etaSeconds: 60, routeJunctions: [ITO, MC] }));
  const snap = mgr.snapshot();
  const grantedView = snap.all.find((v) => v.emvId === "G");
  const reservedLegs = grantedView
    ? grantedView.legs.filter((l) => l.state === "RESERVED").length
    : -1;
  eq("reservedJunctions == granted corridor's RESERVED legs", snap.reservedJunctions, reservedLegs);
  check("reservedJunctions > 0 for a multi-leg route", snap.reservedJunctions > 0, `=${snap.reservedJunctions}`);
  assertSingleGrant(mgr, "reservations");
}

// ─── summary ──────────────────────────────────────────────────────────────────
console.log(`\n${"=".repeat(60)}`);
console.log(`EMV conflict tests: ${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log(`\nFailures:`);
  for (const f of failures) console.log(`  ✗ ${f}`);
}
console.log("=".repeat(60));
process.exit(failed > 0 ? 1 : 0);
