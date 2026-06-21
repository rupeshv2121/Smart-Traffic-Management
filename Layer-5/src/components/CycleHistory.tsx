import type { CycleSnapshot } from "../types/snapshot";

/** A strip of recent cycles: bar height = green duration, colour = mode. */
export function CycleHistory({ history }: { history: CycleSnapshot[] }) {
  const maxDur = Math.max(30, ...history.map((h) => h.decision.durationSeconds));

  function tone(h: CycleSnapshot): string {
    if (!h.decision.safetyValidationPassed) return "unsafe";
    if (h.decision.executionPath === "EMERGENCY_MODE") return "emergency";
    if (h.decision.executionPath === "FALLBACK_MODE") return "fallback";
    return "";
  }

  return (
    <section className="card">
      <h2 className="card-title">Recent Cycles · Green Duration ({history.length})</h2>
      <div className="history">
        {history.map((h) => (
          <div
            key={h.cycle}
            className={`tick ${tone(h)}`}
            style={{ height: `${(h.decision.durationSeconds / maxDur) * 100}%` }}
            title={`#${h.cycle} · ${h.decision.targetPhaseId} ${h.decision.durationSeconds}s · ${h.decision.executionMode}`}
          />
        ))}
      </div>
      <div className="legend">
        <span><i style={{ background: "#bcd4f5" }} /> Normal</span>
        <span><i style={{ background: "#f3c98b" }} /> Fallback</span>
        <span><i style={{ background: "#ef9a9a" }} /> Emergency</span>
        <span><i style={{ background: "var(--danger)" }} /> Unsafe</span>
      </div>
    </section>
  );
}
