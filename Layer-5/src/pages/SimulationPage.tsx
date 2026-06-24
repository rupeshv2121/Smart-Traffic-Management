import { ExternalLink } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { EmergencyBanner } from "../components/EmergencyBanner";
import { StatCard } from "../components/StatCard";
import { SIM_URL } from "../config";
import { useStream } from "../context/StreamContext";
import { dispatchEmv, type PhaseId } from "../lib/api";
import type {
  ApproachId,
  CycleSnapshot,
  CitySnapshot,
  JunctionSummary,
} from "../types/snapshot";

/* ------------------------------------------------------------------ */
/*  Types for the postMessage bridge                                   */
/* ------------------------------------------------------------------ */

/** Sim → Layer-5 */
interface SimLaneDataMsg {
  type: "LANE_DATA_UPDATE";
  data: {
    intersectionId: string;
    lanes: {
      laneId: string;
      laneName: string;
      signal: string;
      queueCount: number;
      enteredCount: number;
      ambulanceDetected: boolean;
    }[];
    timestamp: number;
  };
}
interface SimDispatchMsg {
  type: "DISPATCH_AMBULANCE";
  direction: "NS" | "EW";
}
interface SimIntersectionMsg {
  type: "INTERSECTION_SELECTED";
  intersectionId: string;
}

type SimOutboundMsg = SimLaneDataMsg | SimDispatchMsg | SimIntersectionMsg;

/* ------------------------------------------------------------------ */
/*  Approach-ID → sim direction helpers                                */
/* ------------------------------------------------------------------ */

const APPROACH_TO_SIGNAL_COLOR: Record<string, string> = {
  RED: "red",
  GREEN: "green",
  YELLOW: "yellow",
};

function phaseToSimDirection(phase: string): "NS" | "EW" {
  return phase === "NORTH" || phase === "SOUTH" ? "NS" : "EW";
}

/* ------------------------------------------------------------------ */
/*  SimulationPage                                                     */
/* ------------------------------------------------------------------ */

export function SimulationPage() {
  const { latest, city, connection } = useStream();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeReady, setIframeReady] = useState(false);

  // Local UI state driven by sim → Layer-5 messages
  const [laneData, setLaneData] = useState<SimLaneDataMsg["data"] | null>(null);
  const [selectedJunction, setSelectedJunction] = useState<JunctionSummary | null>(null);
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const [dispatching, setDispatching] = useState(false);

  // ── Send a typed message into the sim iframe ────────────────────
  const postToSim = useCallback(
    (msg: Record<string, unknown>) => {
      if (!iframeReady || !iframeRef.current?.contentWindow) return;
      try {
        iframeRef.current.contentWindow.postMessage(msg, "*");
      } catch {
        /* cross-origin guard — non-fatal */
      }
    },
    [iframeReady],
  );

  // ── Forward real Layer-3 CycleSnapshot data INTO the sim ────────
  useEffect(() => {
    if (!latest) return;
    forwardSnapshot(latest);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latest, iframeReady]);

  function forwardSnapshot(snap: CycleSnapshot) {
    // 1. Signal states
    const signalMap: Record<string, string> = {};
    for (const [approach, color] of Object.entries(
      snap.controller.signalState,
    )) {
      signalMap[approach] = APPROACH_TO_SIGNAL_COLOR[color] ?? "red";
    }
    postToSim({ type: "SIGNAL_STATE_UPDATE", signals: signalMap });

    // 2. Emergency corridor
    if (snap.emergency) {
      postToSim({
        type: "EMERGENCY_UPDATE",
        active: true,
        direction: phaseToSimDirection(snap.emergency.targetPhaseId),
        emvId: snap.emergency.emvId,
        etaSeconds: snap.emergency.etaSeconds,
        targetPhase: snap.emergency.targetPhaseId,
      });
    } else {
      postToSim({ type: "EMERGENCY_UPDATE", active: false });
    }

    // 3. Vehicle counts per approach
    const counts: Record<string, number> = {};
    for (const a of snap.perception.approaches) {
      counts[a.approachId] = a.totalVehicles;
    }
    postToSim({ type: "VEHICLE_COUNT_UPDATE", counts });

    // 4. Corridor routing data
    if (snap.corridor) {
      postToSim({
        type: "CORRIDOR_UPDATE",
        status: snap.corridor.status,
        tiState: snap.corridor.tiState,
        active: snap.corridor.active,
        reservedJunctions: snap.corridor.reservedJunctions,
      });
    }
  }

  // ── Forward city-wide junction states ───────────────────────────
  useEffect(() => {
    if (!city) return;
    forwardCityState(city);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, iframeReady]);

  function forwardCityState(c: CitySnapshot) {
    const junctions = c.junctions.map((j) => ({
      id: j.id,
      code: j.code,
      name: j.name,
      congestionScore: j.congestionScore,
      emergencyActive: j.emergencyActive,
      activePhase: j.activePhase,
      vehicleCount: j.vehicleCount,
    }));
    postToSim({ type: "CITY_STATE_UPDATE", junctions });
  }

  // ── Listen for messages FROM the sim ────────────────────────────
  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      const msg = ev.data as SimOutboundMsg;
      if (!msg || typeof msg.type !== "string") return;

      switch (msg.type) {
        case "LANE_DATA_UPDATE":
          setLaneData(msg.data);
          break;

        case "DISPATCH_AMBULANCE":
          handleSimDispatch(msg.direction);
          break;

        case "INTERSECTION_SELECTED":
          handleIntersectionSelect(msg.intersectionId);
          break;
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city]);

  // ── Iframe ready detection ──────────────────────────────────────
  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      if (ev.data?.type === "SIM_READY") {
        setIframeReady(true);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  function handleIframeLoad() {
    // Give the sim a moment to mount its listener, then mark ready
    setTimeout(() => setIframeReady(true), 1500);
  }

  // ── Dispatch ambulance via real Layer-3 API ─────────────────────
  async function handleSimDispatch(direction: "NS" | "EW") {
    setDispatchError(null);
    setDispatching(true);
    const phase: PhaseId = direction === "NS" ? "NORTH" : "EAST";
    try {
      const res = await dispatchEmv({
        targetPhaseId: phase,
        etaSeconds: 90,
        priorityClass: "CRITICAL",
      });
      if (!res.ok && res.error) {
        setDispatchError(res.error);
      }
    } catch (err) {
      setDispatchError(
        err instanceof Error ? err.message : "Dispatch failed",
      );
      // Still tell the sim to spawn visually so the user gets feedback
      postToSim({ type: "DISPATCH_AMBULANCE_ACK", direction });
    } finally {
      setDispatching(false);
    }
  }

  // ── Map intersection click to city junction ─────────────────────
  function handleIntersectionSelect(intersectionId: string) {
    if (!city) return;
    // Match by code or name fragment (sim uses names like "ITO Junction")
    const match = city.junctions.find(
      (j) =>
        j.id === intersectionId ||
        j.code === intersectionId ||
        intersectionId.toLowerCase().includes(j.name.toLowerCase()) ||
        j.name.toLowerCase().includes(intersectionId.replace(/-/g, " ").toLowerCase()),
    );
    setSelectedJunction(match ?? null);
  }

  // ── Manual dispatch from Layer-5 UI ─────────────────────────────
  function dispatchFromUI(direction: "NS" | "EW") {
    postToSim({ type: "DISPATCH_AMBULANCE_ACK", direction });
    handleSimDispatch(direction);
  }

  // ── Derived state ───────────────────────────────────────────────
  const emergency = latest?.emergency ?? null;
  const signalState = latest?.controller?.signalState;
  const hasEmergency = !!emergency;

  return (
    <div className="sim-page">
      {/* ── Left: 3D sim iframe ─────────────────────────────────── */}
      <div className="sim-viewport">
        <iframe
          ref={iframeRef}
          src={SIM_URL}
          title="Green Corridor 3D Simulation"
          className="sim-iframe"
          allow="accelerometer; autoplay; camera; gyroscope; webgl"
          onLoad={handleIframeLoad}
        />

        {/* Open simulation full-screen in a new tab */}
        <a
          href={SIM_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="sim-newtab-btn"
          title="Open simulation in full screen"
        >
          <ExternalLink size={16} strokeWidth={2} />
          Open in new tab
        </a>

        {/* Connection status overlay */}
        {connection !== "live" && (
          <div className="sim-overlay-status">
            <span className={`pill ${connection === "connecting" ? "info" : "fail"}`}>
              {connection === "connecting"
                ? "Connecting to Layer-3…"
                : "Layer-3 disconnected — sim running standalone"}
            </span>
          </div>
        )}

        {/* Emergency banner overlay */}
        {hasEmergency && emergency && (
          <div className="sim-overlay-emergency">
            <EmergencyBanner emv={emergency} />
          </div>
        )}
      </div>

      {/* ── Right: live data panel ──────────────────────────────── */}
      <aside className="sim-panel">
        <h2 className="sim-panel-title">Live Signal State</h2>

        {/* Signal indicators */}
        {signalState ? (
          <div className="sim-signals">
            {(["NORTH", "SOUTH", "EAST", "WEST"] as ApproachId[]).map((a) => {
              const color = signalState[a];
              return (
                <div key={a} className="sim-signal-row">
                  <span className="sim-signal-label">{a}</span>
                  <span
                    className={`sim-signal-dot sim-signal-${color?.toLowerCase() ?? "red"}`}
                    title={color}
                  />
                  <span className="sim-signal-text">{color}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="muted">Awaiting signal data…</p>
        )}

        {/* Emergency status */}
        <h2 className="sim-panel-title" style={{ marginTop: 20 }}>
          Emergency Corridor
        </h2>
        {hasEmergency && emergency ? (
          <div className="sim-emv-info">
            <div className="kv">
              <span className="k">Vehicle</span>
              <span className="v">{emergency.emvId}</span>
            </div>
            <div className="kv">
              <span className="k">Phase</span>
              <span className="v">{emergency.targetPhaseId}</span>
            </div>
            <div className="kv">
              <span className="k">ETA</span>
              <span className="v">{emergency.etaSeconds}s</span>
            </div>
            <div className="kv">
              <span className="k">Priority</span>
              <span className={`pill crit`}>{emergency.priorityClass}</span>
            </div>
          </div>
        ) : (
          <p className="sim-no-emv">🟢 No active corridor</p>
        )}

        {/* Dispatch controls */}
        <h2 className="sim-panel-title" style={{ marginTop: 20 }}>
          Dispatch Ambulance
        </h2>
        <div className="sim-dispatch-btns">
          <button
            className="btn btn-primary"
            disabled={dispatching || hasEmergency}
            onClick={() => dispatchFromUI("NS")}
          >
            Dispatch N↔S
          </button>
          <button
            className="btn btn-primary"
            disabled={dispatching || hasEmergency}
            onClick={() => dispatchFromUI("EW")}
          >
            Dispatch E↔W
          </button>
        </div>
        {dispatchError && (
          <p className="sim-dispatch-err">{dispatchError}</p>
        )}
        {dispatching && (
          <p className="muted" style={{ marginTop: 8 }}>
            Dispatching to Layer-3…
          </p>
        )}

        {/* Lane data from sim */}
        {laneData && (
          <>
            <h2 className="sim-panel-title" style={{ marginTop: 20 }}>
              Sim Lane Metrics
            </h2>
            <div className="sim-lane-grid">
              {laneData.lanes.map((lane) => (
                <div key={lane.laneId} className="sim-lane-card">
                  <div className="sim-lane-header">
                    <span>{lane.laneName}</span>
                    <span
                      className={`sim-signal-dot sim-signal-${lane.signal}`}
                    />
                  </div>
                  <div className="sim-lane-stat">
                    <span className="k">Queue</span>
                    <span className="v">{lane.queueCount}</span>
                  </div>
                  <div className="sim-lane-stat">
                    <span className="k">Entered</span>
                    <span className="v">{lane.enteredCount}</span>
                  </div>
                  {lane.ambulanceDetected && (
                    <span className="pill crit" style={{ marginTop: 4 }}>
                      🚑 AMBULANCE
                    </span>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/* Stats from live data */}
        {latest && (
          <>
            <h2 className="sim-panel-title" style={{ marginTop: 20 }}>
              Live Junction
            </h2>
            <div className="sim-stats-mini">
              <StatCard
                label="Vehicles"
                value={latest.perception.approaches.reduce(
                  (s, a) => s + a.totalVehicles,
                  0,
                )}
                accent="blue"
              />
              <StatCard
                label="Confidence"
                value={`${Math.round(latest.perception.cvConfidenceScore * 100)}%`}
                accent={
                  latest.perception.source === "LIVE_CV" ? "green" : "danger"
                }
              />
            </div>
          </>
        )}

        {/* Junction info on intersection click */}
        {selectedJunction && (
          <>
            <h2 className="sim-panel-title" style={{ marginTop: 20 }}>
              Selected Junction
            </h2>
            <div className="sim-junction-info">
              <div className="kv">
                <span className="k">Code</span>
                <span className="v mono">{selectedJunction.code}</span>
              </div>
              <div className="kv">
                <span className="k">Name</span>
                <span className="v">{selectedJunction.name}</span>
              </div>
              <div className="kv">
                <span className="k">Zone</span>
                <span className="v">{selectedJunction.zone}</span>
              </div>
              <div className="kv">
                <span className="k">Phase</span>
                <span className="v">{selectedJunction.activePhase}</span>
              </div>
              <div className="kv">
                <span className="k">Vehicles</span>
                <span className="v mono">
                  {selectedJunction.vehicleCount.toLocaleString("en-IN")}
                </span>
              </div>
              <div className="kv">
                <span className="k">Congestion</span>
                <span className="v">
                  {Math.round(selectedJunction.congestionScore * 100)}%
                </span>
              </div>
              {selectedJunction.emergencyActive && (
                <span className="pill crit">EMERGENCY ACTIVE</span>
              )}
              <button
                className="btn btn-ghost"
                style={{ marginTop: 8 }}
                onClick={() => setSelectedJunction(null)}
              >
                Dismiss
              </button>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
