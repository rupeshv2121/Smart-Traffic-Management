// Thin client for the Layer-3 gateway control + analytics + auth REST endpoints.
// Reads/writes go to GATEWAY_URL; the SSE stream stays in useSnapshotStream.
// Writes carry a Bearer JWT obtained from /auth/login (server enforces the role).

import { GATEWAY_URL } from "../config";

export type PhaseId = "NORTH" | "SOUTH" | "EAST" | "WEST";
export type Role = "ADMIN" | "OPERATOR" | "INSPECTOR" | "DISPATCHER";

// ── auth token (set by AuthContext after login) ──────────────
let authToken: string | null = null;
export function setAuthToken(token: string | null) {
  authToken = token;
}

export interface ManualOverride {
  phaseId: PhaseId;
  durationSeconds: number;
  requestedBy: string;
  reason: string;
  issuedAt: number;
  expiresAt: number;
}

export type AuditAction =
  | "DECISION"
  | "OVERRIDE_REQUESTED"
  | "OVERRIDE_APPLIED"
  | "OVERRIDE_DEFERRED"
  | "OVERRIDE_CLEARED"
  | "SAFETY_BLOCK"
  | "EMERGENCY";

export interface AuditEntry {
  id: string;
  ts: string;
  actor: string;
  action: AuditAction;
  junctionId: string;
  detail: string;
  outcome: "ok" | "blocked" | "info";
}

export interface AnalyticsAggregate {
  cycles: number;
  avgGreenSeconds?: number;
  avgVehiclesPerCycle?: number;
  safetyPassRate?: number;
  avgConfidencePct?: number;
  avgCongestionPct?: number;
  modeDistribution?: Record<string, number>;
  planDistribution?: Record<string, number>;
}

export type ViolationType = "RED_LIGHT" | "NO_HELMET" | "WRONG_LANE" | "SPEEDING" | "STOP_LINE";
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
  resolvedBy?: string;
  resolvedAt?: string;
}

export interface LoginResult {
  token: string;
  user: { sub: string; name: string; role: Role; iat: number; exp: number };
}

function authHeaders(): Record<string, string> {
  return authToken ? { authorization: `Bearer ${authToken}` } : {};
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${GATEWAY_URL}${path}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return (await res.json()) as T;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${GATEWAY_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data?.error ?? `POST ${path} → ${res.status}`);
  return data as T;
}

// ── auth ─────────────────────────────────────────────────────
export function login(role: Role): Promise<LoginResult> {
  return postJson("/auth/login", { role });
}
export function loginWithPassword(username: string, password: string): Promise<LoginResult> {
  return postJson("/auth/login", { username, password });
}
export function loginWithSso(email: string): Promise<LoginResult & { via?: string }> {
  return postJson("/auth/sso", { email });
}

// ── control ──────────────────────────────────────────────────
export function getControlState(): Promise<{ override: ManualOverride | null }> {
  return getJson("/control/state");
}
export function requestOverride(body: {
  phaseId: PhaseId;
  durationSeconds: number;
  reason: string;
}): Promise<{ ok: boolean; override: ManualOverride }> {
  return postJson("/control/override", body);
}
export function clearOverride(): Promise<{ ok: boolean }> {
  return postJson("/control/clear", {});
}

export interface DispatchResult {
  ok: boolean;
  token?: { emvId: string; targetPhaseId: string; priorityClass: string; etaSeconds: number };
  conflict?: boolean;
  active?: { emvId: string; priorityClass: string };
  error?: string;
}
export function dispatchEmv(body: {
  targetPhaseId: PhaseId;
  etaSeconds: number;
  priorityClass: "CRITICAL" | "HIGH" | "NORMAL";
  emvId?: string;
}): Promise<DispatchResult> {
  // 409 conflict is a normal outcome, not a thrown error — handle both.
  return fetch(`${GATEWAY_URL}/control/dispatch`, {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  }).then(async (res) => {
    const data = (await res.json().catch(() => ({}))) as DispatchResult;
    if (res.status === 409) return data; // conflict
    if (!res.ok) throw new Error(data?.error ?? `dispatch → ${res.status}`);
    return data;
  });
}

// ── audit / analytics ────────────────────────────────────────
export function getAudit(limit = 100): Promise<{ entries: AuditEntry[] }> {
  return getJson(`/audit?limit=${limit}`);
}
export function getAnalytics(): Promise<AnalyticsAggregate> {
  return getJson("/analytics");
}

// ── registry (edge nodes / users / zones) ────────────────────
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
export function getRegistry(): Promise<{ edgeNodes: EdgeNode[]; users: AppUser[]; zones: Zone[] }> {
  return getJson("/registry");
}

// ── challans ─────────────────────────────────────────────────
export function getChallans(): Promise<{ challans: Challan[] }> {
  return getJson("/challans");
}
export function issueChallan(id: string): Promise<{ ok: boolean; challan: Challan }> {
  return postJson(`/challans/${id}/issue`, {});
}
export function rejectChallan(id: string): Promise<{ ok: boolean; challan: Challan }> {
  return postJson(`/challans/${id}/reject`, {});
}
