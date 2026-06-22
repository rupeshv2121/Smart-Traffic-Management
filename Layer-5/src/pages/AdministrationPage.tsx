import { useCallback, useEffect, useState } from "react";

import { AuditTrail } from "../components/AuditTrail";
import { StatCard } from "../components/StatCard";
import { ROLE_META } from "../types/auth";
import {
  getAnalytics,
  getAudit,
  getRegistry,
  type AnalyticsAggregate,
  type AppUser,
  type AuditEntry,
  type EdgeNode,
  type NodeStatus,
  type Zone,
} from "../lib/api";
import {
  EDGE_NODES,
  USERS,
  ZONES,
} from "../lib/mockData";

const NODE_PILL: Record<NodeStatus, string> = {
  ONLINE: "ok",
  DEGRADED: "warn",
  OFFLINE: "crit",
};

export function AdministrationPage() {
  const [analytics, setAnalytics] = useState<AnalyticsAggregate | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [edgeNodes, setEdgeNodes] = useState<EdgeNode[]>(EDGE_NODES as EdgeNode[]);
  const [users, setUsers] = useState<AppUser[]>(USERS as AppUser[]);
  const [zones, setZones] = useState<Zone[]>(ZONES);

  const refresh = useCallback(async () => {
    try {
      const [a, log, reg] = await Promise.all([getAnalytics(), getAudit(60), getRegistry()]);
      setAnalytics(a);
      setAudit(log.entries);
      if (reg.edgeNodes.length) setEdgeNodes(reg.edgeNodes);
      if (reg.users.length) setUsers(reg.users);
      if (reg.zones.length) setZones(reg.zones);
    } catch {
      /* gateway offline — keep last known (mock fallback) */
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 8000);
    return () => clearInterval(id);
  }, [refresh]);

  const nodesOnline = edgeNodes.filter((n) => n.status === "ONLINE").length;
  const activeUsers = users.filter((u) => u.status === "ACTIVE").length;

  return (
    <>
      <div className="cols cols-4 mb-20">
        <StatCard
          label="Edge nodes online"
          value={`${nodesOnline}/${EDGE_NODES.length}`}
          foot="Across all zones"
          accent="green"
        />
        <StatCard label="Active users" value={activeUsers} foot={`${users.length} provisioned`} accent="blue" />
        <StatCard label="Zones" value={zones.length} foot="Operational regions" accent="saffron" />
        <StatCard
          label="Cycles logged"
          value={analytics?.cycles ?? 0}
          foot={analytics ? `Safety ${analytics.safetyPassRate ?? 0}%` : "Gateway offline"}
          accent="blue"
        />
      </div>

      <div className="cols cols-2 mb-20">
        <section className="card">
          <h2 className="card-title">Edge Node Health</h2>
          <div className="matrix-scroll">
            <table className="matrix">
              <thead>
                <tr>
                  <th>Node</th>
                  <th>Zone</th>
                  <th className="num">CPU</th>
                  <th className="num">Uptime</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {edgeNodes.map((n) => (
                  <tr key={n.id}>
                    <td>
                      <span className="jx-code">{n.id}</span>
                      <span className="jx-name">{n.name}</span>
                    </td>
                    <td>{n.zone}</td>
                    <td className="num mono">{n.cpuPct}%</td>
                    <td className="num mono">{n.uptimePct}%</td>
                    <td>
                      <span className={`pill ${NODE_PILL[n.status]}`}>{n.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card">
          <h2 className="card-title">Zones</h2>
          <div className="zone-grid">
            {zones.map((z) => (
              <div key={z.id} className="zone-cell">
                <div className="zone-name">{z.name}</div>
                <div className="zone-stats">
                  <span>
                    <strong>{z.junctions}</strong> junctions
                  </span>
                  <span>
                    <strong>{z.nodes}</strong> nodes
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="card span-all mb-20">
        <h2 className="card-title">Users &amp; Roles</h2>
        <div className="matrix-scroll">
          <table className="matrix">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Zone</th>
                <th>Last seen</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <span className="jx-code">{u.id}</span>
                    <span className="jx-name">{u.name}</span>
                  </td>
                  <td>
                    {ROLE_META[u.role].icon} {ROLE_META[u.role].label}
                  </td>
                  <td>{u.zone}</td>
                  <td className="nowrap">{new Date(u.lastSeen).toLocaleString("en-IN")}</td>
                  <td>
                    <span className={`pill ${u.status === "ACTIVE" ? "ok" : "crit"}`}>
                      {u.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="cols">
        <AuditTrail entries={audit} title="System Audit Trail" max={40} />
      </div>
    </>
  );
}
