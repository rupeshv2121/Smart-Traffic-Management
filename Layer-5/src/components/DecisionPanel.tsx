import type { CycleSnapshot } from "../types/snapshot";

const PATH_LABEL: Record<string, string> = {
  NORMAL_MODE: "Normal · Max-Pressure",
  EMERGENCY_MODE: "Emergency · Green Corridor",
  FALLBACK_MODE: "Fallback · Historical timing",
};

/** The committed actuation command + safety verdict for this cycle. */
export function DecisionPanel({ decision }: { decision: CycleSnapshot["decision"] }) {
  const { yellowSeconds, allRedSeconds } = decision.clearanceIntervals;
  return (
    <section className="card">
      <h2 className="card-title">Decision → Layer 4 (Actuation)</h2>

      <div className="kv">
        <span className="k">Execution path</span>
        <span className="v">{PATH_LABEL[decision.executionPath] ?? decision.executionPath}</span>
      </div>
      <div className="kv">
        <span className="k">Mode</span>
        <span className={`pill mode-${decision.executionMode}`}>{decision.executionMode}</span>
      </div>
      <div className="kv">
        <span className="k">Target phase</span>
        <span className="v">{decision.targetPhaseId}</span>
      </div>
      <div className="kv">
        <span className="k">Green duration</span>
        <span className="v">{decision.durationSeconds}s</span>
      </div>
      <div className="kv">
        <span className="k">Clearances</span>
        <span className="v">
          Yellow {yellowSeconds}s · All-red {allRedSeconds}s
        </span>
      </div>
      <div className="kv">
        <span className="k">Safety supervisor</span>
        <span className={`pill ${decision.safetyValidationPassed ? "ok" : "fail"}`}>
          {decision.safetyValidationPassed ? "✓ Safe to execute" : "✕ Blocked"}
        </span>
      </div>
    </section>
  );
}
