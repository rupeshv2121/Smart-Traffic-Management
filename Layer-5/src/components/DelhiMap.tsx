import { useEffect } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import type { ApproachSnapshot, JunctionSummary } from "../types/snapshot";

interface DelhiMapProps {
  lat: number;
  lng: number;
  junctionId: string;
  approaches: ApproachSnapshot[];
  otherJunctions?: JunctionSummary[];
}

// Helper component to center the map dynamically
function MapUpdater({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lng], 17, { animate: true });
  }, [lat, lng, map]);
  return null;
}

export function DelhiMap({ lat, lng, junctionId, approaches, otherJunctions = [] }: DelhiMapProps) {
  const totalVehicles = approaches.reduce((acc, a) => acc + a.totalVehicles, 0);
  const hasGridlock = approaches.some((a) => a.congestionLevel === "GRIDLOCK");
  const markerColor = hasGridlock ? "#ef4444" : "#10b981"; // Red if gridlock, otherwise green

  return (
    <div className="delhi-map-wrapper">
      <MapContainer
        center={[lat, lng]}
        zoom={17}
        scrollWheelZoom={true}
        zoomControl={false}
        className="delhi-map"
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com/attributions">CARTO</a>'
        />
        {otherJunctions.map((j) => {
          if (j.id === junctionId) return null; // skip the active one
          const jColor = j.congestionLevel === "GRIDLOCK" ? "#ef4444" : (j.congestionLevel === "HEAVY" ? "#f59e0b" : "#64748b");
          return (
            <CircleMarker
              key={j.id}
              center={[j.lat, j.lng]}
              pathOptions={{ color: jColor, fillColor: jColor, fillOpacity: 0.5 }}
              radius={8}
            >
              <Popup>
                <div className="popup-content">
                  <strong className="popup-title">{j.id}</strong>
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
        <CircleMarker
          center={[lat, lng]}
          pathOptions={{ color: markerColor, fillColor: markerColor, fillOpacity: 0.8 }}
          radius={15}
        >
          <Popup>
            <div className="popup-content">
              <strong className="popup-title">{junctionId}</strong>
              <div className="popup-stat">
                <span>Vehicles:</span> <b>{totalVehicles}</b>
              </div>
              <div className="popup-stat">
                <span>Status:</span> <b style={{ color: markerColor }}>{hasGridlock ? "Gridlock" : "Operating"}</b>
              </div>
            </div>
          </Popup>
        </CircleMarker>
        <MapUpdater lat={lat} lng={lng} />
      </MapContainer>
    </div>
  );
}
