import { useMemo } from "react";

import { EmptyState } from "../components/EmptyState";
import { StatCard } from "../components/StatCard";
import { useStream } from "../context/StreamContext";
import { CONGESTION_COLOR, CONGESTION_LABEL } from "../lib/congestion";
import { CORRIDOR } from "../lib/mockData";
import type { JunctionSummary } from "../types/snapshot";

const TOLERANCE = 0.15; // ±15% of expected green = compliant

interface StopEval {
  code: string;
  name: string;
  expectedGreenS: number;
  actualGreenS: number;
  deviationPct: number;
  compliant: boolean;
  summary: JunctionSummary | null;
  live: boolean;
}

export function TIPage() {
  const { city, latest, connection } = useStream();

  const evals = useMemo<StopEval[]>(() => {
    if (!city) return [];
    return CORRIDOR.stops.map((stop) => {
      const summary = city.junctions.find((j) => j.code === stop.code) ?? null;
      const live = summary?.live ?? false;
      // Live junction: use the real green duration. Peers: derive a plausible
      // actual from congestion (busier ⇒ longer green held).
      const actualGreenS = live
        ? (latest?.decision.durationSeconds ?? stop.expectedGreenS)
        : Math.round(stop.expectedGreenS * (0.8 + (summary?.congestionScore ?? 0.4) * 0.5));
      const deviationPct = (actualGreenS - stop.expectedGreenS) / stop.expectedGreenS;
      return {
        code: stop.code,
        name: stop.name,
        expectedGreenS: stop.expectedGreenS,
        actualGreenS,
        deviationPct,
        compliant: Math.abs(deviationPct) <= TOLERANCE,
        summary,
        live,
      };
    });
  }, [city, latest]);

  if (!city) return <EmptyState connection={connection} />;

  const compliantCount = evals.filter((e) => e.compliant).length;
  const complianceScore = evals.length ? Math.round((compliantCount / evals.length) * 100) : 0;
  const hasDeviation = evals.some((e) => !e.compliant);
  const corridorState = hasDeviation ? "DEVIATION" : "MONITORING";

  return (
    <>
      <div className="notice-bar mb-20">
        <span aria-hidden>🛡️</span>
        <span>
          {CORRIDOR.name} — junction-by-junction expected-vs-actual green time.
          The live junction uses real timing; corridor peers are simulated.
        </span>
      </div>

      <div className="cols cols-4 mb-20">
        <StatCard label="Corridor" value={CORRIDOR.name.replace(" Corridor", "")} foot={`${evals.length} junctions`} accent="blue" />
        <StatCard
          label="Compliance score"
          value={`${complianceScore}%`}
          foot={`${compliantCount}/${evals.length} within ±15%`}
          accent={complianceScore >= 75 ? "green" : "danger"}
        />
        <StatCard
          label="Corridor state"
          value={corridorState}
          foot={hasDeviation ? "Deviation detected" : "All stops nominal"}
          accent={hasDeviation ? "danger" : "green"}
        />
        <StatCard
          label="Active corridors"
          value={city.activeCorridors}
          foot="Emergency green waves"
          accent={city.activeCorridors > 0 ? "danger" : "blue"}
        />
      </div>

      <section className="card span-all">
        <h2 className="card-title">Expected vs Actual Green Time</h2>
        <div className="ti-strip">
          {evals.map((e, i) => {
            const maxS = Math.max(e.expectedGreenS, e.actualGreenS, 1);
            return (
              <div key={e.code} className="ti-stop">
                <div className="ti-conn" aria-hidden>
                  {i < evals.length - 1 && <span className="ti-line" />}
                </div>
                <div className="ti-bars">
                  <span className="ti-bar exp" style={{ height: `${(e.expectedGreenS / maxS) * 100}%` }} title={`Expected ${e.expectedGreenS}s`} />
                  <span
                    className={`ti-bar act ${e.compliant ? "" : "dev"}`}
                    style={{ height: `${(e.actualGreenS / maxS) * 100}%` }}
                    title={`Actual ${e.actualGreenS}s`}
                  />
                </div>
                <div className="ti-code">{e.code}</div>
                {e.live && <span className="pill ok ti-live">Live</span>}
              </div>
            );
          })}
        </div>
        <div className="map-legend">
          <span className="legend-item"><span className="legend-dot" style={{ background: "var(--muted)" }} />Expected</span>
          <span className="legend-item"><span className="legend-dot" style={{ background: "var(--india-green)" }} />Actual (compliant)</span>
          <span className="legend-item"><span className="legend-dot" style={{ background: "var(--danger)" }} />Actual (deviation)</span>
        </div>
      </section>

      <section className="card span-all" style={{ marginTop: 20 }}>
        <h2 className="card-title">Junction Compliance</h2>
        <div className="matrix-scroll">
          <table className="matrix">
            <thead>
              <tr>
                <th>Junction</th>
                <th className="num">Expected</th>
                <th className="num">Actual</th>
                <th className="num">Deviation</th>
                <th>Congestion</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {evals.map((e) => (
                <tr key={e.code}>
                  <td>
                    <span className="jx-code">{e.code}</span>
                    <span className="jx-name">{e.name}</span>
                  </td>
                  <td className="num mono">{e.expectedGreenS}s</td>
                  <td className="num mono">{e.actualGreenS}s</td>
                  <td className="num mono">
                    {e.deviationPct >= 0 ? "+" : ""}
                    {Math.round(e.deviationPct * 100)}%
                  </td>
                  <td>
                    {e.summary ? (
                      <span className="cong-cell">
                        <span className="cong-dot" style={{ background: CONGESTION_COLOR[e.summary.congestionLevel] }} />
                        {CONGESTION_LABEL[e.summary.congestionLevel]}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    {e.compliant ? (
                      <span className="pill ok">Compliant</span>
                    ) : (
                      <span className="pill crit">Deviation</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
