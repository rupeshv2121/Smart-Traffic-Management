// ============================================================
// junction-graph.ts — the city road network as a weighted graph
//
// The Green-Corridor router (A* / D* Lite) plans an emergency vehicle's route
// over this graph: nodes are junctions (real Delhi crossings from the dashboard
// registry), edges are the road links between adjacent junctions, and edge cost
// is great-circle distance in metres. Edges can be BLOCKED at runtime (accident,
// gridlock) — that is what triggers D* Lite re-planning.
//
// This is the single source of truth for "what connects to what" in the corridor
// subsystem. It is intentionally small and deterministic so routes are stable
// and testable.
// ============================================================

import { ALL_JUNCTIONS } from "../dashboard/junctions";
import { haversineMeters } from "./geo";

export interface GraphNode {
  id: string;
  lat: number;
  lng: number;
}

/** Undirected adjacency (junction id → neighbour ids). A plausible Delhi road net. */
const ADJACENCY: Record<string, string[]> = {
  DEL_DL_ITO_01: ["DEL_DL_CP_02", "DEL_DL_MH_03", "DEL_DL_IG_04"], // ITO
  DEL_DL_CP_02: ["DEL_DL_ITO_01", "DEL_DL_MH_03", "DEL_DL_PB_09", "DEL_DL_DK_06"], // Connaught Place
  DEL_DL_MH_03: ["DEL_DL_ITO_01", "DEL_DL_CP_02", "DEL_DL_IG_04"], // Mandi House
  DEL_DL_IG_04: ["DEL_DL_ITO_01", "DEL_DL_MH_03", "DEL_DL_AIIMS_05", "DEL_DL_MC_08", "DEL_DL_ASH_07"], // India Gate
  DEL_DL_AIIMS_05: ["DEL_DL_IG_04", "DEL_DL_DK_06", "DEL_DL_MC_08"], // AIIMS
  DEL_DL_DK_06: ["DEL_DL_CP_02", "DEL_DL_AIIMS_05", "DEL_DL_PB_09"], // Dhaula Kuan
  DEL_DL_ASH_07: ["DEL_DL_IG_04", "DEL_DL_MC_08"], // Ashram Chowk
  DEL_DL_MC_08: ["DEL_DL_IG_04", "DEL_DL_AIIMS_05", "DEL_DL_ASH_07"], // Moolchand
  DEL_DL_PB_09: ["DEL_DL_CP_02", "DEL_DL_DK_06"], // Punjabi Bagh
};

/**
 * The static city graph. Nodes carry coordinates (for the A* heuristic and for
 * GPS-based pass-detection); edges are symmetric and weighted by distance.
 */
export class JunctionGraph {
  private readonly nodes = new Map<string, GraphNode>();
  private readonly edges = new Map<string, Map<string, number>>();

  constructor() {
    for (const j of ALL_JUNCTIONS) {
      this.nodes.set(j.id, { id: j.id, lat: j.lat, lng: j.lng });
      this.edges.set(j.id, new Map());
    }
    for (const [from, neighbours] of Object.entries(ADJACENCY)) {
      const a = this.nodes.get(from);
      if (!a) continue;
      for (const to of neighbours) {
        const b = this.nodes.get(to);
        if (!b) continue;
        const cost = haversineMeters(a.lat, a.lng, b.lat, b.lng);
        this.edges.get(from)?.set(to, cost);
        this.edges.get(to)?.set(from, cost);
      }
    }
  }

  public has(id: string): boolean {
    return this.nodes.has(id);
  }

  public node(id: string): GraphNode | undefined {
    return this.nodes.get(id);
  }

  public ids(): string[] {
    return [...this.nodes.keys()];
  }

  /** Neighbours of `id` with their edge cost, skipping any blocked edges. */
  public neighbours(
    id: string,
    blocked: ReadonlySet<string> = new Set(),
  ): Array<{ id: string; cost: number }> {
    const out: Array<{ id: string; cost: number }> = [];
    const adj = this.edges.get(id);
    if (!adj) return out;
    for (const [to, cost] of adj) {
      if (blocked.has(edgeKey(id, to))) continue;
      out.push({ id: to, cost });
    }
    return out;
  }

  /** Straight-line distance heuristic (admissible — never overestimates road cost). */
  public heuristic(a: string, b: string): number {
    const na = this.nodes.get(a);
    const nb = this.nodes.get(b);
    if (!na || !nb) return 0;
    return haversineMeters(na.lat, na.lng, nb.lat, nb.lng);
  }

  public distanceBetween(a: string, b: string): number {
    return this.heuristic(a, b);
  }
}

/** Canonical, order-independent key for an undirected edge. */
export function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** The shared city graph instance used by the corridor subsystem. */
export const cityGraph = new JunctionGraph();
