import { ApproachList } from "../components/ApproachList";
import { ConfidenceGauge } from "../components/ConfidenceGauge";
import { CycleHistory } from "../components/CycleHistory";
import { DecisionPanel } from "../components/DecisionPanel";
import { EmergencyBanner } from "../components/EmergencyBanner";
import { EmptyState } from "../components/EmptyState";
import { JunctionDiagram } from "../components/JunctionDiagram";
import { ReasonChain } from "../components/ReasonChain";
import { StatCard } from "../components/StatCard";
import { DelhiMap } from "../components/DelhiMap";
import { useStream } from "../context/StreamContext";

export function LiveOpsPage() {
  const { latest, history, connection, city } = useStream();

  if (!latest) return <EmptyState connection={connection} />;

  const { perception, decision, emergency } = latest;
  const totalVeh = perception.approaches.reduce((s, a) => s + a.totalVehicles, 0);
  const busLane = latest.busLane;

  return (
    <>
      {emergency && (
        <div className="mb-20">
          <EmergencyBanner emv={emergency} />
        </div>
      )}

      <div className="cols cols-5 mb-20">
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
        <StatCard
          label="Bus lane violations"
          value={busLane ? busLane.unauthorizedCount : "—"}
          foot={busLane ? `${Math.round(busLane.confidenceScore * 100)}% confidence` : "Awaiting detection"}
          accent={busLane && busLane.unauthorizedCount > 0 ? "danger" : "green"}
        />
      </div>

      <div className="cols cols-2 mb-20">
        <section className="card" style={{ padding: 0, overflow: "hidden", minHeight: "400px" }}>
          <DelhiMap
            lat={latest.lat}
            lng={latest.lng}
            junctionId={latest.junctionId}
            approaches={perception.approaches}
            otherJunctions={city?.junctions}
          />
        </section>
        <section className="card">
          <h2 className="card-title">Junction State</h2>
          <JunctionDiagram
            junctionId={latest.junctionId}
            approaches={perception.approaches}
          />
        </section>
      </div>

      <div className="cols cols-2 mb-20">
        <section className="card">
          <h2 className="card-title">Approach Demand</h2>
          <ApproachList approaches={perception.approaches} />
        </section>
        <DecisionPanel decision={decision} />
      </div>

      <div className="cols cols-2 mb-20">
        <ConfidenceGauge
          score={perception.cvConfidenceScore}
          source={perception.source}
        />
        <ReasonChain reasons={decision.reasonChain} />
      </div>

      <div className="mb-20">
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
