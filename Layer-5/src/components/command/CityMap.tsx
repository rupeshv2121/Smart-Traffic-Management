import { useMemo } from "react";

import { CONGESTION_COLOR } from "../../lib/congestion";
import type { JunctionSummary } from "../../types/snapshot";

interface Props {
  junctions: JunctionSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const VIEW = 100;
const PAD = 12;

/**
 * Tactical city map: junctions plotted by lat/lng, coloured by the congestion
 * ramp. The live junction wears a navy ring; junctions with an active corridor
 * pulse red. Pure SVG — no map tiles, deliberately abstract (a control-room map,
 * not a street map).
 */
export function CityMap({ junctions, selectedId, onSelect }: Props) {
  const points = useMemo(() => {
    if (junctions.length === 0) return [];
    const lats = junctions.map((j) => j.lat);
    const lngs = junctions.map((j) => j.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const spanLat = maxLat - minLat || 1;
    const spanLng = maxLng - minLng || 1;
    const inner = VIEW - PAD * 2;
    return junctions.map((j) => ({
      j,
      x: PAD + ((j.lng - minLng) / spanLng) * inner,
      // Invert: higher latitude is further north → higher on screen.
      y: PAD + ((maxLat - j.lat) / spanLat) * inner,
    }));
  }, [junctions]);

  return (
    <svg className="city-map" viewBox={`0 0 ${VIEW} ${VIEW}`} role="img" aria-label="City junction map">
      {/* faint grid */}
      {[25, 50, 75].map((g) => (
        <g key={g} stroke="var(--border)" strokeWidth="0.2">
          <line x1={g} y1="4" x2={g} y2="96" />
          <line x1="4" y1={g} x2="96" y2={g} />
        </g>
      ))}

      {/* link the live junction to its peers (corridor lattice) */}
      {(() => {
        const live = points.find((p) => p.j.live);
        if (!live) return null;
        return points
          .filter((p) => !p.j.live)
          .map((p) => (
            <line
              key={`lnk-${p.j.id}`}
              x1={live.x}
              y1={live.y}
              x2={p.x}
              y2={p.y}
              stroke="var(--border-strong)"
              strokeWidth="0.18"
              strokeDasharray="1 1.4"
            />
          ));
      })()}

      {points.map(({ j, x, y }) => {
        const color = CONGESTION_COLOR[j.congestionLevel];
        const selected = j.id === selectedId;
        const r = j.live ? 3.4 : 2.7;
        return (
          <g
            key={j.id}
            className="city-node"
            transform={`translate(${x} ${y})`}
            onClick={() => onSelect(j.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") onSelect(j.id);
            }}
          >
            {j.emergencyActive && (
              <circle r={r + 3} className="city-node-emv" fill="none" stroke="#c62828" strokeWidth="0.5" />
            )}
            {selected && <circle r={r + 2} fill="none" stroke="var(--info)" strokeWidth="0.7" />}
            <circle r={r} fill={color} stroke={j.live ? "var(--navy)" : "#fff"} strokeWidth={j.live ? 0.9 : 0.5} />
            <text x={0} y={-r - 1.5} className="city-label" textAnchor="middle">
              {j.code}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
