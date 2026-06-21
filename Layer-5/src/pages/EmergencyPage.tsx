import { EmergencyBanner } from "../components/EmergencyBanner";
import { EmptyState } from "../components/EmptyState";
import { JunctionDiagram } from "../components/JunctionDiagram";
import { StatCard } from "../components/StatCard";
import { useStream } from "../context/StreamContext";

export function EmergencyPage() {
  const { latest, history, connection } = useStream();

  if (!latest) return <EmptyState connection={connection} />;

  const { emergency, decision, perception } = latest;
  const corridorCycles = history.filter(
    (h) => h.decision.executionPath === "EMERGENCY_MODE",
  ).length;

  if (!emergency) {
    return (
      <>
        <div className="cols cols-3 mb-20">
          <StatCard label="Active corridors" value="0" foot="No emergency in progress" accent="green" />
          <StatCard label="Corridor cycles (recent)" value={corridorCycles} foot="In current history window" accent="blue" />
          <StatCard label="Current mode" value={decision.executionMode} foot={`Phase ${decision.targetPhaseId}`} accent="saffron" />
        </div>
        <div className="empty">
          <div className="big">🟢 No active emergency corridor</div>
          <p className="muted">
            The junction is operating normally. When a signed, GPS-verified
            ambulance token is accepted, a green corridor opens here automatically.
          </p>
          <p className="muted" style={{ marginTop: 8 }}>
            Dispatch a test corridor from the Layer-3 folder:&nbsp;
            <code>npm run emv:dispatch -- EAST 35 CRITICAL</code>
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="mb-20">
        <EmergencyBanner emv={emergency} />
      </div>

      <div className="cols cols-4 mb-20">
        <StatCard label="Vehicle ID" value={emergency.emvId} accent="danger" />
        <StatCard
          label="Priority class"
          value={emergency.priorityClass}
          accent="danger"
        />
        <StatCard
          label="ETA to junction"
          value={`${emergency.etaSeconds}s`}
          accent="saffron"
        />
        <StatCard
          label="Corridor phase"
          value={emergency.targetPhaseId}
          foot={`${decision.durationSeconds}s green held`}
          accent="green"
        />
      </div>

      <div className="cols cols-2 mb-20">
        <section className="card">
          <h2 className="card-title">Corridor Phase</h2>
          <JunctionDiagram junctionId={latest.junctionId} approaches={perception.approaches} />
        </section>

        <section className="card">
          <h2 className="card-title">Trust &amp; Safety Gate</h2>
          <div className="kv">
            <span className="k">Token accepted</span>
            <span className="pill ok">✓ Verified</span>
          </div>
          <div className="kv">
            <span className="k">Corridor mode</span>
            <span className="pill mode-GREEN_CORRIDOR">{decision.executionMode}</span>
          </div>
          <div className="kv">
            <span className="k">Safety supervisor</span>
            <span className={`pill ${decision.safetyValidationPassed ? "ok" : "fail"}`}>
              {decision.safetyValidationPassed ? "✓ Safe sequencing" : "✕ Blocked"}
            </span>
          </div>
          <div className="kv">
            <span className="k">Clearances</span>
            <span className="v">
              Yellow {decision.clearanceIntervals.yellowSeconds}s · All-red{" "}
              {decision.clearanceIntervals.allRedSeconds}s
            </span>
          </div>
          <p className="muted" style={{ marginTop: 14, fontSize: 14 }}>
            Priority is granted only after the junction verifies the Ed25519 token
            signature and confirms the live GPS track matches the claimed route.
          </p>
        </section>
      </div>

      <section className="card">
        <h2 className="card-title">Decision Chain · Audit Trail</h2>
        <ol className="reasons">
          {decision.reasonChain.map((r, i) => (
            <li key={i}>
              <span className="idx">{i + 1}</span>
              <span>{r}</span>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
