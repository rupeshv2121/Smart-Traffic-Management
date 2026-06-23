import { useCallback, useEffect, useState, type FormEvent } from "react";

import { AuditTrail } from "../components/AuditTrail";
import { AlertTriangle, Info } from "../components/icons/AppIcons";
import { useStream } from "../context/StreamContext";
import {
  clearOverride,
  getAudit,
  getControlState,
  requestOverride,
  type AuditEntry,
  type ManualOverride,
  type PhaseId,
} from "../lib/api";

const PHASES: PhaseId[] = ["NORTH", "SOUTH", "EAST", "WEST"];

export function SignalControlPage() {
  const { latest } = useStream();

  const [override, setOverride] = useState<ManualOverride | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [phaseId, setPhaseId] = useState<PhaseId>("NORTH");
  const [duration, setDuration] = useState(30);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [state, log] = await Promise.all([getControlState(), getAudit(40)]);
      setOverride(state.override);
      setAudit(log.entries);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cannot reach the control gateway.");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 5000);
    return () => clearInterval(id);
  }, [refresh]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await requestOverride({
        phaseId,
        durationSeconds: duration,
        reason: reason.trim() || "manual phase override",
      });
      setReason("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Override rejected.");
    } finally {
      setBusy(false);
    }
  }

  async function handleClear() {
    setBusy(true);
    try {
      await clearOverride();
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const secondsLeft = override
    ? Math.max(0, Math.round((override.expiresAt - Date.now()) / 1000))
    : 0;

  return (
    <>
      <div className="notice-bar mb-20">
        <span aria-hidden><Info size={18} /></span>
        <span>
          Manual overrides hold a single green phase with enforced clearance intervals.
          They expire automatically and are <strong>always superseded by an active
          emergency corridor</strong>. Every action is written to the immutable audit trail.
        </span>
      </div>

      {error && (
        <div className="notice-bar error mb-20">
          <span aria-hidden><AlertTriangle size={18} /></span>
          <span>{error}</span>
        </div>
      )}

      <div className="cols cols-2 mb-20">
        <section className="card">
          <h2 className="card-title">Issue Manual Override</h2>
          <form onSubmit={submit} className="override-form">
            <label className="field-label">Target phase</label>
            <div className="phase-picker">
              {PHASES.map((p) => (
                <button
                  type="button"
                  key={p}
                  className={`phase-btn ${phaseId === p ? "active" : ""}`}
                  onClick={() => setPhaseId(p)}
                >
                  {p}
                </button>
              ))}
            </div>

            <label className="field-label" htmlFor="dur">
              Hold duration — {duration}s
            </label>
            <input
              id="dur"
              type="range"
              min={10}
              max={120}
              step={5}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
            />

            <label className="field-label" htmlFor="reason">
              Reason (logged)
            </label>
            <input
              id="reason"
              type="text"
              className="text-input"
              placeholder="e.g. clearing northbound spillback"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />

            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "Submitting…" : `Hold ${phaseId} green for ${duration}s`}
            </button>
          </form>
        </section>

        <section className="card">
          <h2 className="card-title">Current State</h2>
          <div className="kv">
            <span className="k">Live junction</span>
            <span className="v">{latest ? `${latest.code} · ${latest.name}` : "—"}</span>
          </div>
          <div className="kv">
            <span className="k">Active phase (live)</span>
            <span className="v">{latest?.decision.targetPhaseId ?? "—"}</span>
          </div>
          <div className="kv">
            <span className="k">Execution mode</span>
            <span className="v">{latest?.decision.executionMode ?? "—"}</span>
          </div>

          {override ? (
            <div className="override-active">
              <div className="oa-head">
                <span className="pill warn">Override active</span>
                <span className="oa-timer mono">{secondsLeft}s left</span>
              </div>
              <p className="oa-line">
                Holding <strong>{override.phaseId}</strong> green — requested by{" "}
                {override.requestedBy}.
              </p>
              <p className="oa-reason">“{override.reason}”</p>
              <button type="button" className="btn btn-ghost" onClick={handleClear} disabled={busy}>
                Clear override
              </button>
            </div>
          ) : (
            <p className="feed-empty" style={{ marginTop: 16 }}>
              No manual override active — junction running on autonomous control.
            </p>
          )}
        </section>
      </div>

      <div className="cols">
        <AuditTrail entries={audit} title="Control Audit Trail" />
      </div>
    </>
  );
}
