import { ApproachList } from "../components/ApproachList";
import { ConfidenceGauge } from "../components/ConfidenceGauge";
import { CycleHistory } from "../components/CycleHistory";
import { DecisionPanel } from "../components/DecisionPanel";
import { EmergencyBanner } from "../components/EmergencyBanner";
import { EmptyState } from "../components/EmptyState";
import { JunctionDiagram } from "../components/JunctionDiagram";
import { ReasonChain } from "../components/ReasonChain";
import { StatCard } from "../components/StatCard";
import { useStream } from "../context/StreamContext";

export function LiveOpsPage() {
  const { latest, history, connection } = useStream();

  if (!latest) return <EmptyState connection={connection} />;

  const { perception, decision, emergency } = latest;
  const totalVeh = perception.approaches.reduce((s, a) => s + a.totalVehicles, 0);

  return (
    <>
      {emergency && (
        <div className="mb-20">
          <EmergencyBanner emv={emergency} />
        </div>
      )}

      <div className="cols cols-4 mb-20">
        <StatCard
          label="Active green phase"
          value={decision.targetPhaseId}
          foot={`${decision.durationSeconds}s green`}
          accent="green"
        />
        <StatCard
          label="Vehicles at junction"
          value={totalVeh}
          foot={`${perception.approaches.length} approaches`}
          accent="blue"
        />
        <StatCard
          label="Perception confidence"
          value={`${Math.round(perception.cvConfidenceScore * 100)}%`}
          foot={perception.source === "LIVE_CV" ? "Live camera" : "Mock fallback"}
          accent={perception.source === "LIVE_CV" ? "saffron" : "danger"}
        />
        <StatCard
          label="Safety status"
          value={decision.safetyValidationPassed ? "Safe" : "Blocked"}
          foot={decision.executionMode}
          accent={decision.safetyValidationPassed ? "green" : "danger"}
        />
      </div>

      <div className="cols cols-2 mb-20">
        <section className="card">
          <h2 className="card-title">Junction State</h2>
          <JunctionDiagram
            junctionId={latest.junctionId}
            approaches={perception.approaches}
          />
        </section>
        <section className="card">
          <h2 className="card-title">Approach Demand</h2>
          <ApproachList approaches={perception.approaches} />
        </section>
      </div>

      <div className="cols cols-2 mb-20">
        <DecisionPanel decision={decision} />
        <ConfidenceGauge
          score={perception.cvConfidenceScore}
          source={perception.source}
        />
      </div>

      <div className="cols cols-2 mb-20">
        <ReasonChain reasons={decision.reasonChain} />
        {history.length > 1 ? (
          <CycleHistory history={history} />
        ) : (
          <section className="card">
            <h2 className="card-title">Recent Cycles</h2>
            <p className="muted">Collecting cycles… history appears after a few cycles.</p>
          </section>
        )}
      </div>
    </>
  );
}
