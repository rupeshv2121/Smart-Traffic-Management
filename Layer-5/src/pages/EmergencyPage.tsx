import { useEffect, useRef, useState, type FormEvent } from "react";

import { EmergencyBanner } from "../components/EmergencyBanner";
import { EmptyState } from "../components/EmptyState";
import { JunctionDiagram } from "../components/JunctionDiagram";
import { StatCard } from "../components/StatCard";
import { useStream } from "../context/StreamContext";
import { dispatchEmv, type PhaseId } from "../lib/api";

type EmvState = "IDLE" | "CORRIDOR_ACTIVE" | "CONFLICT" | "ARRIVED";
const PHASES: PhaseId[] = ["NORTH", "SOUTH", "EAST", "WEST"];
const PRIORITIES = ["CRITICAL", "HIGH", "NORMAL"] as const;

interface RunSummary {
  emvId: string;
  phase: string;
  etaSeconds: number;
  cyclesHeld: number;
  estTimeSavedS: number;
}

export function EmergencyPage() {
  const { latest, history, connection } = useStream();

  const [phase, setPhase] = useState<PhaseId>("EAST");
  const [eta, setEta] = useState(35);
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>("CRITICAL");
  const [dispatching, setDispatching] = useState(false);
  const [conflict, setConflict] = useState<{ emvId: string; priorityClass: string } | null>(null);
  const [lastRun, setLastRun] = useState<RunSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const emergency = latest?.emergency ?? null;
  const prevEmv = useRef<typeof emergency>(null);

  // Detect corridor end (active → cleared) to produce an ARRIVED run summary.
  useEffect(() => {
    if (emergency) {
      setConflict(null);
      setDispatching(false);
      prevEmv.current = emergency;
    } else if (prevEmv.current) {
      const done = prevEmv.current;
      const cyclesHeld = history.filter((h) => h.emergency?.emvId === done.emvId).length || 1;
      setLastRun({
        emvId: done.emvId,
        phase: done.targetPhaseId,
        etaSeconds: done.etaSeconds,
        cyclesHeld,
        estTimeSavedS: Math.round(done.etaSeconds * 0.4),
      });
      prevEmv.current = null;
    }
  }, [emergency, history]);

  if (!latest) return <EmptyState connection={connection} />;

  const state: EmvState = emergency
    ? "CORRIDOR_ACTIVE"
    : conflict
      ? "CONFLICT"
      : lastRun
        ? "ARRIVED"
        : "IDLE";

  async function dispatch(e: FormEvent) {
    e.preventDefault();
    setDispatching(true);
    setError(null);
    setLastRun(null);
    try {
      const res = await dispatchEmv({ targetPhaseId: phase, etaSeconds: eta, priorityClass: priority });
      if (res.conflict && res.active) {
        setConflict(res.active);
        setDispatching(false);
      } else if (!res.ok) {
        setError(res.error ?? "Dispatch rejected.");
        setDispatching(false);
      }
      // On success we keep "dispatching" until the corridor appears in the feed.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dispatch failed (dispatcher role required).");
      setDispatching(false);
    }
  }

  const STATE_META: Record<EmvState, { label: string; pill: string }> = {
    IDLE: { label: "IDLE", pill: "ok" },
    CORRIDOR_ACTIVE: { label: "CORRIDOR ACTIVE", pill: "crit" },
    CONFLICT: { label: "CONFLICT", pill: "warn" },
    ARRIVED: { label: "ARRIVED", pill: "info" },
  };

  return (
    <>
      <div className="emv-state-bar mb-20">
        <span className="esb-label">EMVS State</span>
        <span className={`pill ${STATE_META[state].pill}`}>{STATE_META[state].label}</span>
        {dispatching && !emergency && (
          <span className="esb-note">Dispatched — corridor opens on the next cycle…</span>
        )}
      </div>

      {error && (
        <div className="notice-bar error mb-20">
          <span aria-hidden>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {state === "CORRIDOR_ACTIVE" && emergency && (
        <>
          <div className="mb-20">
            <EmergencyBanner emv={emergency} />
          </div>
          <div className="cols cols-4 mb-20">
            <StatCard label="Vehicle ID" value={emergency.emvId} accent="danger" />
            <StatCard label="Priority class" value={emergency.priorityClass} accent="danger" />
            <StatCard label="ETA to junction" value={`${emergency.etaSeconds}s`} accent="saffron" />
            <StatCard label="Corridor phase" value={emergency.targetPhaseId} foot={`${latest.decision.durationSeconds}s green held`} accent="green" />
          </div>
          <div className="cols cols-2 mb-20">
            <section className="card">
              <h2 className="card-title">Corridor Phase</h2>
              <JunctionDiagram junctionId={latest.junctionId} approaches={latest.perception.approaches} />
            </section>
            <section className="card">
              <h2 className="card-title">Trust &amp; Safety Gate</h2>
              <div className="kv"><span className="k">Token accepted</span><span className="pill ok">✓ Verified</span></div>
              <div className="kv"><span className="k">Corridor mode</span><span className="pill mode-GREEN_CORRIDOR">{latest.decision.executionMode}</span></div>
              <div className="kv">
                <span className="k">Safety supervisor</span>
                <span className={`pill ${latest.decision.safetyValidationPassed ? "ok" : "fail"}`}>
                  {latest.decision.safetyValidationPassed ? "✓ Safe sequencing" : "✕ Blocked"}
                </span>
              </div>
              <div className="kv">
                <span className="k">Clearances</span>
                <span className="v">Yellow {latest.decision.clearanceIntervals.yellowSeconds}s · All-red {latest.decision.clearanceIntervals.allRedSeconds}s</span>
              </div>
            </section>
          </div>
          <section className="card">
            <h2 className="card-title">Decision Chain · Audit Trail</h2>
            <ol className="reasons">
              {latest.decision.reasonChain.map((r, i) => (
                <li key={i}><span className="idx">{i + 1}</span><span>{r}</span></li>
              ))}
            </ol>
          </section>
        </>
      )}

      {state !== "CORRIDOR_ACTIVE" && (
        <div className="cols cols-2 mb-20">
          <section className="card">
            <h2 className="card-title">Dispatch Green Corridor</h2>
            <form onSubmit={dispatch} className="override-form">
              <label className="field-label">Target phase</label>
              <div className="phase-picker">
                {PHASES.map((p) => (
                  <button type="button" key={p} className={`phase-btn ${phase === p ? "active" : ""}`} onClick={() => setPhase(p)}>{p}</button>
                ))}
              </div>
              <label className="field-label" htmlFor="eta">ETA to junction — {eta}s</label>
              <input id="eta" type="range" min={10} max={90} step={5} value={eta} onChange={(e) => setEta(Number(e.target.value))} />
              <label className="field-label">Priority class</label>
              <div className="phase-picker" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
                {PRIORITIES.map((p) => (
                  <button type="button" key={p} className={`phase-btn ${priority === p ? "active" : ""}`} onClick={() => setPriority(p)}>{p}</button>
                ))}
              </div>
              <button type="submit" className="btn btn-primary" disabled={dispatching}>
                {dispatching ? "Dispatching…" : `Dispatch ${priority} EMV → ${phase}`}
              </button>
            </form>
          </section>

          <section className="card">
            {state === "CONFLICT" && conflict ? (
              <>
                <h2 className="card-title">Priority Conflict</h2>
                <div className="emv-conflict">
                  <p className="oa-line">
                    A corridor for <strong>{conflict.emvId}</strong> ({conflict.priorityClass}) is
                    already active and outranks or matches your request.
                  </p>
                  <p className="oa-reason">
                    Conflict resolution: the higher priority class holds the corridor. Raise
                    the priority class to preempt, or wait for the active corridor to clear.
                  </p>
                  <button className="btn btn-ghost" onClick={() => setConflict(null)}>Dismiss</button>
                </div>
              </>
            ) : state === "ARRIVED" && lastRun ? (
              <>
                <h2 className="card-title">Corridor Complete · Run Summary</h2>
                <div className="kv"><span className="k">Vehicle</span><span className="v">{lastRun.emvId}</span></div>
                <div className="kv"><span className="k">Corridor phase</span><span className="v">{lastRun.phase}</span></div>
                <div className="kv"><span className="k">Cycles held</span><span className="v">{lastRun.cyclesHeld}</span></div>
                <div className="kv"><span className="k">Declared ETA</span><span className="v">{lastRun.etaSeconds}s</span></div>
                <div className="kv"><span className="k">Est. time saved</span><span className="v">≈ {lastRun.estTimeSavedS}s</span></div>
                <p className="muted" style={{ marginTop: 12, fontSize: 13 }}>Estimated vs. uncoordinated signals; collateral delay to cross traffic is logged to the audit trail.</p>
                <button className="btn btn-ghost" style={{ marginTop: 12 }} onClick={() => setLastRun(null)}>Clear</button>
              </>
            ) : (
              <>
                <h2 className="card-title">Status</h2>
                <div className="empty" style={{ padding: "24px 0" }}>
                  <div className="big">🟢 No active emergency corridor</div>
                  <p className="muted">
                    Dispatch a signed, GPS-verified corridor with the form. The junction
                    verifies the Ed25519 token before any green is granted.
                  </p>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}
