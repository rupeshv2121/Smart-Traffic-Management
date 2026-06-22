import { ConnectionChip } from "../components/ConnectionChip";
import { EmptyState } from "../components/EmptyState";
import { StatCard } from "../components/StatCard";
import { GATEWAY_URL } from "../config";
import { useStream } from "../context/StreamContext";

export function SystemHealthPage() {
  const { latest, connection } = useStream();

  if (!latest) return <EmptyState connection={connection} />;

  const { perception, decision, controller } = latest;
  const cvLive = perception.source === "LIVE_CV";
  const SIGNAL_DOT: Record<string, string> = {
    GREEN: "var(--india-green)",
    RED: "var(--danger)",
    YELLOW: "#e6a700",
  };

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
      n: "Layer 4 · Signal Controller",
      ok: controller.commandAck.applied && controller.junctionHealth.edgeStatus !== "OFFLINE",
      note: `${controller.controllerType} · ack ${controller.commandAck.applied ? "OK" : "FAIL"} · RTT ${controller.commandAck.rttMs}ms`,
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

      <section className="card mb-20">
        <h2 className="card-title">Layer 4 · Controller Read-back</h2>
        <div className="kv">
          <span className="k">Controller type</span>
          <span className="v">{controller.controllerType}</span>
        </div>
        <div className="kv">
          <span className="k">Signal state</span>
          <span className="v" style={{ display: "flex", gap: 12 }}>
            {(["NORTH", "SOUTH", "EAST", "WEST"] as const).map((p) => (
              <span key={p} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span
                  className="cong-dot"
                  style={{ background: SIGNAL_DOT[controller.signalState[p]] ?? "var(--muted)" }}
                />
                {p[0]}
              </span>
            ))}
          </span>
        </div>
        <div className="kv">
          <span className="k">Command ack</span>
          <span className="v">
            {controller.commandAck.applied ? "Applied" : "Not applied"} · RTT{" "}
            {controller.commandAck.rttMs}ms
          </span>
        </div>
        <div className="kv">
          <span className="k">Junction health</span>
          <span className={`pill ${controller.junctionHealth.edgeStatus === "ONLINE" ? "ok" : controller.junctionHealth.edgeStatus === "DEGRADED" ? "warn" : "crit"}`}>
            {controller.junctionHealth.edgeStatus}
          </span>
        </div>
        <div className="kv">
          <span className="k">Broker</span>
          <span className="v">{controller.junctionHealth.brokerConnected ? "Connected" : "Disconnected"}</span>
        </div>
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
