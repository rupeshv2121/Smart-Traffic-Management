import { ConnectionChip } from "../components/ConnectionChip";
import { EmptyState } from "../components/EmptyState";
import { StatCard } from "../components/StatCard";
import { GATEWAY_URL } from "../config";
import { useStream } from "../context/StreamContext";

export function SystemHealthPage() {
  const { latest, connection } = useStream();

  if (!latest) return <EmptyState connection={connection} />;

  const { perception, decision } = latest;
  const cvLive = perception.source === "LIVE_CV";

  // Layer status, inferred from the live snapshot.
  const layers = [
    {
      n: "Layer 2 · Perception (CV)",
      ok: cvLive,
      note: cvLive ? "Live YOLO camera feed" : "Mock fallback — CV service down",
    },
    {
      n: "Layer 3 · Decision Engine",
      ok: true,
      note: `Mode: ${decision.executionMode}`,
    },
    {
      n: "Layer 3 · Safety Supervisor",
      ok: decision.safetyValidationPassed,
      note: decision.safetyValidationPassed ? "All interlocks satisfied" : "Command blocked",
    },
    {
      n: "Layer 5 · Dashboard feed (SSE)",
      ok: connection === "live",
      note: `${GATEWAY_URL}/events`,
    },
  ];

  return (
    <>
      <div className="cols cols-3 mb-20">
        <StatCard
          label="Feed connection"
          value={connection === "live" ? "Live" : connection === "connecting" ? "Connecting" : "Offline"}
          foot="Layer-3 SSE gateway"
          accent={connection === "live" ? "green" : "danger"}
        />
        <StatCard
          label="Perception source"
          value={cvLive ? "Live CV" : "Mock"}
          foot={`Confidence ${Math.round(perception.cvConfidenceScore * 100)}%`}
          accent={cvLive ? "saffron" : "danger"}
        />
        <StatCard
          label="Last cycle"
          value={`#${latest.cycle}`}
          foot={new Date(latest.timestamp).toLocaleTimeString()}
          accent="blue"
        />
      </div>

      <section className="card mb-20">
        <h2 className="card-title">Layer Status</h2>
        {layers.map((l) => (
          <div className="kv" key={l.n}>
            <span className="k">
              {l.n}
              <div className="muted" style={{ fontSize: 13 }}>{l.note}</div>
            </span>
            <span className={`pill ${l.ok ? "ok" : "fail"}`}>
              {l.ok ? "● Operational" : "● Degraded"}
            </span>
          </div>
        ))}
      </section>

      <section className="card">
        <h2 className="card-title">Connection</h2>
        <div className="kv">
          <span className="k">Gateway URL</span>
          <span className="v">{GATEWAY_URL}</span>
        </div>
        <div className="kv">
          <span className="k">Junction</span>
          <span className="v">{latest.junctionId}</span>
        </div>
        <div className="kv">
          <span className="k">Status</span>
          <ConnectionChip state={connection} />
        </div>
      </section>
    </>
  );
}
