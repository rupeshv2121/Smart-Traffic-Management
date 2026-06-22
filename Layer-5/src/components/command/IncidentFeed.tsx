import type { CityIncident } from "../../types/snapshot";

const KIND_ICON: Record<CityIncident["kind"], string> = {
  EMERGENCY: "🚑",
  GRIDLOCK: "🛑",
  SAFETY: "⚠️",
  DEGRADED: "📡",
};

export function IncidentFeed({ incidents }: { incidents: CityIncident[] }) {
  return (
    <section className="card">
      <h2 className="card-title">
        Live Incidents <span className="count-badge">{incidents.length}</span>
      </h2>
      {incidents.length === 0 ? (
        <p className="feed-empty">No active incidents across the city network.</p>
      ) : (
        <ul className="incident-feed">
          {incidents.map((inc) => (
            <li key={inc.id} className={`incident sev-${inc.severity}`}>
              <span className="inc-ic" aria-hidden>
                {KIND_ICON[inc.kind]}
              </span>
              <div className="inc-body">
                <div className="inc-msg">{inc.message}</div>
                <div className="inc-meta">
                  {inc.junctionCode} · {inc.kind} ·{" "}
                  {new Date(inc.ts).toLocaleTimeString()}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
