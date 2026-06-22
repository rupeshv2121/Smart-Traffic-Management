// ============================================================
// mockData.ts — structured demo datasets for screens with no live feed yet.
//
// Challans, edge nodes, users, zones and corridor compliance are not yet
// streamed by Layer-3 (no ANPR ingest / device registry exists). These mirror
// the shapes those feeds will take, so the screens are real and demoable now
// and swap to live data later with no component changes. CLEARLY MOCK.
// ============================================================

import type { Role } from "../types/auth";

const minsAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

// ── Challans (traffic violations) ────────────────────────────
export type ViolationType =
  | "RED_LIGHT"
  | "NO_HELMET"
  | "WRONG_LANE"
  | "SPEEDING"
  | "STOP_LINE";

export type ChallanStatus = "PENDING" | "ISSUED" | "REJECTED";

export interface Challan {
  id: string;
  plate: string;
  junctionCode: string;
  junctionName: string;
  violation: ViolationType;
  ts: string;
  speedKmph?: number;
  fineRupees: number;
  status: ChallanStatus;
  confidence: number;
}

export const VIOLATION_LABEL: Record<ViolationType, string> = {
  RED_LIGHT: "Red-light jump",
  NO_HELMET: "No helmet",
  WRONG_LANE: "Wrong lane",
  SPEEDING: "Over-speeding",
  STOP_LINE: "Stop-line crossing",
};

export const CHALLANS: Challan[] = [
  { id: "CH-24817", plate: "DL3CAB1234", junctionCode: "JN-ITO", junctionName: "ITO Crossing", violation: "RED_LIGHT", ts: minsAgo(4), fineRupees: 1000, status: "PENDING", confidence: 0.94 },
  { id: "CH-24816", plate: "DL8SBC9087", junctionCode: "JN-CP", junctionName: "Connaught Place", violation: "NO_HELMET", ts: minsAgo(9), fineRupees: 1000, status: "PENDING", confidence: 0.88 },
  { id: "CH-24815", plate: "HR26DK5521", junctionCode: "JN-AIIMS", junctionName: "AIIMS Crossing", violation: "SPEEDING", ts: minsAgo(13), speedKmph: 78, fineRupees: 2000, status: "PENDING", confidence: 0.91 },
  { id: "CH-24814", plate: "DL1CAA4412", junctionCode: "JN-MH", junctionName: "Mandi House", violation: "STOP_LINE", ts: minsAgo(21), fineRupees: 500, status: "PENDING", confidence: 0.83 },
  { id: "CH-24813", plate: "UP14BT2390", junctionCode: "JN-ASH", junctionName: "Ashram Chowk", violation: "WRONG_LANE", ts: minsAgo(28), fineRupees: 1500, status: "PENDING", confidence: 0.79 },
  { id: "CH-24812", plate: "DL5SBN1102", junctionCode: "JN-DK", junctionName: "Dhaula Kuan", violation: "RED_LIGHT", ts: minsAgo(36), fineRupees: 1000, status: "ISSUED", confidence: 0.96 },
  { id: "CH-24811", plate: "DL9CAF7781", junctionCode: "JN-MC", junctionName: "Moolchand", violation: "SPEEDING", ts: minsAgo(52), speedKmph: 71, fineRupees: 2000, status: "REJECTED", confidence: 0.62 },
  { id: "CH-24810", plate: "DL3CXY5566", junctionCode: "JN-PB", junctionName: "Punjabi Bagh Chowk", violation: "NO_HELMET", ts: minsAgo(67), fineRupees: 1000, status: "ISSUED", confidence: 0.9 },
];

// ── Edge nodes ───────────────────────────────────────────────
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

export const EDGE_NODES: EdgeNode[] = [
  { id: "EN-118", name: "ITO Edge", zone: "Central", status: "ONLINE", lastHeartbeat: minsAgo(0), junctionsServed: 3, cpuPct: 47, uptimePct: 99.8 },
  { id: "EN-119", name: "CP Edge", zone: "New Delhi", status: "ONLINE", lastHeartbeat: minsAgo(0), junctionsServed: 4, cpuPct: 61, uptimePct: 99.6 },
  { id: "EN-120", name: "South Ring Edge", zone: "South", status: "DEGRADED", lastHeartbeat: minsAgo(2), junctionsServed: 5, cpuPct: 88, uptimePct: 97.1 },
  { id: "EN-121", name: "Dhaula Kuan Edge", zone: "South West", status: "ONLINE", lastHeartbeat: minsAgo(0), junctionsServed: 2, cpuPct: 39, uptimePct: 99.9 },
  { id: "EN-122", name: "Ashram Edge", zone: "South East", status: "OFFLINE", lastHeartbeat: minsAgo(34), junctionsServed: 3, cpuPct: 0, uptimePct: 91.4 },
  { id: "EN-123", name: "West Corridor Edge", zone: "West", status: "ONLINE", lastHeartbeat: minsAgo(1), junctionsServed: 4, cpuPct: 54, uptimePct: 99.2 },
];

// ── Users ────────────────────────────────────────────────────
export interface AppUser {
  id: string;
  name: string;
  role: Role;
  zone: string;
  status: "ACTIVE" | "SUSPENDED";
  lastSeen: string;
}

export const USERS: AppUser[] = [
  { id: "NCT-OPS-ADM", name: "System Administrator", role: "ADMIN", zone: "All", status: "ACTIVE", lastSeen: minsAgo(0) },
  { id: "NCT-OPS-OPR", name: "Signal Operator", role: "OPERATOR", zone: "Central", status: "ACTIVE", lastSeen: minsAgo(3) },
  { id: "NCT-OPS-INS", name: "Enforcement Inspector", role: "INSPECTOR", zone: "South", status: "ACTIVE", lastSeen: minsAgo(12) },
  { id: "NCT-OPS-DSP", name: "Emergency Dispatcher", role: "DISPATCHER", zone: "New Delhi", status: "ACTIVE", lastSeen: minsAgo(1) },
  { id: "NCT-OPS-OP2", name: "R. Sharma", role: "OPERATOR", zone: "West", status: "ACTIVE", lastSeen: minsAgo(48) },
  { id: "NCT-OPS-IN2", name: "P. Mehta", role: "INSPECTOR", zone: "South East", status: "SUSPENDED", lastSeen: minsAgo(2880) },
];

// ── Zones ────────────────────────────────────────────────────
export interface Zone {
  id: string;
  name: string;
  junctions: number;
  nodes: number;
}

export const ZONES: Zone[] = [
  { id: "Z-CEN", name: "Central", junctions: 18, nodes: 6 },
  { id: "Z-ND", name: "New Delhi", junctions: 22, nodes: 7 },
  { id: "Z-S", name: "South", junctions: 26, nodes: 8 },
  { id: "Z-W", name: "West", junctions: 14, nodes: 5 },
];

// ── Corridor (for TI compliance) ─────────────────────────────
export interface CorridorStop {
  code: string;
  name: string;
  expectedGreenS: number;
}

export interface CorridorDef {
  name: string;
  stops: CorridorStop[];
}

// BSZ Marg corridor (Bahadur Shah Zafar Marg), per the project overview.
export const CORRIDOR: CorridorDef = {
  name: "BSZ Marg Corridor",
  stops: [
    { code: "JN-ITO", name: "ITO Crossing", expectedGreenS: 45 },
    { code: "JN-MH", name: "Mandi House", expectedGreenS: 38 },
    { code: "JN-CP", name: "Connaught Place", expectedGreenS: 42 },
    { code: "JN-IG", name: "India Gate C-Hexagon", expectedGreenS: 35 },
  ],
};
