import type { AuditEntry } from "../lib/api";

const ACTION_LABEL: Record<AuditEntry["action"], string> = {
  DECISION: "Decision",
  OVERRIDE_REQUESTED: "Override requested",
  OVERRIDE_APPLIED: "Override applied",
  OVERRIDE_DEFERRED: "Override deferred",
  OVERRIDE_CLEARED: "Override cleared",
  SAFETY_BLOCK: "Safety block",
  EMERGENCY: "Emergency",
};

export function AuditTrail({
  entries,
  title = "Audit Trail",
  max,
}: {
  entries: AuditEntry[];
  title?: string;
  max?: number;
}) {
  const rows = max ? entries.slice(0, max) : entries;
  return (
    <section className="card span-all">
      <h2 className="card-title">
        {title} <span className="count-badge">{entries.length}</span>
      </h2>
      {rows.length === 0 ? (
        <p className="feed-empty">No audit records yet.</p>
      ) : (
        <div className="matrix-scroll">
          <table className="matrix audit-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Action</th>
                <th>Actor</th>
                <th>Detail</th>
                <th>Outcome</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id}>
                  <td className="mono nowrap">{new Date(e.ts).toLocaleTimeString()}</td>
                  <td>{ACTION_LABEL[e.action]}</td>
                  <td className="nowrap">{e.actor}</td>
                  <td>{e.detail}</td>
                  <td>
                    <span
                      className={`pill ${
                        e.outcome === "ok" ? "ok" : e.outcome === "blocked" ? "crit" : "info"
                      }`}
                    >
                      {e.outcome}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
