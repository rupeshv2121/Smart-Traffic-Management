// ============================================================
// emv-router.ts — Green-Corridor routing (A* initial + D* Lite re-plan)
//
// Architecture v2.0 §7 / Layer-3 Ideation §2:
//   • A*      — computes the static fastest route from the EMV's origin to the
//               destination facility over the city graph at dispatch time.
//   • D* Lite — incrementally re-plans when an edge is BLOCKED (accident,
//               unclearable bottleneck) or the vehicle DEVIATES, recomputing the
//               optimal path from the vehicle's CURRENT junction without redoing
//               the whole search. The corridor manager then releases the
//               reservations on the abandoned tail.
//
// Both operate on the shared `cityGraph`. Distances are metres; D* Lite's key
// modifier (`km`) accumulates the heuristic shift as the start node advances,
// exactly as in Koenig & Likhachev (2002).
// ============================================================

import { JunctionGraph, cityGraph, edgeKey } from "./junction-graph";

const INF = Number.POSITIVE_INFINITY;

// ─── A* (initial fastest route) ───────────────────────────────────────────────
/**
 * Classic A* over the junction graph. Returns the ordered list of junction ids
 * from `origin` to `goal` inclusive, or null if no route exists (e.g. every path
 * is blocked). The heuristic is straight-line distance, which is admissible.
 */
export function aStarRoute(
  origin: string,
  goal: string,
  blocked: ReadonlySet<string> = new Set(),
  graph: JunctionGraph = cityGraph,
): string[] | null {
  if (!graph.has(origin) || !graph.has(goal)) return null;
  if (origin === goal) return [origin];

  const gScore = new Map<string, number>([[origin, 0]]);
  const cameFrom = new Map<string, string>();
  const open = new Set<string>([origin]);

  while (open.size > 0) {
    // Pick the open node with the lowest f = g + h.
    let current = "";
    let bestF = INF;
    for (const id of open) {
      const f = (gScore.get(id) ?? INF) + graph.heuristic(id, goal);
      if (f < bestF) {
        bestF = f;
        current = id;
      }
    }

    if (current === goal) return reconstruct(cameFrom, current);
    open.delete(current);

    for (const { id: next, cost } of graph.neighbours(current, blocked)) {
      const tentative = (gScore.get(current) ?? INF) + cost;
      if (tentative < (gScore.get(next) ?? INF)) {
        cameFrom.set(next, current);
        gScore.set(next, tentative);
        open.add(next);
      }
    }
  }

  return null; // no path
}

function reconstruct(cameFrom: Map<string, string>, end: string): string[] {
  const path = [end];
  let cur = end;
  while (cameFrom.has(cur)) {
    cur = cameFrom.get(cur) as string;
    path.unshift(cur);
  }
  return path;
}

// ─── D* Lite (incremental re-planning) ────────────────────────────────────────
type Key = [number, number];

function keyLess(a: Key, b: Key): boolean {
  return a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
}

/**
 * D* Lite planner. Search runs from the (fixed) goal back toward the moving
 * start, so when the vehicle advances or an edge is blocked only the affected
 * vertices are repaired. `replan()` is the incremental entry point; `path()`
 * extracts the current optimal route from the current start.
 */
export class DStarLiteRouter {
  private g = new Map<string, number>();
  private rhs = new Map<string, number>();
  private km = 0;
  private start: string;
  private lastStart: string;
  private readonly blocked = new Set<string>();
  // Simple priority list keyed by D* Lite keys (graph is tiny, so O(n) is fine).
  private readonly open = new Map<string, Key>();

  constructor(
    private readonly graph: JunctionGraph,
    start: string,
    private readonly goal: string,
    initialBlocked: Iterable<string> = [],
  ) {
    this.start = start;
    this.lastStart = start;
    for (const e of initialBlocked) this.blocked.add(e);
    for (const id of graph.ids()) {
      this.g.set(id, INF);
      this.rhs.set(id, INF);
    }
    this.rhs.set(goal, 0);
    this.open.set(goal, this.calcKey(goal));
    this.computeShortestPath();
  }

  /** Whether a route currently exists from start to goal. */
  public hasRoute(): boolean {
    return (this.g.get(this.start) ?? INF) < INF;
  }

  /** Advance the vehicle to a new current junction (it has passed `start`). */
  public advanceStart(newStart: string): void {
    if (!this.graph.has(newStart)) return;
    this.km += this.graph.heuristic(this.lastStart, newStart);
    this.lastStart = newStart;
    this.start = newStart;
    this.computeShortestPath();
  }

  /** Block (or unblock) an undirected edge and repair the plan incrementally. */
  public setEdgeBlocked(a: string, b: string, isBlocked: boolean): void {
    const key = edgeKey(a, b);
    if (isBlocked) this.blocked.add(key);
    else this.blocked.delete(key);
    // The cost of edges incident to a/b changed → repair both endpoints.
    this.updateVertex(a);
    this.updateVertex(b);
    this.computeShortestPath();
  }

  /**
   * Current optimal route from start to goal, or null if unreachable. Extracted
   * greedily by following the successor that minimises c(s,s') + g(s').
   */
  public path(): string[] | null {
    if (!this.hasRoute()) return null;
    const route = [this.start];
    let s = this.start;
    const guard = this.graph.ids().length * 4;
    for (let i = 0; i < guard && s !== this.goal; i++) {
      let best = "";
      let bestCost = INF;
      for (const { id: sp, cost } of this.graph.neighbours(s, this.blocked)) {
        const c = cost + (this.g.get(sp) ?? INF);
        if (c < bestCost) {
          bestCost = c;
          best = sp;
        }
      }
      if (!best || bestCost === INF) return null;
      route.push(best);
      s = best;
    }
    return s === this.goal ? route : null;
  }

  // ─── internals ──────────────────────────────────────────────────────────────
  private calcKey(s: string): Key {
    const k = Math.min(this.g.get(s) ?? INF, this.rhs.get(s) ?? INF);
    return [k + this.graph.heuristic(this.start, s) + this.km, k];
  }

  private updateVertex(u: string): void {
    if (u !== this.goal) {
      // rhs(u) = min over successors of c(u,s') + g(s')
      let min = INF;
      for (const { id: sp, cost } of this.graph.neighbours(u, this.blocked)) {
        min = Math.min(min, cost + (this.g.get(sp) ?? INF));
      }
      this.rhs.set(u, min);
    }
    this.open.delete(u);
    if ((this.g.get(u) ?? INF) !== (this.rhs.get(u) ?? INF)) {
      this.open.set(u, this.calcKey(u));
    }
  }

  private popMin(): string | null {
    let best = "";
    let bestKey: Key | null = null;
    for (const [id, key] of this.open) {
      if (bestKey === null || keyLess(key, bestKey)) {
        bestKey = key;
        best = id;
      }
    }
    return bestKey === null ? null : best;
  }

  private computeShortestPath(): void {
    let iterations = 0;
    const limit = this.graph.ids().length * this.graph.ids().length * 8 + 50;
    while (iterations++ < limit) {
      const u = this.popMin();
      if (u === null) break;
      const topKey = this.open.get(u) as Key;
      const startKey = this.calcKey(this.start);
      const startConsistent =
        (this.rhs.get(this.start) ?? INF) === (this.g.get(this.start) ?? INF);
      if (!keyLess(topKey, startKey) && startConsistent) break;

      const kNew = this.calcKey(u);
      if (keyLess(topKey, kNew)) {
        // Key out of date — reinsert with the fresh key.
        this.open.set(u, kNew);
        continue;
      }

      const gU = this.g.get(u) ?? INF;
      const rhsU = this.rhs.get(u) ?? INF;
      if (gU > rhsU) {
        // Locally overconsistent → make consistent and repair predecessors.
        this.g.set(u, rhsU);
        this.open.delete(u);
        for (const { id: pred } of this.graph.neighbours(u, this.blocked)) {
          this.updateVertex(pred);
        }
      } else {
        // Locally underconsistent → raise g and repair u + predecessors.
        this.g.set(u, INF);
        this.updateVertex(u);
        for (const { id: pred } of this.graph.neighbours(u, this.blocked)) {
          this.updateVertex(pred);
        }
      }
    }
  }
}
