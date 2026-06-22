// ============================================================
// city.ts — the Command Dashboard (city map) data contract
//
// A CitySnapshot summarises EVERY junction on the map for one cycle: the live
// junction (real, from the orchestrator) plus display-only peers (simulated by
// CitySimulator). It also carries a derived incident feed. Like CycleSnapshot
// this is a read-only projection — peers never feed back into control.
//
// SOURCE OF TRUTH: this file, mirrored in Layer-5/src/types/snapshot.ts.
// ============================================================

import { congestionLevelFromScore, type CongestionLevel } from "./congestion";
import type { PlanType } from "./snapshot";

export type CityPhase = "NS" | "EW";

/** Compact per-junction state for the map and the junction matrix. */
export interface JunctionSummary {
  id: string;
  code: string;
  name: string;
  zone: string;
  lat: number;
  lng: number;
  live: boolean;
  activePhase: CityPhase;
  planType: PlanType;
  /** 0–1, normalised. */
  congestionScore: number;
  congestionLevel: CongestionLevel;
  vehicleCount: number;
  emergencyActive: boolean;
}

export type IncidentKind = "GRIDLOCK" | "EMERGENCY" | "SAFETY" | "DEGRADED";

export interface CityIncident {
  id: string;
  junctionId: string;
  junctionCode: string;
  kind: IncidentKind;
  severity: "critical" | "warning" | "info";
  message: string;
  ts: string;
}

export interface CitySnapshot {
  generatedAt: string;
  totalJunctions: number;
  nodesOnline: number;
  activeCorridors: number;
  /** Sum of vehicleCount across the city. */
  totalVehicles: number;
  junctions: JunctionSummary[];
  incidents: CityIncident[];
}

function phaseFromApproach(approachId: string): CityPhase {
  return approachId === "EAST" || approachId === "WEST" ? "EW" : "NS";
}

/** Project the live junction's CycleSnapshot down to a JunctionSummary. */
export function liveJunctionSummary(snap: {
  junctionId: string;
  code: string;
  name: string;
  zone: string;
  lat: number;
  lng: number;
  congestionScore: number;
  emergency: unknown | null;
  decision: { targetPhaseId: string; planType: PlanType };
  perception: { approaches: { totalVehicles: number }[] };
}): JunctionSummary {
  return {
    id: snap.junctionId,
    code: snap.code,
    name: snap.name,
    zone: snap.zone,
    lat: snap.lat,
    lng: snap.lng,
    live: true,
    activePhase: phaseFromApproach(snap.decision.targetPhaseId),
    planType: snap.decision.planType,
    congestionScore: Number(snap.congestionScore.toFixed(3)),
    congestionLevel: congestionLevelFromScore(snap.congestionScore),
    vehicleCount: snap.perception.approaches.reduce((s, a) => s + a.totalVehicles, 0),
    emergencyActive: snap.emergency !== null,
  };
}

/** Derive the incident feed from current junction states + live decision flags. */
function deriveIncidents(
  junctions: JunctionSummary[],
  live: { safetyValidationPassed: boolean; source: string },
  ts: string,
): CityIncident[] {
  const incidents: CityIncident[] = [];
  for (const j of junctions) {
    if (j.emergencyActive) {
      incidents.push({
        id: `inc-emv-${j.code}`,
        junctionId: j.id,
        junctionCode: j.code,
        kind: "EMERGENCY",
        severity: "critical",
        message: `Emergency green corridor active at ${j.name}`,
        ts,
      });
    }
    if (j.congestionLevel === "GRIDLOCK") {
      incidents.push({
        id: `inc-grid-${j.code}`,
        junctionId: j.id,
        junctionCode: j.code,
        kind: "GRIDLOCK",
        severity: "warning",
        message: `Gridlock conditions at ${j.name} (${Math.round(j.congestionScore * 100)}% occupancy)`,
        ts,
      });
    }
  }
  if (!live.safetyValidationPassed) {
    incidents.push({
      id: "inc-safety-live",
      junctionId: junctions.find((j) => j.live)?.id ?? "",
      junctionCode: junctions.find((j) => j.live)?.code ?? "",
      kind: "SAFETY",
      severity: "critical",
      message: "Safety validation failed on the live junction — command blocked",
      ts,
    });
  }
  if (live.source === "MOCK_FALLBACK") {
    incidents.push({
      id: "inc-degraded-live",
      junctionId: junctions.find((j) => j.live)?.id ?? "",
      junctionCode: junctions.find((j) => j.live)?.code ?? "",
      kind: "DEGRADED",
      severity: "info",
      message: "Live junction running on mock fallback (perception degraded)",
      ts,
    });
  }
  // Most severe first.
  const rank = { critical: 0, warning: 1, info: 2 } as const;
  return incidents.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

export function buildCitySnapshot(args: {
  liveSummary: JunctionSummary;
  peers: JunctionSummary[];
  safetyValidationPassed: boolean;
  source: string;
}): CitySnapshot {
  const ts = new Date().toISOString();
  const junctions = [args.liveSummary, ...args.peers];
  const incidents = deriveIncidents(
    junctions,
    { safetyValidationPassed: args.safetyValidationPassed, source: args.source },
    ts,
  );
  return {
    generatedAt: ts,
    totalJunctions: junctions.length,
    // All peers are "online"; the live one is online while we have a cycle.
    nodesOnline: junctions.length,
    activeCorridors: junctions.filter((j) => j.emergencyActive).length,
    totalVehicles: junctions.reduce((s, j) => s + j.vehicleCount, 0),
    junctions,
    incidents,
  };
}
