// ============================================================
// junctions-controller.ts — real per-junction orchestration for the city map.
//
// Replaces the random-walk CitySimulator: each peer junction is driven through
// the SAME M1–M4 orchestrator as the live junction, on its own perception
// (mock per junction until real cameras exist per node). So the map shows real
// max-pressure decisions, plan types and served phases per junction — actual
// multi-junction control, not a cosmetic animation.
//
// The live junction (ITO) keeps its dedicated pipeline in live.ts (real CV,
// EMV, operator overrides). These are the other nodes on the network.
// ============================================================

import { congestionLevelFromScore } from "../dashboard/congestion";
import type { CityPhase, JunctionSummary } from "../dashboard/city";
import { PEER_JUNCTIONS } from "../dashboard/junctions";
import type { PlanType } from "../dashboard/snapshot";
import type { MockDataGenerator } from "../mock-data/mock_generator";
import type { STMOrchestrator } from "../stm-orchestrator";
import type { HistoricalTimingPlan } from "../types/types";

function phaseFor(approachId: string): CityPhase {
  return approachId === "EAST" || approachId === "WEST" ? "EW" : "NS";
}

function planTypeFor(mode: string, reasonChain: string[]): PlanType {
  if (mode === "GREEN_CORRIDOR") return "EMERGENCY";
  if (mode === "HISTORICAL_FALLBACK" || mode === "SAFE_DEFAULT") return "TOD_FALLBACK";
  return reasonChain.some((r) => /starv/i.test(r)) ? "STARVATION" : "MAX_PRESSURE";
}

export class MultiJunctionController {
  constructor(
    private readonly generator: MockDataGenerator,
    private readonly orchestrator: STMOrchestrator,
    private readonly fallback: HistoricalTimingPlan[],
  ) {}

  /** Run one optimisation cycle for every peer junction. */
  public summaries(): JunctionSummary[] {
    return PEER_JUNCTIONS.map((meta) => {
      const layer2 = this.generator.getLayer2Data();
      const result = this.orchestrator.orchestrateActuation(layer2, null, this.fallback);

      const occ = Math.max(0, ...layer2.approaches.map((a) => a.spatialOccupancyPct));
      const score = occ / 100;
      const vehicles = layer2.approaches.reduce(
        (s, a) => s + a.detections.reduce((t, d) => t + d.count, 0),
        0,
      );
      const mode = result.finalCommand.executionMode;
      return {
        id: meta.id,
        code: meta.code,
        name: meta.name,
        zone: meta.zone,
        lat: meta.lat,
        lng: meta.lng,
        live: false,
        activePhase: phaseFor(result.finalCommand.targetPhaseId),
        planType: planTypeFor(mode, result.reasonChain),
        congestionScore: Number(score.toFixed(3)),
        congestionLevel: congestionLevelFromScore(score),
        vehicleCount: vehicles,
        emergencyActive: mode === "GREEN_CORRIDOR",
      };
    });
  }
}
