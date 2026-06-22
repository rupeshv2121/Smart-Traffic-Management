// ============================================================
// corridor-manager.ts — Green-Corridor coordination (Layer 3, System 2 EMVS/TI)
//
// Sits above the per-junction EmvVerifier/orchestrator and owns the MULTI-junction
// corridor lifecycle the architecture (v2.0 §7) describes:
//
//   • Routing       — each corridor carries an A*/D* Lite route over the city
//                     graph (computed at dispatch; re-planned on blockage/deviation).
//   • Reservations  — the just-in-time green windows reserved on the route ahead,
//                     released the instant the vehicle PASSES a junction
//                     (pass-detection) or the leg is ABANDONED after a re-plan.
//   • Sequencing    — when two EMVs converge, they are sequenced by priority class
//                     then ETA (tie-break). The loser is HELD, not dropped, and is
//                     promoted the moment the winner clears — never a simultaneous
//                     competing grant.
//
// It produces a CorridorSnapshot consumed by the Layer-5 EMVS + TI screens
// (IDLE / CORRIDOR_ACTIVE / CONFLICT / ARRIVED, and TI STANDBY/MONITORING/
// DEVIATION/COMPLETED).
// ============================================================

import { ALL_JUNCTIONS } from "../dashboard/junctions";
import { cityGraph, edgeKey } from "./junction-graph";
import { aStarRoute, DStarLiteRouter } from "./emv-router";
import { haversineMeters } from "./geo";
import {
  PRIORITY_CLASS_MULTIPLIER,
  type EmergencyToken,
  type EmvGpsTrack,
  type PriorityClass,
} from "../types/types";

export type CorridorStatus = "IDLE" | "CORRIDOR_ACTIVE" | "CONFLICT" | "ARRIVED";
export type LegState = "RESERVED" | "CLEARED" | "PENDING" | "ABANDONED";
export type TiState = "STANDBY" | "MONITORING" | "DEVIATION" | "COMPLETED";

const CODE_BY_ID = new Map(ALL_JUNCTIONS.map((j) => [j.id, j.code]));
/** A vehicle within this radius (m) of a route node is treated as AT that node. */
const PASS_RADIUS_M = 180;

export interface CorridorLeg {
  junctionId: string;
  code: string;
  index: number;
  state: LegState;
}

export interface CorridorView {
  emvId: string;
  tokenId: string;
  priorityClass: PriorityClass;
  etaSeconds: number;
  targetPhaseId: string;
  /** Ordered junction codes along the planned route. */
  route: string[];
  legs: CorridorLeg[];
  currentIndex: number;
  granted: boolean; // currently holds the corridor (vs held in conflict)
  heldReason: string | null;
  replans: number; // D* Lite re-plans so far (>0 ⇒ DEVIATION)
  status: CorridorStatus;
  /** 0–1: cleared legs / total legs — the TI compliance score. */
  compliance: number;
}

export interface CorridorSnapshot {
  status: CorridorStatus;
  tiState: TiState;
  active: CorridorView | null; // the granted corridor, if any
  conflicts: CorridorView[]; // held corridors waiting their turn
  all: CorridorView[];
  /** Collateral metric: junctions currently held green for a corridor. */
  reservedJunctions: number;
}

interface Corridor {
  token: EmergencyToken;
  router: DStarLiteRouter | null;
  route: string[]; // junction ids; route[0] = origin, last = destination
  reserved: Set<string>;
  cleared: Set<string>;
  currentIndex: number;
  replans: number;
  granted: boolean;
  heldReason: string | null;
  arrived: boolean;
  startedAt: number;
}

export class CorridorManager {
  private readonly corridors = new Map<string, Corridor>(); // keyed by emvId
  private readonly blockedEdges = new Set<string>(); // "a|b"
  private readonly originJunction: string;

  constructor(
    private readonly junctionId: string,
    private readonly now: () => number = () => Date.now(),
  ) {
    this.originJunction = junctionId;
  }

  /**
   * Register or refresh a corridor for an EMV token, computing its route (A*) and
   * reserving the route ahead, then re-resolve grants. Returns the resolution so
   * the dispatcher knows whether this request is ACTIVE or HELD (CONFLICT).
   */
  public register(token: EmergencyToken): {
    granted: boolean;
    heldReason: string | null;
    grantedEmvId: string;
  } {
    const route = this.resolveRoute(token);
    const existing = this.corridors.get(token.emvId);

    if (existing) {
      existing.token = token;
    } else {
      const start = route[0] ?? this.originJunction;
      const goal = route[route.length - 1] ?? start;
      const router =
        route.length > 1
          ? new DStarLiteRouter(cityGraph, start, goal, this.blockedEdges)
          : null;
      this.corridors.set(token.emvId, {
        token,
        router,
        route,
        reserved: new Set(route.slice(1)), // everything ahead of origin
        cleared: new Set(),
        currentIndex: 0,
        replans: 0,
        granted: false,
        heldReason: null,
        arrived: false,
        startedAt: this.now(),
      });
    }

    const grant = this.resolveGrants();
    const mine = this.corridors.get(token.emvId);
    return {
      granted: mine?.granted ?? false,
      heldReason: mine?.heldReason ?? null,
      grantedEmvId: grant?.token.emvId ?? "",
    };
  }

  /** Compute the route junction list for a token: A* origin→dest, or the token's
   *  declared routeJunctions, or single-junction preemption as a last resort. */
  private resolveRoute(token: EmergencyToken): string[] {
    const declared = token.routeJunctions ?? [];
    // If the token names ≥2 graph junctions, honour them as the corridor spine
    // but A*-fill the path between the first and last so it is graph-valid.
    const known = declared.filter((j) => cityGraph.has(j));
    const first = known[0];
    const last = known[known.length - 1];
    if (first && last && known.length >= 2) {
      const astar = aStarRoute(first, last, this.blockedEdges);
      if (astar) return astar;
      return known;
    }
    // Otherwise route from this junction to the single declared destination.
    const dest = first && first !== this.originJunction ? first : null;
    if (dest) {
      const astar = aStarRoute(this.originJunction, dest, this.blockedEdges);
      if (astar) return astar;
    }
    return [this.originJunction];
  }

  /**
   * Conflict resolution: choose the single granted corridor by priority class,
   * tie-broken by ETA (closer wins). All others are HELD with a reason. Returns
   * the winning corridor (or null when none active).
   */
  private resolveGrants(): Corridor | null {
    const live = [...this.corridors.values()].filter((c) => !c.arrived);
    if (live.length === 0) return null;

    live.sort((a, b) => {
      const pa = PRIORITY_CLASS_MULTIPLIER[a.token.priorityClass];
      const pb = PRIORITY_CLASS_MULTIPLIER[b.token.priorityClass];
      if (pb !== pa) return pb - pa; // higher priority first
      if (a.token.etaSeconds !== b.token.etaSeconds)
        return a.token.etaSeconds - b.token.etaSeconds; // ETA tie-break: closer first
      return a.startedAt - b.startedAt; // stable
    });

    const winner = live[0];
    if (!winner) return null;
    for (const c of live) {
      if (c === winner) {
        c.granted = true;
        c.heldReason = null;
      } else {
        c.granted = false;
        c.heldReason =
          `held behind ${winner.token.emvId} ` +
          `(${winner.token.priorityClass}, ETA ${winner.token.etaSeconds}s)`;
      }
    }
    return winner;
  }

  /**
   * Pass-detection from live GPS: if the vehicle is now AT/PAST the next route
   * node, mark the passed junction CLEARED, release its reservation, advance the
   * D* Lite start, and detect ARRIVED at the destination.
   */
  public updateGps(emvId: string, gps: EmvGpsTrack): void {
    const c = this.corridors.get(emvId);
    if (!c || c.arrived) return;

    // Find the furthest route node the vehicle is already within PASS_RADIUS of.
    let reachedIndex = c.currentIndex;
    for (let i = c.currentIndex; i < c.route.length; i++) {
      const jid = c.route[i];
      const node = jid ? cityGraph.node(jid) : undefined;
      if (!node) continue;
      const d = haversineMeters(gps.lat, gps.lng, node.lat, node.lng);
      if (d <= PASS_RADIUS_M) reachedIndex = i;
    }
    if (reachedIndex > c.currentIndex) {
      this.advanceTo(c, reachedIndex);
    }
  }

  /**
   * ETA-based progress fallback for the prototype (the mock EMV GPS is static):
   * advances the corridor proportionally to elapsed time vs ETA so the full
   * IDLE→ACTIVE→ARRIVED lifecycle is observable end to end. Real deployments rely
   * on updateGps()/ANPR pass-detection above; both funnel through advanceTo().
   */
  public tick(): void {
    const granted = [...this.corridors.values()].find((c) => c.granted && !c.arrived);
    if (granted && granted.route.length > 1) {
      const elapsed = (this.now() - granted.startedAt) / 1000;
      const frac = Math.min(1, elapsed / Math.max(granted.token.etaSeconds, 1));
      const target = Math.floor(frac * (granted.route.length - 1));
      if (target > granted.currentIndex) this.advanceTo(granted, target);
    }
    // Expire finished corridors (keep ARRIVED ones until their token expires so
    // the EMVS screen can show the run summary), then re-resolve so a held EMV is
    // promoted the moment the winner clears.
    let changed = false;
    for (const [id, c] of this.corridors) {
      if (this.now() > c.token.expiresAt) {
        this.corridors.delete(id);
        changed = true;
      }
    }
    if (changed) this.resolveGrants();
  }

  private advanceTo(c: Corridor, index: number): void {
    const clamped = Math.min(index, c.route.length - 1);
    for (let i = c.currentIndex + 1; i <= clamped; i++) {
      const passed = c.route[i - 1];
      const next = c.route[i];
      if (passed) {
        c.cleared.add(passed);
        c.reserved.delete(passed);
      }
      if (next) c.router?.advanceStart(next);
    }
    c.currentIndex = clamped;
    if (clamped >= c.route.length - 1) {
      const dest = c.route[c.route.length - 1];
      if (dest) c.cleared.add(dest);
      c.reserved.clear();
      c.arrived = true;
    }
  }

  /**
   * Chaos / deviation input: block an edge of the network. Every active corridor
   * whose plan used that edge re-plans with D* Lite from its current junction;
   * the abandoned tail's reservations are released so cross-traffic isn't held
   * for a vehicle that is no longer coming.
   */
  public blockEdge(a: string, b: string): void {
    this.blockedEdges.add(edgeKey(a, b));
    for (const c of this.corridors.values()) {
      if (!c.router || c.arrived) continue;
      const tailBefore = c.route.slice(c.currentIndex);
      c.router.setEdgeBlocked(a, b, true);
      const replanned = c.router.path();
      if (replanned && replanned.join(">") !== tailBefore.join(">")) {
        // Release reservations on the abandoned legs, keep cleared history.
        for (const j of tailBefore.slice(1)) c.reserved.delete(j);
        const head = c.route.slice(0, c.currentIndex);
        c.route = [...head, ...replanned];
        for (const j of replanned.slice(1)) {
          if (!c.cleared.has(j)) c.reserved.add(j);
        }
        c.replans += 1;
      }
    }
  }

  /** End a run (revoke/abort): release everything and re-resolve grants. */
  public endRun(emvId: string): void {
    this.corridors.delete(emvId);
    this.resolveGrants();
  }

  /** End a run by token id (the revoke endpoint only knows the tokenId). */
  public endRunByTokenId(tokenId: string): void {
    for (const [id, c] of this.corridors) {
      if (c.token.tokenId === tokenId) {
        this.corridors.delete(id);
        this.resolveGrants();
        return;
      }
    }
  }

  /** The emvId that currently holds the corridor grant, or "" if none. */
  public grantedEmvId(): string {
    const g = [...this.corridors.values()].find((c) => c.granted && !c.arrived);
    return g?.token.emvId ?? "";
  }

  /** The full token that currently holds the corridor grant, or null if none. */
  public grantedToken(): EmergencyToken | null {
    const g = [...this.corridors.values()].find((c) => c.granted && !c.arrived);
    return g?.token ?? null;
  }

  public snapshot(): CorridorSnapshot {
    const views = [...this.corridors.values()].map((c) => this.view(c));
    const active = views.find((v) => v.granted) ?? null;
    const conflicts = views.filter((v) => !v.granted);
    const reservedJunctions = [...this.corridors.values()].reduce(
      (s, c) => s + (c.granted ? c.reserved.size : 0),
      0,
    );

    let status: CorridorStatus = "IDLE";
    let tiState: TiState = "STANDBY";
    if (active) {
      status = conflicts.length > 0 ? "CONFLICT" : "CORRIDOR_ACTIVE";
      tiState = active.replans > 0 ? "DEVIATION" : "MONITORING";
    } else if (views.some((v) => v.status === "ARRIVED")) {
      status = "ARRIVED";
      tiState = "COMPLETED";
    }

    return { status, tiState, active, conflicts, all: views, reservedJunctions };
  }

  private view(c: Corridor): CorridorView {
    const legs: CorridorLeg[] = c.route.map((jid, i) => ({
      junctionId: jid,
      code: CODE_BY_ID.get(jid) ?? jid,
      index: i,
      state: c.cleared.has(jid)
        ? "CLEARED"
        : i <= c.currentIndex
          ? "PENDING"
          : c.reserved.has(jid)
            ? "RESERVED"
            : "PENDING",
    }));
    const total = Math.max(1, c.route.length);
    const compliance = c.cleared.size / total;
    const status: CorridorStatus = c.arrived
      ? "ARRIVED"
      : c.granted
        ? "CORRIDOR_ACTIVE"
        : "CONFLICT";

    return {
      emvId: c.token.emvId,
      tokenId: c.token.tokenId,
      priorityClass: c.token.priorityClass,
      etaSeconds: c.token.etaSeconds,
      targetPhaseId: c.token.targetPhaseId,
      route: c.route.map((j) => CODE_BY_ID.get(j) ?? j),
      legs,
      currentIndex: c.currentIndex,
      granted: c.granted,
      heldReason: c.heldReason,
      replans: c.replans,
      status,
      compliance: Number(compliance.toFixed(3)),
    };
  }
}
