import { EmptyState } from "../components/EmptyState";
import { StatCard } from "../components/StatCard";
import { useStream } from "../context/StreamContext";
import { CORRIDOR } from "../lib/mockData";
import type { CorridorLeg, LegState, TiState } from "../types/snapshot";

// TI status → visual treatment. All four backend tiStates render.
const TI_META: Record<TiState, { label: string; pill: string; note: string; accent: "blue" | "green" | "danger" | "saffron" }> = {
  STANDBY: { label: "STANDBY", pill: "info", note: "No active corridor — monitoring on standby", accent: "blue" },
  MONITORING: { label: "MONITORING", pill: "ok", note: "Corridor active — route tracking nominal", accent: "green" },
  DEVIATION: { label: "DEVIATION", pill: "warn", note: "Route re-planned — corridor deviated", accent: "danger" },
  COMPLETED: { label: "COMPLETED", pill: "info", note: "Corridor cleared — vehicle arrived", accent: "saffron" },
};

// Leg state → pill class + label for the expected-vs-actual route view.
const LEG_META: Record<LegState, { pill: string; label: string }> = {
  CLEARED: { pill: "ok", label: "Cleared" },
  RESERVED: { pill: "warn", label: "Reserved" },
  PENDING: { pill: "info", label: "Pending" },
  ABANDONED: { pill: "crit", label: "Abandoned" },
};

export function TIPage() {
  const { latest, city, connection } = useStream();

  if (!latest) return <EmptyState connection={connection} />;

  const corridor = latest.corridor;
  const tiState = corridor.tiState;
  const meta = TI_META[tiState];
  const active = corridor.active;
  const compliancePct = active ? Math.round(active.compliance * 100) : 0;
  const replans = active?.replans ?? 0;

  // Static fallback label set when no live corridor is active.
  const corridorName = active
    ? `Corridor ${active.emvId}`
    : CORRIDOR.name.replace(" Corridor", "");

  return (
    <>
      <div className="notice-bar mb-20">
        <span aria-hidden>🛡️</span>
        <span>
          Trusted Intermediary — live Green-Corridor compliance. Route reservations
          are tracked junction-by-junction against the granted plan; a re-plan is
          flagged as a deviation.
        </span>
      </div>

      <div className="cols cols-4 mb-20">
        <StatCard
          label="TI status"
          value={meta.label}
          foot={meta.note}
          accent={meta.accent}
        />
        <StatCard
          label="Compliance score"
          value={active ? `${compliancePct}%` : "—"}
          foot={active ? `${active.legs.filter((l) => l.state === "CLEARED").length}/${active.legs.length} legs cleared` : "No active corridor"}
          accent={active ? (compliancePct >= 75 ? "green" : "danger") : "blue"}
        />
        <StatCard
          label="Re-plans"
          value={replans}
          foot={replans > 0 ? "Deviations detected" : "Route nominal"}
          accent={replans > 0 ? "danger" : "green"}
        />
        <StatCard
          label="Reserved junctions"
          value={corridor.reservedJunctions}
          foot={`${corridor.conflicts.length} corridor(s) held`}
          accent={corridor.conflicts.length > 0 ? "saffron" : "blue"}
        />
      </div>

      {active ? (
        <>
          <div className="emv-state-bar mb-20">
            <span className="esb-label">{corridorName}</span>
            <span className={`pill ${meta.pill}`}>{meta.label}</span>
            <span className="esb-note">
              {active.priorityClass} · ETA {active.etaSeconds}s · → {active.targetPhaseId} · {active.route.join(" → ")}
            </span>
          </div>

          <section className="card span-all">
            <h2 className="card-title">Reserved Route · Expected vs Actual</h2>
            <div className="ti-strip">
              {active.legs.map((leg, i) => (
                <RouteLeg key={`${leg.junctionId}-${i}`} leg={leg} isLast={i === active.legs.length - 1} current={i === active.currentIndex} />
              ))}
            </div>
            <div className="map-legend">
              <span className="legend-item"><span className="legend-dot" style={{ background: "var(--ok)" }} />Cleared (passed)</span>
              <span className="legend-item"><span className="legend-dot" style={{ background: "var(--warn)" }} />Reserved (held green)</span>
              <span className="legend-item"><span className="legend-dot" style={{ background: "var(--info)" }} />Pending</span>
              <span className="legend-item"><span className="legend-dot" style={{ background: "var(--danger)" }} />Abandoned (re-planned)</span>
            </div>
          </section>

          <section className="card span-all" style={{ marginTop: 20 }}>
            <h2 className="card-title">Junction Compliance</h2>
            <div className="matrix-scroll">
              <table className="matrix">
                <thead>
                  <tr>
                    <th>Junction</th>
                    <th className="num">Leg</th>
                    <th>Reservation</th>
                    <th>Progress</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {active.legs.map((leg, i) => {
                    const summary = city?.junctions.find((j) => j.code === leg.code) ?? null;
                    const lm = LEG_META[leg.state];
                    return (
                      <tr key={`${leg.junctionId}-${i}`}>
                        <td>
                          <span className="jx-code">{leg.code}</span>
                          {summary && <span className="jx-name">{summary.name}</span>}
                        </td>
                        <td className="num mono">#{leg.index + 1}</td>
                        <td><span className={`pill ${lm.pill}`}>{lm.label}</span></td>
                        <td className="mono">
                          {i < active.currentIndex ? "Passed" : i === active.currentIndex ? "At junction" : "Ahead"}
                        </td>
                        <td>
                          {leg.state === "CLEARED" ? (
                            <span className="pill ok">Compliant</span>
                          ) : leg.state === "ABANDONED" ? (
                            <span className="pill crit">Deviation</span>
                          ) : (
                            <span className="pill info">In window</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {corridor.conflicts.length > 0 && (
            <section className="card span-all" style={{ marginTop: 20 }}>
              <h2 className="card-title">Held / Conflicting EMVs</h2>
              <div className="matrix-scroll">
                <table className="matrix">
                  <thead>
                    <tr>
                      <th>Vehicle</th>
                      <th>Priority</th>
                      <th className="num">ETA</th>
                      <th className="num">Re-plans</th>
                      <th>Held reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {corridor.conflicts.map((c) => (
                      <tr key={c.emvId}>
                        <td><span className="jx-code">{c.emvId}</span></td>
                        <td><span className={`pill ${c.priorityClass === "CRITICAL" ? "crit" : c.priorityClass === "HIGH" ? "warn" : "info"}`}>{c.priorityClass}</span></td>
                        <td className="num mono">{c.etaSeconds}s</td>
                        <td className="num mono">{c.replans}</td>
                        <td className="muted">{c.heldReason ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      ) : (
        <section className="card span-all">
          <h2 className="card-title">{meta.label === "COMPLETED" ? "Last Corridor · Completed" : "Standby"}</h2>
          <div className="empty" style={{ padding: "28px 0" }}>
            <div className="big">{tiState === "COMPLETED" ? "🏁 Corridor cleared" : "🛡️ No active corridor"}</div>
            <p className="muted">
              {tiState === "COMPLETED"
                ? "The emergency vehicle has arrived and all reserved junctions have been released. The TI returns to standby on the next dispatch."
                : `The Trusted Intermediary is monitoring on standby. When a Green Corridor is dispatched (e.g. ${CORRIDOR.name}), its reserved route appears here junction-by-junction with live compliance.`}
            </p>
          </div>
        </section>
      )}
    </>
  );
}

function RouteLeg({ leg, isLast, current }: { leg: CorridorLeg; isLast: boolean; current: boolean }) {
  const lm = LEG_META[leg.state];
  const fill =
    leg.state === "CLEARED" ? "var(--ok)"
    : leg.state === "RESERVED" ? "var(--warn)"
    : leg.state === "ABANDONED" ? "var(--danger)"
    : "var(--info)";
  // Bar height reflects reservation progress: cleared = full, reserved/pending = partial.
  const height = leg.state === "CLEARED" ? 100 : leg.state === "ABANDONED" ? 30 : 60;
  return (
    <div className="ti-stop">
      <div className="ti-conn" aria-hidden>{!isLast && <span className="ti-line" />}</div>
      <div className="ti-bars">
        <span className="ti-bar" style={{ height: `${height}%`, background: fill, width: 26 }} title={`${leg.code} · ${lm.label}`} />
      </div>
      <div className="ti-code">{leg.code}</div>
      {current && <span className="pill ok ti-live">Here</span>}
    </div>
  );
}
