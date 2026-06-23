import type { CityIncident } from "../../types/snapshot";
import { IncidentKindIcon } from "../icons/AppIcons";

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
                <IncidentKindIcon kind={inc.kind} size={18} />
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
