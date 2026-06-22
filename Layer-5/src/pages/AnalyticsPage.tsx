import { useEffect, useState } from "react";

import { CycleHistory } from "../components/CycleHistory";
import { EmptyState } from "../components/EmptyState";
import { StatCard } from "../components/StatCard";
import { useStream } from "../context/StreamContext";
import { getAnalyticsSeries, type AnalyticsSeries } from "../lib/api";
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
  const [series, setSeries] = useState<AnalyticsSeries | null>(null);

  // Poll the 24h time-series; it lives in durable persistence, not the SSE feed.
  useEffect(() => {
    let alive = true;
    const load = () => {
      getAnalyticsSeries(24, 48)
        .then((s) => alive && setSeries(s))
        .catch(() => {/* gateway may not be up yet — chart shows a placeholder */});
    };
    load();
    const id = window.setInterval(load, 30_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

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

  const seriesPoints = series?.points ?? [];
  const lastPoint = seriesPoints.length ? seriesPoints[seriesPoints.length - 1] : undefined;

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

      <section className="card mb-20">
        <h2 className="card-title">
          Throughput &amp; Wait Time · last {series?.windowHours ?? 24}h
        </h2>
        <ThroughputWaitChart series={series} />
      </section>

      <div className="cols cols-4 mb-20">
        <SparkCard
          label="Throughput (PCU)"
          accent="var(--india-green)"
          points={series?.points.map((p) => p.throughputPcu) ?? []}
          last={lastPoint?.throughputPcu}
        />
        <SparkCard
          label="Avg. wait (s)"
          accent="var(--warn)"
          points={series?.points.map((p) => p.avgWaitSeconds) ?? []}
          last={lastPoint?.avgWaitSeconds}
          suffix="s"
        />
        <SparkCard
          label="Congestion"
          accent="var(--danger)"
          points={series?.points.map((p) => Math.round(p.congestion * 100)) ?? []}
          last={lastPoint ? Math.round(lastPoint.congestion * 100) : undefined}
          suffix="%"
        />
        <SparkCard
          label="Safety pass"
          accent="var(--info)"
          points={series?.points.map((p) => p.safetyPassPct) ?? []}
          last={lastPoint?.safetyPassPct}
          suffix="%"
        />
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

// ── 24h throughput + wait-time chart (dual-axis area/line, pure SVG) ──────────
const CHART_W = 720;
const CHART_H = 220;
const PAD = { t: 14, r: 48, b: 26, l: 44 };

function ThroughputWaitChart({ series }: { series: AnalyticsSeries | null }) {
  const pts = series?.points ?? [];
  if (pts.length === 0) {
    return <p className="feed-empty">Awaiting history — the 24h series builds as cycles persist…</p>;
  }

  const iw = CHART_W - PAD.l - PAD.r;
  const ih = CHART_H - PAD.t - PAD.b;
  const x = (i: number) => PAD.l + (pts.length === 1 ? iw / 2 : (i / (pts.length - 1)) * iw);

  const maxThr = Math.max(1, ...pts.map((p) => p.throughputPcu));
  const maxWait = Math.max(1, ...pts.map((p) => p.avgWaitSeconds));
  const yThr = (v: number) => PAD.t + ih - (v / maxThr) * ih;
  const yWait = (v: number) => PAD.t + ih - (v / maxWait) * ih;

  const thrLine = pts.map((p, i) => `${x(i)},${yThr(p.throughputPcu)}`).join(" ");
  const thrArea = `M ${PAD.l},${PAD.t + ih} L ${pts.map((p, i) => `${x(i)},${yThr(p.throughputPcu)}`).join(" L ")} L ${x(pts.length - 1)},${PAD.t + ih} Z`;
  const waitLine = pts.map((p, i) => `${x(i)},${yWait(p.avgWaitSeconds)}`).join(" ");

  const tFmt = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const gridY = [0, 0.25, 0.5, 0.75, 1];
  const tickEvery = Math.max(1, Math.ceil(pts.length / 6));

  return (
    <>
      <svg className="ts-chart" viewBox={`0 0 ${CHART_W} ${CHART_H}`} role="img" aria-label="24h throughput and wait time">
        {gridY.map((g) => (
          <line key={g} x1={PAD.l} x2={CHART_W - PAD.r} y1={PAD.t + g * ih} y2={PAD.t + g * ih} className="ts-grid" />
        ))}
        {gridY.map((g) => (
          <text key={`l${g}`} x={PAD.l - 6} y={PAD.t + g * ih + 4} className="ts-axis-l" textAnchor="end">
            {Math.round(maxThr * (1 - g))}
          </text>
        ))}
        {gridY.map((g) => (
          <text key={`r${g}`} x={CHART_W - PAD.r + 6} y={PAD.t + g * ih + 4} className="ts-axis-r" textAnchor="start">
            {Math.round(maxWait * (1 - g))}
          </text>
        ))}
        <path d={thrArea} className="ts-area" />
        <polyline points={thrLine} className="ts-line-thr" fill="none" />
        <polyline points={waitLine} className="ts-line-wait" fill="none" />
        {pts.map((p, i) =>
          i % tickEvery === 0 || i === pts.length - 1 ? (
            <text key={p.ts} x={x(i)} y={CHART_H - 8} className="ts-axis-x" textAnchor="middle">
              {tFmt(p.ts)}
            </text>
          ) : null,
        )}
      </svg>
      <div className="map-legend">
        <span className="legend-item"><span className="legend-dot" style={{ background: "var(--india-green)" }} />Throughput (PCU served)</span>
        <span className="legend-item"><span className="legend-dot" style={{ background: "var(--warn)" }} />Avg. wait (s)</span>
        <span className="muted" style={{ fontSize: 12 }}>
          {series && series.samples > 0
            ? `${series.samples} cycles · ${series.bucketMinutes}-min buckets${series.coveredFrom ? ` · ${tFmt(series.coveredFrom)}–${tFmt(series.coveredTo!)}` : ""}`
            : "available window"}
        </span>
      </div>
    </>
  );
}

// ── small system-health sparklines ───────────────────────────────────────────
function SparkCard({
  label,
  points,
  accent,
  last,
  suffix = "",
}: {
  label: string;
  points: number[];
  accent: string;
  last?: number;
  suffix?: string;
}) {
  return (
    <section className="card spark-card">
      <span className="spark-label">{label}</span>
      <span className="spark-value" style={{ color: accent }}>
        {last ?? "—"}
        {last !== undefined ? suffix : ""}
      </span>
      <Sparkline points={points} accent={accent} />
    </section>
  );
}

function Sparkline({ points, accent }: { points: number[]; accent: string }) {
  if (points.length < 2) return <div className="spark-empty" />;
  const w = 180;
  const h = 40;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min || 1;
  const x = (i: number) => (i / (points.length - 1)) * w;
  const y = (v: number) => h - 2 - ((v - min) / span) * (h - 4);
  const line = points.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const area = `M 0,${h} L ${points.map((v, i) => `${x(i)},${y(v)}`).join(" L ")} L ${w},${h} Z`;
  return (
    <svg className="sparkline" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      <path d={area} fill={accent} opacity={0.12} />
      <polyline points={line} fill="none" stroke={accent} strokeWidth={2} />
    </svg>
  );
}
