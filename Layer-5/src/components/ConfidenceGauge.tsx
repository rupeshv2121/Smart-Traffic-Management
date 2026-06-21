import type { CSSProperties } from "react";

import type { PerceptionSource } from "../types/snapshot";

/** CV-confidence ring. Colour tracks the Layer-3 resilience thresholds. */
export function ConfidenceGauge({
  score,
  source,
}: {
  score: number;
  source: PerceptionSource;
}) {
  const pct = Math.round(score * 100);
  // Mirrors config.ts: CRITICAL 0.7, WARNING 0.8.
  const col =
    score >= 0.8 ? "var(--ok)" : score >= 0.7 ? "var(--warn)" : "var(--danger)";

  return (
    <section className="card">
      <h2 className="card-title">Perception Confidence</h2>
      <div className="gauge">
        <div className="ring" style={{ "--pct": pct, "--col": col } as CSSProperties}>
          <div className="inner">{pct}%</div>
        </div>
        <div>
          <div className={`source-tag ${source === "MOCK_FALLBACK" ? "mock" : ""}`}>
            {source === "LIVE_CV" ? "● Live camera feed" : "▲ Mock fallback (CV down)"}
          </div>
          <div className="source-tag sub">
            {score >= 0.8
              ? "Above warning threshold — normal optimization."
              : score >= 0.7
                ? "Warning band — being watched."
                : "Below critical — historical fallback engaged."}
          </div>
        </div>
      </div>
    </section>
  );
}
