import { CycleHistory } from "../components/CycleHistory";
import { EmptyState } from "../components/EmptyState";
import { StatCard } from "../components/StatCard";
import { useStream } from "../context/StreamContext";
import { CONGESTION_COLOR, congestionLevelFromScore } from "../lib/congestion";
import type { ApproachId, CycleSnapshot } from "../types/snapshot";

const APPROACH_ORDER: ApproachId[] = ["NORTH", "SOUTH", "EAST", "WEST"];

const MODE_COLORS: Record<string, string> = {
  NORMAL_MAX_PRESSURE: "var(--info)",
  GREEN_CORRIDOR: "var(--danger)",
  HISTORICAL_FALLBACK: "var(--warn)",
  SAFE_DEFAULT: "#a67c00",
};

const PHASE_COLOR = "var(--india-green)";

function distribution(history: CycleSnapshot[], pick: (h: CycleSnapshot) => string) {
  const counts = new Map<string, number>();
  for (const h of history) counts.set(pick(h), (counts.get(pick(h)) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

export function AnalyticsPage() {
  const { latest, history, city, connection } = useStream();

  if (!latest || history.length === 0) return <EmptyState connection={connection} />;

  const heatCells = history.slice(-24);
  const maxVeh = city ? Math.max(...city.junctions.map((j) => j.vehicleCount), 1) : 1;

  const n = history.length;
  const avgGreen = Math.round(
    history.reduce((s, h) => s + h.decision.durationSeconds, 0) / n,
  );
  const avgVeh = Math.round(
    history.reduce(
      (s, h) => s + h.perception.approaches.reduce((t, a) => t + a.totalVehicles, 0),
      0,
    ) / n,
  );
  const safePct = Math.round(
    (history.filter((h) => h.decision.safetyValidationPassed).length / n) * 100,
  );
  const avgConf = Math.round(
    (history.reduce((s, h) => s + h.perception.cvConfidenceScore, 0) / n) * 100,
  );

  const modeDist = distribution(history, (h) => h.decision.executionMode);
  const phaseDist = distribution(history, (h) => h.decision.targetPhaseId);

  return (
    <>
      <div className="cols cols-4 mb-20">
        <StatCard label="Cycles observed" value={n} foot="Current session window" accent="blue" />
        <StatCard label="Avg. green duration" value={`${avgGreen}s`} foot="Across recent cycles" accent="green" />
        <StatCard label="Avg. vehicles / cycle" value={avgVeh} foot="All approaches" accent="saffron" />
        <StatCard
          label="Safety pass rate"
          value={`${safePct}%`}
          foot={`Avg. confidence ${avgConf}%`}
          accent={safePct === 100 ? "green" : "danger"}
        />
      </div>

      <div className="cols cols-2 mb-20">
        <section className="card">
          <h2 className="card-title">Execution Mode Distribution</h2>
          <div className="dist">
            {modeDist.map(([mode, count]) => (
              <div className="dist-row" key={mode}>
                <span className="dlabel">{mode}</span>
                <span className="dbar">
                  <span
                    style={{
                      width: `${(count / n) * 100}%`,
                      background: MODE_COLORS[mode] ?? "var(--muted)",
                    }}
                  />
                </span>
                <span className="dval">{Math.round((count / n) * 100)}%</span>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <h2 className="card-title">Green Time by Approach</h2>
          <div className="dist">
            {phaseDist.map(([phase, count]) => (
              <div className="dist-row" key={phase}>
                <span className="dlabel">{phase}</span>
                <span className="dbar">
                  <span style={{ width: `${(count / n) * 100}%`, background: PHASE_COLOR }} />
                </span>
                <span className="dval">{count}×</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="cols cols-2 mb-20">
        <section className="card">
          <h2 className="card-title">Approach Congestion · recent cycles</h2>
          <div className="heatmap">
            {APPROACH_ORDER.map((ap) => (
              <div className="heat-row" key={ap}>
                <span className="heat-label">{ap}</span>
                <div className="heat-cells">
                  {heatCells.map((h) => {
                    const a = h.perception.approaches.find((x) => x.approachId === ap);
                    const pct = a?.spatialOccupancyPct ?? 0;
                    return (
                      <span
                        key={h.cycle}
                        className="heat-cell"
                        style={{ background: CONGESTION_COLOR[congestionLevelFromScore(pct / 100)] }}
                        title={`Cycle #${h.cycle} · ${ap} · ${pct}%`}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
            Each cell = one cycle ({heatCells.length} shown), coloured by the congestion ramp.
          </p>
        </section>

        <section className="card">
          <h2 className="card-title">Junction Comparison</h2>
          {city ? (
            <div>
              {[...city.junctions]
                .sort((a, b) => b.congestionScore - a.congestionScore)
                .map((j) => (
                  <div className="cmp-row" key={j.id}>
                    <span className="cmp-label">{j.code}</span>
                    <span className="cmp-bar">
                      <span
                        style={{
                          width: `${(j.vehicleCount / maxVeh) * 100}%`,
                          background: CONGESTION_COLOR[j.congestionLevel],
                        }}
                      />
                    </span>
                    <span className="cmp-val">{j.vehicleCount}</span>
                  </div>
                ))}
            </div>
          ) : (
            <p className="feed-empty">Awaiting city snapshot…</p>
          )}
        </section>
      </div>

      <CycleHistory history={history} />
    </>
  );
}
