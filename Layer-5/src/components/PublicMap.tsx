import { useEffect } from "react";
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import type { JunctionSummary } from "../types/snapshot";

interface PublicMapProps {
  junctions: JunctionSummary[];
  route?: { f: JunctionSummary; tt: JunctionSummary; lvl: string; avg: number } | null;
}

// Helper to bounds the map based on markers
function MapBounds({ junctions }: { junctions: JunctionSummary[] }) {
  const map = useMap();
  useEffect(() => {
    if (junctions.length === 0) return;
    if (junctions.length === 1) {
      map.flyTo([junctions[0].lat, junctions[0].lng], 14, { animate: true });
      return;
    }
    const lats = junctions.map(j => j.lat);
    const lngs = junctions.map(j => j.lng);
    const bounds: [[number, number], [number, number]] = [
      [Math.min(...lats), Math.min(...lngs)],
      [Math.max(...lats), Math.max(...lngs)],
    ];
    map.fitBounds(bounds, { padding: [40, 40], animate: true });
  }, [junctions, map]);
  return null;
}

export function PublicMap({ junctions, route }: PublicMapProps) {
  // If a route is selected, we only show 'from' and 'to' junctions
  const displayJunctions = route ? [route.f, route.tt] : junctions;

  // Default center roughly around New Delhi if no junctions
  const centerLat = 28.6139;
  const centerLng = 77.2090;

  return (
    <div className="delhi-map-wrapper" style={{ height: "400px", width: "100%" }}>
      <MapContainer
        center={[centerLat, centerLng]}
        zoom={12}
        scrollWheelZoom={true}
        className="delhi-map"
        style={{ height: "100%", width: "100%", borderRadius: "12px", zIndex: 1 }}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com/attributions">CARTO</a>'
        />

        {route && (
          <Polyline
            positions={[
              [route.f.lat, route.f.lng],
              [route.tt.lat, route.tt.lng]
            ]}
            pathOptions={{ color: "var(--primary)", weight: 4, dashArray: "5, 10" }}
          />
        )}

        {displayJunctions.map((j) => {
          const jColor = j.congestionLevel === "GRIDLOCK" ? "#ef4444"
            : j.congestionLevel === "HEAVY" ? "#f59e0b"
              : j.congestionLevel === "MODERATE" ? "#eab308"
                : j.congestionLevel === "SMOOTH" ? "#3b82f6"
                  : "#10b981"; // CLEAR

          return (
            <CircleMarker
              key={j.id}
              center={[j.lat, j.lng]}
              pathOptions={{ color: jColor, fillColor: jColor, fillOpacity: 0.8 }}
              radius={route ? 10 : 6}
            >
              <Popup>
                <div className="popup-content">
                  <strong className="popup-title">{j.name}</strong>
                  <div className="popup-stat">
                    <span>Code:</span> <b>{j.code}</b>
                  </div>
                  <div className="popup-stat">
                    <span>Vehicles:</span> <b>{j.vehicleCount}</b>
                  </div>
                  <div className="popup-stat">
                    <span>Status:</span> <b style={{ color: jColor }}>{j.congestionLevel}</b>
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
        <MapBounds junctions={displayJunctions} />
      </MapContainer>
    </div>
  );
}
