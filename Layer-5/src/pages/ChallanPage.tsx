import { useCallback, useEffect, useMemo, useState } from "react";

import { StatCard } from "../components/StatCard";
import {
  getChallans,
  issueChallan,
  rejectChallan,
  type Challan,
  type ChallanStatus,
} from "../lib/api";
import { CHALLANS as MOCK_CHALLANS, VIOLATION_LABEL } from "../lib/mockData";

const STATUS_PILL: Record<ChallanStatus, string> = {
  PENDING: "warn",
  ISSUED: "ok",
  REJECTED: "crit",
};

export function ChallanPage() {
  const [challans, setChallans] = useState<Challan[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { challans: live } = await getChallans();
      setChallans(live);
      setOffline(false);
    } catch {
      // Gateway down — fall back to the bundled demo dataset (read-only).
      setChallans(MOCK_CHALLANS as Challan[]);
      setOffline(true);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 10000);
    return () => clearInterval(id);
  }, [load]);

  const selected = useMemo(() => {
    const byId = selectedId && challans.find((c) => c.id === selectedId);
    return byId || challans.find((c) => c.status === "PENDING") || challans[0] || null;
  }, [challans, selectedId]);

  async function resolve(id: string, action: "issue" | "reject") {
    setBusy(true);
    setError(null);
    try {
      if (action === "issue") await issueChallan(id);
      else await rejectChallan(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  const pending = challans.filter((c) => c.status === "PENDING").length;
  const issued = challans.filter((c) => c.status === "ISSUED");
  const rejected = challans.filter((c) => c.status === "REJECTED").length;
  const finesIssued = issued.reduce((s, c) => s + c.fineRupees, 0);

  return (
    <>
      <div className={`notice-bar mb-20 ${offline ? "error" : ""}`}>
        <span aria-hidden>🧾</span>
        <span>
          {offline
            ? "Gateway offline — showing bundled demo violations (read-only)."
            : "Violations captured from ANPR plate events (Layer 2). Review evidence, then issue or reject — decisions persist to the audit trail."}
        </span>
      </div>
      {error && (
        <div className="notice-bar error mb-20">
          <span aria-hidden>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      <div className="cols cols-4 mb-20">
        <StatCard label="Pending review" value={pending} foot="Awaiting inspector" accent="saffron" />
        <StatCard label="Issued" value={issued.length} foot="Persisted" accent="green" />
        <StatCard label="Rejected" value={rejected} foot="Insufficient evidence" accent="danger" />
        <StatCard label="Fines issued" value={`₹ ${finesIssued.toLocaleString("en-IN")}`} foot="Total" accent="blue" />
      </div>

      <div className="cols cols-2">
        <section className="card">
          <h2 className="card-title">Violation Queue</h2>
          <ul className="challan-queue">
            {challans.map((c) => (
              <li
                key={c.id}
                className={`challan-row ${c.id === selected?.id ? "active" : ""}`}
                onClick={() => setSelectedId(c.id)}
              >
                <div className="cr-main">
                  <span className="cr-plate mono">{c.plate}</span>
                  <span className="cr-viol">{VIOLATION_LABEL[c.violation]}</span>
                </div>
                <div className="cr-meta">
                  {c.junctionCode} · {new Date(c.ts).toLocaleTimeString()}
                </div>
                <span className={`pill ${STATUS_PILL[c.status]}`}>{c.status}</span>
              </li>
            ))}
          </ul>
        </section>

        {selected ? (
          <section className="card">
            <h2 className="card-title">Evidence · {selected.id}</h2>
            <div className="anpr-frame">
              <div className="anpr-scanline" aria-hidden />
              <div className="anpr-plate mono">{selected.plate}</div>
              <div className="anpr-tag">ANPR CAPTURE · {selected.junctionCode}</div>
            </div>

            <div className="kv">
              <span className="k">Violation</span>
              <span className="v">{VIOLATION_LABEL[selected.violation]}</span>
            </div>
            <div className="kv">
              <span className="k">Junction</span>
              <span className="v">{selected.junctionName}</span>
            </div>
            <div className="kv">
              <span className="k">Captured</span>
              <span className="v">{new Date(selected.ts).toLocaleString("en-IN")}</span>
            </div>
            {selected.speedKmph != null && (
              <div className="kv">
                <span className="k">Recorded speed</span>
                <span className="v">{selected.speedKmph} km/h</span>
              </div>
            )}
            <div className="kv">
              <span className="k">ANPR confidence</span>
              <span className="v">{Math.round(selected.confidence * 100)}%</span>
            </div>
            <div className="kv">
              <span className="k">Proposed fine</span>
              <span className="v">₹ {selected.fineRupees.toLocaleString("en-IN")}</span>
            </div>

            {selected.status === "PENDING" && !offline ? (
              <div className="challan-actions">
                <button className="btn btn-primary" disabled={busy} onClick={() => resolve(selected.id, "issue")}>
                  Approve &amp; issue ₹{selected.fineRupees.toLocaleString("en-IN")}
                </button>
                <button className="btn btn-ghost" disabled={busy} onClick={() => resolve(selected.id, "reject")}>
                  Reject
                </button>
              </div>
            ) : (
              <p className="feed-empty" style={{ marginTop: 16 }}>
                {offline
                  ? "Sign-in to a live gateway to issue or reject."
                  : `This challan has been ${selected.status.toLowerCase()}${selected.resolvedBy ? ` by ${selected.resolvedBy}` : ""}.`}
              </p>
            )}
          </section>
        ) : (
          <section className="card">
            <p className="feed-empty">No violations in the queue.</p>
          </section>
        )}
      </div>
    </>
  );
}
