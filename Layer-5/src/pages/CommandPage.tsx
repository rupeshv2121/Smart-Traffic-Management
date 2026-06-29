import { useMemo, useState } from "react";

import { AiPanel } from "../components/command/AiPanel";
import { CityMap } from "../components/command/CityMap";
import { IncidentFeed } from "../components/command/IncidentFeed";
import { JunctionMatrix } from "../components/command/JunctionMatrix";
import { EmptyState } from "../components/EmptyState";
import { StatCard } from "../components/StatCard";
import { useStream } from "../context/StreamContext";
import {
  CONGESTION_COLOR,
  CONGESTION_LABEL,
  CONGESTION_ORDER,
  congestionLevelFromScore,
} from "../lib/congestion";

export function CommandPage() {
  const { city, latest, history, connection } = useStream();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = useMemo(() => {
    if (!city) return null;
    return city.junctions.find((j) => j.id === selectedId) ?? city.junctions.find((j) => j.live) ?? null;
  }, [city, selectedId]);

  if (!city) return <EmptyState connection={connection} />;

  const avgScore =
    city.junctions.reduce((s, j) => s + j.congestionScore, 0) / city.junctions.length;
  const cityLevel = congestionLevelFromScore(avgScore);

  return (
    <>
      <div className="cols cols-4 mb-20">
        <StatCard
          label="Nodes online"
          value={`${city.nodesOnline}/${city.totalJunctions}`}
          foot="Across the city network"
          accent="green"
        />
        <StatCard
          label="Active corridors"
          value={city.activeCorridors}
          foot="Emergency green waves"
          accent={city.activeCorridors > 0 ? "danger" : "blue"}
        />
        <StatCard
          label="Vehicles in network"
          value={city.totalVehicles.toLocaleString("en-IN")}
          foot="Live + simulated nodes"
          accent="saffron"
        />
        <StatCard
          label="City congestion"
          value={CONGESTION_LABEL[cityLevel]}
          foot={`Avg. ${Math.round(avgScore * 100)}% occupancy`}
          accent={avgScore > 0.6 ? "danger" : "blue"}
        />
      </div>

      <div className="cols cols-2 mb-20">
        <section className="card">
          <h2 className="card-title">Tactical City Map</h2>
          <CityMap
            junctions={city.junctions}
            selectedId={selected?.id ?? null}
            onSelect={setSelectedId}
          />
          <div className="map-legend">
            {CONGESTION_ORDER.map((lvl) => (
              <span key={lvl} className="legend-item">
                <span className="legend-dot" style={{ background: CONGESTION_COLOR[lvl] }} />
                {CONGESTION_LABEL[lvl]}
              </span>
            ))}
          </div>
          {selected && (
            <div className="map-selected">
              <div className="ms-head">
                <span className="jx-code">{selected.code}</span>
                <span className="jx-name">{selected.name}</span>
                {selected.live ? (
                  <span className="pill ok">Live</span>
                ) : (
                  <span className="pill info">Simulated</span>
                )}
              </div>
              <div className="ms-grid">
                <div>
                  <span className="ms-k">Zone</span>
                  <span className="ms-v">{selected.zone}</span>
                </div>
                <div>
                  <span className="ms-k">Active phase</span>
                  <span className="ms-v">{selected.activePhase}</span>
                </div>
                <div>
                  <span className="ms-k">Plan</span>
                  <span className="ms-v mono">{selected.planType}</span>
                </div>
                <div>
                  <span className="ms-k">Congestion</span>
                  <span className="ms-v">
                    {CONGESTION_LABEL[selected.congestionLevel]} ·{" "}
                    {Math.round(selected.congestionScore * 100)}%
                  </span>
                </div>
                <div>
                  <span className="ms-k">Vehicles</span>
                  <span className="ms-v mono">
                    {selected.vehicleCount.toLocaleString("en-IN")}
                  </span>
                </div>
                <div>
                  <span className="ms-k">Coordinates</span>
                  <span className="ms-v mono">
                    {selected.lat.toFixed(4)}, {selected.lng.toFixed(4)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </section>

        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <IncidentFeed incidents={city.incidents} />
          <AiPanel latest={latest} city={city} history={history} />
        </div>
      </div>

      <div className="cols">
        <JunctionMatrix
          junctions={city.junctions}
          selectedId={selected?.id ?? null}
          onSelect={setSelectedId}
        />
      </div>
    </>
  );
}
