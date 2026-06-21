import type { ApproachSnapshot } from "../types/snapshot";

/** Per-approach demand bars (occupancy %) with vehicle counts. */
export function ApproachList({ approaches }: { approaches: ApproachSnapshot[] }) {
  return (
    <div className="approaches">
      {approaches.map((a) => (
        <div
          key={a.approachId}
          className={`approach-row ${a.isGreen ? "green" : ""}`}
        >
          <span className="name">
            {a.isGreen ? "🟢" : "🔴"} {a.approachId}
          </span>
          <span
            className="bar"
            title={`${a.spatialOccupancyPct}% occupancy · waited ${a.waitingTimeSeconds}s`}
          >
            <span style={{ width: `${Math.min(a.spatialOccupancyPct, 100)}%` }} />
          </span>
          <span className="veh">
            <b>{a.totalVehicles}</b> veh
          </span>
        </div>
      ))}
    </div>
  );
}
