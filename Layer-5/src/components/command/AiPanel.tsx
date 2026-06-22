import { useMemo } from "react";

import type { CitySnapshot, CycleSnapshot } from "../../types/snapshot";

type RecType = "ACTION" | "ADVISORY" | "FORECAST" | "OPTIMAL";
interface Rec {
  type: RecType;
  text: string;
  confidence: number;
}

/**
 * Heuristic advisory generator. NOT a trained model — it derives typed,
 * confidence-tagged recommendations from the live snapshot + city state, in the
 * project's "AI is always typed + carries a confidence %" house style.
 */
function deriveRecs(latest: CycleSnapshot, city: CitySnapshot | null, history: CycleSnapshot[]): Rec[] {
  const recs: Rec[] = [];

  if (!latest.decision.safetyValidationPassed) {
    recs.push({ type: "ACTION", text: `Safety interlock failed at ${latest.code} — hold and review before next command.`, confidence: 96 });
  }

  if (latest.emergency) {
    recs.push({ type: "OPTIMAL", text: `Green corridor optimal for ${latest.emergency.emvId} on ${latest.emergency.targetPhaseId}; clearance enforced.`, confidence: 91 });
  }

  const busiest = [...latest.perception.approaches].sort((a, b) => b.spatialOccupancyPct - a.spatialOccupancyPct)[0];
  if (busiest && !busiest.isGreen && (busiest.congestionLevel === "HEAVY" || busiest.congestionLevel === "GRIDLOCK")) {
    recs.push({
      type: "ACTION",
      text: `Pressure building on ${busiest.approachId} (${busiest.spatialOccupancyPct}%); prioritise it in the next phase.`,
      confidence: Math.min(95, Math.round(busiest.spatialOccupancyPct)),
    });
  }

  // Trend over the last few cycles.
  if (history.length >= 4) {
    const recent = history.slice(-4);
    const delta = latest.congestionScore - recent[0]!.congestionScore;
    if (delta > 0.12) {
      recs.push({ type: "FORECAST", text: `Congestion at ${latest.code} rising (+${Math.round(delta * 100)}%); expect peak within ~2 cycles.`, confidence: 78 });
    }
  }

  if (latest.decision.optimizationMetrics.starvationGuardActive) {
    recs.push({ type: "ADVISORY", text: "Starvation guard engaged — equity rebalancing across approaches.", confidence: 74 });
  }

  if (city) {
    const gridlocked = city.junctions.filter((j) => j.congestionLevel === "GRIDLOCK").length;
    if (gridlocked > 0) {
      recs.push({ type: "ADVISORY", text: `${gridlocked} junction(s) approaching gridlock network-wide — consider corridor coordination.`, confidence: 80 });
    }
  }

  if (recs.length === 0) {
    recs.push({ type: "OPTIMAL", text: "Network nominal — max-pressure plan optimal across all approaches.", confidence: 88 });
  }

  return recs.slice(0, 4);
}

export function AiPanel({
  latest,
  city,
  history,
}: {
  latest: CycleSnapshot | null;
  city: CitySnapshot | null;
  history: CycleSnapshot[];
}) {
  const recs = useMemo(() => (latest ? deriveRecs(latest, city, history) : []), [latest, city, history]);

  return (
    <section className="card">
      <h2 className="card-title">AI Advisory · heuristic</h2>
      <div className="ai-panel">
        {recs.map((r, i) => (
          <div className="ai-rec" key={i}>
            <div className="ai-rec-head">
              <span className={`ai-type ${r.type}`}>{r.type}</span>
              <span className="ai-conf">{r.confidence}% confidence</span>
            </div>
            <div className="ai-rec-body">{r.text}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
