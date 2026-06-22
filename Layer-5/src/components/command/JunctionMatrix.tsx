import { CONGESTION_COLOR, CONGESTION_LABEL } from "../../lib/congestion";
import type { JunctionSummary } from "../../types/snapshot";

interface Props {
  junctions: JunctionSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function JunctionMatrix({ junctions, selectedId, onSelect }: Props) {
  return (
    <section className="card span-all">
      <h2 className="card-title">Junction Matrix</h2>
      <div className="matrix-scroll">
        <table className="matrix">
          <thead>
            <tr>
              <th>Junction</th>
              <th>Zone</th>
              <th>Phase</th>
              <th>Plan</th>
              <th>Congestion</th>
              <th className="num">Vehicles</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {junctions.map((j) => (
              <tr
                key={j.id}
                className={j.id === selectedId ? "row-selected" : undefined}
                onClick={() => onSelect(j.id)}
              >
                <td>
                  <span className="jx-code">{j.code}</span>
                  <span className="jx-name">{j.name}</span>
                </td>
                <td>{j.zone}</td>
                <td>
                  <span className="phase-tag">{j.activePhase}</span>
                </td>
                <td className="mono">{j.planType}</td>
                <td>
                  <span className="cong-cell">
                    <span
                      className="cong-dot"
                      style={{ background: CONGESTION_COLOR[j.congestionLevel] }}
                    />
                    {CONGESTION_LABEL[j.congestionLevel]}
                    <span className="cong-pct">{Math.round(j.congestionScore * 100)}%</span>
                  </span>
                </td>
                <td className="num mono">{j.vehicleCount.toLocaleString("en-IN")}</td>
                <td>
                  {j.emergencyActive ? (
                    <span className="pill crit">Corridor</span>
                  ) : j.live ? (
                    <span className="pill ok">Live</span>
                  ) : (
                    <span className="pill info">Sim</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
