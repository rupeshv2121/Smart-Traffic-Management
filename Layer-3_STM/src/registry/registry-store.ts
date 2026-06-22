// ============================================================
// registry-store.ts — durable edge-node / user / zone registry.
//
// Backs the Administration screen with real, persisted records (was a Layer-5
// mock). Edge-node heartbeats are refreshed by the live loop each cycle so the
// live node shows ONLINE with a fresh timestamp. Stored via the Persistence
// docs surface, so it works on both the file and Postgres adapters.
// ============================================================

import type { Role } from "../auth/jwt";
import type { Persistence } from "../persistence/persistence";

export type NodeStatus = "ONLINE" | "DEGRADED" | "OFFLINE";

export interface EdgeNode {
  id: string;
  name: string;
  zone: string;
  status: NodeStatus;
  lastHeartbeat: string;
  junctionsServed: number;
  cpuPct: number;
  uptimePct: number;
}
export interface AppUser {
  id: string;
  name: string;
  role: Role;
  zone: string;
  status: "ACTIVE" | "SUSPENDED";
  lastSeen: string;
}
export interface Zone {
  id: string;
  name: string;
  junctions: number;
  nodes: number;
}

const NODES_DOC = "edge_nodes.json";
const USERS_DOC = "app_users.json";
const ZONES_DOC = "zones.json";

const minsAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

export class RegistryStore {
  private nodes: EdgeNode[];
  private users: AppUser[];
  private zones: Zone[];

  constructor(private readonly persistence: Persistence) {
    this.nodes = persistence.readDoc<EdgeNode[]>(NODES_DOC, []);
    this.users = persistence.readDoc<AppUser[]>(USERS_DOC, []);
    this.zones = persistence.readDoc<Zone[]>(ZONES_DOC, []);
    if (this.nodes.length === 0) this.seedNodes();
    if (this.users.length === 0) this.seedUsers();
    if (this.zones.length === 0) this.seedZones();
  }

  public snapshot(): { edgeNodes: EdgeNode[]; users: AppUser[]; zones: Zone[] } {
    return { edgeNodes: this.nodes, users: this.users, zones: this.zones };
  }

  /** Mark a node ONLINE with a fresh heartbeat (called for the live edge node). */
  public touchHeartbeat(nodeId: string): void {
    const n = this.nodes.find((x) => x.id === nodeId);
    if (!n) return;
    n.lastHeartbeat = new Date().toISOString();
    if (n.status === "OFFLINE") n.status = "ONLINE";
    this.persistence.writeDoc(NODES_DOC, this.nodes);
  }

  private seedNodes(): void {
    this.nodes = [
      { id: "EN-118", name: "ITO Edge", zone: "Central", status: "ONLINE", lastHeartbeat: minsAgo(0), junctionsServed: 3, cpuPct: 47, uptimePct: 99.8 },
      { id: "EN-119", name: "CP Edge", zone: "New Delhi", status: "ONLINE", lastHeartbeat: minsAgo(0), junctionsServed: 4, cpuPct: 61, uptimePct: 99.6 },
      { id: "EN-120", name: "South Ring Edge", zone: "South", status: "DEGRADED", lastHeartbeat: minsAgo(2), junctionsServed: 5, cpuPct: 88, uptimePct: 97.1 },
      { id: "EN-121", name: "Dhaula Kuan Edge", zone: "South West", status: "ONLINE", lastHeartbeat: minsAgo(0), junctionsServed: 2, cpuPct: 39, uptimePct: 99.9 },
      { id: "EN-122", name: "Ashram Edge", zone: "South East", status: "OFFLINE", lastHeartbeat: minsAgo(34), junctionsServed: 3, cpuPct: 0, uptimePct: 91.4 },
      { id: "EN-123", name: "West Corridor Edge", zone: "West", status: "ONLINE", lastHeartbeat: minsAgo(1), junctionsServed: 4, cpuPct: 54, uptimePct: 99.2 },
    ];
    this.persistence.writeDoc(NODES_DOC, this.nodes);
  }
  private seedUsers(): void {
    this.users = [
      { id: "NCT-OPS-ADM", name: "System Administrator", role: "ADMIN", zone: "All", status: "ACTIVE", lastSeen: minsAgo(0) },
      { id: "NCT-OPS-OPR", name: "Signal Operator", role: "OPERATOR", zone: "Central", status: "ACTIVE", lastSeen: minsAgo(3) },
      { id: "NCT-OPS-INS", name: "Enforcement Inspector", role: "INSPECTOR", zone: "South", status: "ACTIVE", lastSeen: minsAgo(12) },
      { id: "NCT-OPS-DSP", name: "Emergency Dispatcher", role: "DISPATCHER", zone: "New Delhi", status: "ACTIVE", lastSeen: minsAgo(1) },
      { id: "NCT-OPS-OP2", name: "R. Sharma", role: "OPERATOR", zone: "West", status: "ACTIVE", lastSeen: minsAgo(48) },
      { id: "NCT-OPS-IN2", name: "P. Mehta", role: "INSPECTOR", zone: "South East", status: "SUSPENDED", lastSeen: minsAgo(2880) },
    ];
    this.persistence.writeDoc(USERS_DOC, this.users);
  }
  private seedZones(): void {
    this.zones = [
      { id: "Z-CEN", name: "Central", junctions: 18, nodes: 6 },
      { id: "Z-ND", name: "New Delhi", junctions: 22, nodes: 7 },
      { id: "Z-S", name: "South", junctions: 26, nodes: 8 },
      { id: "Z-W", name: "West", junctions: 14, nodes: 5 },
    ];
    this.persistence.writeDoc(ZONES_DOC, this.zones);
  }
}
