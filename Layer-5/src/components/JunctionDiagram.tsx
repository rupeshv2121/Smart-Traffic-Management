import type { ApproachId, ApproachSnapshot } from "../types/snapshot";

const ARMS: ApproachId[] = ["NORTH", "SOUTH", "EAST", "WEST"];

/** A signal head: green for the active phase, red otherwise. */
function SignalHead({ green }: { green: boolean }) {
  return (
    <div className="signal">
      <span className={`lamp r ${green ? "" : "on"}`} />
      <span className="lamp y" />
      <span className={`lamp g ${green ? "on" : ""}`} />
    </div>
  );
}

export function JunctionDiagram({
  junctionId,
  approaches,
}: {
  junctionId: string;
  approaches: ApproachSnapshot[];
}) {
  const byId = new Map(approaches.map((a) => [a.approachId, a]));

  return (
    <div className="junction">
      <div className="jx-center">{junctionId}</div>
      {ARMS.map((id) => {
        const a = byId.get(id);
        const green = a?.isGreen ?? false;
        return (
          <div key={id} className={`arm ${id.toLowerCase()} ${green ? "green" : ""}`}>
            {/* signal sits toward the junction for N/W, lane label outward */}
            {(id === "SOUTH" || id === "EAST") && (
              <span className="lane">
                <b>{id}</b>
                {a ? `${a.totalVehicles} veh · ${a.spatialOccupancyPct}%` : "—"}
              </span>
            )}
            <SignalHead green={green} />
            {(id === "NORTH" || id === "WEST") && (
              <span className="lane">
                <b>{id}</b>
                {a ? `${a.totalVehicles} veh · ${a.spatialOccupancyPct}%` : "—"}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
