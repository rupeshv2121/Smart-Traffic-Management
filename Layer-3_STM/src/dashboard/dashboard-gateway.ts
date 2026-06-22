// ============================================================
// dashboard-gateway.ts — Layer 5 (Dashboard) live read-out API + control plane
//
// Reads (SSE + GET) are open so any dashboard can observe the junction. The
// write-paths — manual phase override, EMV dispatch, challan resolution — are
// guarded by server-side JWT + the role matrix (see auth/jwt.ts), so the React
// app's client-side guard is a convenience, not the security boundary.
//
// Routes:
//   GET  /events                 → SSE: snapshot + city
//   GET  /health                 → { status, clients, buffered }
//   POST /auth/login             → { token, user }            (role selection)
//   GET  /control/state          → { override }
//   POST /control/override        → manual phase override      [ADMIN, OPERATOR]
//   POST /control/clear          → clear override             [ADMIN, OPERATOR]
//   POST /control/dispatch        → dispatch EMV green corridor [ADMIN, DISPATCHER]
//   GET  /audit?limit=n          → recent audit (most recent first)
//   GET  /analytics              → aggregate KPIs
//   GET  /challans               → violation queue
//   POST /challans/:id/issue      → issue fine                 [ADMIN, INSPECTOR]
//   POST /challans/:id/reject     → reject                     [ADMIN, INSPECTOR]
// ============================================================

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { WebSocket, WebSocketServer } from "ws";

import type { AuthStore } from "../auth/auth-store";
import { claimsFromHeader, issueToken, issueTokenFor, type Role } from "../auth/jwt";
import { ALLOW_DEMO_LOGIN, ALLOW_SSO_STUB } from "../config";
import type { ChallanStore } from "../challan/challan-store";
import type { ControlChannel } from "../control/control-channel";
import { deriveFallbackPlans } from "../control/fallback";
import type { HotStore } from "../hotstore/hot-store";
import type { Persistence } from "../persistence/persistence";
import type { RegistryStore } from "../registry/registry-store";
import type { EmergencyToken, HistoricalTimingPlan } from "../types/types";
import type { CitySnapshot } from "./city";
import type { CycleSnapshot } from "./snapshot";

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization",
} as const;

const ANALYTICS_CAP = 240; // ≈ 2h at a 30s cycle

export interface DispatchParams {
  targetPhaseId: string;
  etaSeconds: number;
  priorityClass: "CRITICAL" | "HIGH" | "NORMAL";
  emvId?: string;
}
export type DispatchResult =
  | { ok: true; token: EmergencyToken }
  | { ok: false; conflict: true; active: { emvId: string; priorityClass: string } }
  | { ok: false; error: string };

export interface GatewayDeps {
  persistence?: Persistence;
  challans?: ChallanStore;
  registry?: RegistryStore;
  auth?: AuthStore;
  hotStore?: HotStore;
  dispatch?: (params: DispatchParams) => DispatchResult;
  fallbackDefaults?: HistoricalTimingPlan[];
  historySize?: number;
}

export class DashboardGateway {
  private server: Server | null = null;
  private wss: WebSocketServer | null = null;
  private wsClients = new Set<WebSocket>();
  private clients = new Set<ServerResponse>();
  private history: CycleSnapshot[] = [];
  private analyticsHistory: CycleSnapshot[] = [];
  private latestCity: CitySnapshot | null = null;

  private readonly persistence: Persistence | undefined;
  private readonly challans: ChallanStore | undefined;
  private readonly registry: RegistryStore | undefined;
  private readonly auth: AuthStore | undefined;
  private readonly hotStore: HotStore | undefined;
  private readonly dispatch: ((params: DispatchParams) => DispatchResult) | undefined;
  private readonly fallbackDefaults: HistoricalTimingPlan[];
  private readonly historySize: number;
  private snapshotsTotal = 0;
  private cityTotal = 0;

  constructor(
    private readonly port: number,
    private readonly control: ControlChannel,
    deps: GatewayDeps = {},
  ) {
    this.persistence = deps.persistence;
    this.challans = deps.challans;
    this.registry = deps.registry;
    this.auth = deps.auth;
    this.hotStore = deps.hotStore;
    this.dispatch = deps.dispatch;
    this.fallbackDefaults = deps.fallbackDefaults ?? [];
    this.historySize = deps.historySize ?? 20;
    if (this.persistence) this.analyticsHistory = this.persistence.recentSnapshots(ANALYTICS_CAP);
  }

  public start(): Promise<void> {
    this.server = createServer((req, res) => void this.route(req, res));
    // WebSocket transport at ws://host:port/stream — same frames as SSE, as
    // JSON { event, data } messages. Reads only; writes stay on the REST plane.
    this.wss = new WebSocketServer({ server: this.server, path: "/stream" });
    this.wss.on("connection", (ws) => {
      this.wsClients.add(ws);
      for (const s of this.history) ws.send(this.wsFrame("snapshot", s));
      if (this.latestCity) ws.send(this.wsFrame("city", this.latestCity));
      ws.on("close", () => this.wsClients.delete(ws));
      ws.on("error", () => this.wsClients.delete(ws));
    });
    return new Promise((resolve) => this.server?.listen(this.port, () => resolve()));
  }

  private async route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = req.url ?? "/";
    const method = req.method ?? "GET";

    if (method === "OPTIONS") {
      res.writeHead(204, CORS_HEADERS);
      return void res.end();
    }

    // ── open reads ───────────────────────────────────────────
    if (method === "GET" && url.startsWith("/health")) {
      return this.json(res, 200, { status: "ok", clients: this.clients.size, buffered: this.history.length });
    }
    if (method === "GET" && url.startsWith("/events")) return this.handleSse(res);
    if (method === "GET" && url.startsWith("/control/state")) {
      return this.json(res, 200, this.control.state());
    }
    if (method === "GET" && url.startsWith("/audit")) {
      const limit = Number(new URL(url, "http://x").searchParams.get("limit") ?? 100);
      return this.json(res, 200, { entries: this.control.recentAudit(limit) });
    }
    if (method === "GET" && url.startsWith("/analytics")) {
      return this.json(res, 200, this.computeAnalytics());
    }
    if (method === "GET" && url.startsWith("/challans")) {
      return this.json(res, 200, { challans: this.challans?.list() ?? [] });
    }
    if (method === "GET" && url.startsWith("/registry")) {
      return this.json(res, 200, this.registry?.snapshot() ?? { edgeNodes: [], users: [], zones: [] });
    }
    if (method === "GET" && url.startsWith("/fallback-plan")) {
      const plans = deriveFallbackPlans(this.persistence?.recentSnapshots(2000) ?? [], this.fallbackDefaults);
      return this.json(res, 200, { plans });
    }
    if (method === "GET" && url.startsWith("/metrics")) {
      res.writeHead(200, { "content-type": "text/plain; version=0.0.4", ...CORS_HEADERS });
      return void res.end(this.renderMetrics());
    }

    // ── auth ─────────────────────────────────────────────────
    if (method === "POST" && url.startsWith("/auth/login")) {
      const body = await readJson(req).catch(() => ({}));
      // Real path: username + password verified against the user store.
      if (body?.username && body?.password) {
        const user = this.auth?.verify(String(body.username), String(body.password));
        if (!user) return this.json(res, 401, { error: "invalid credentials" });
        const { token, claims } = issueTokenFor(user.role, user.id, user.name);
        return this.json(res, 200, { token, user: claims });
      }
      // Demo path: passwordless role login (disabled when ALLOW_DEMO_LOGIN=false).
      if (body?.role) {
        if (!ALLOW_DEMO_LOGIN) return this.json(res, 403, { error: "password login required" });
        const role = String(body.role).toUpperCase() as Role;
        if (!["ADMIN", "OPERATOR", "INSPECTOR", "DISPATCHER"].includes(role)) {
          return this.json(res, 400, { error: "unknown role" });
        }
        const { token, claims } = issueToken(role);
        return this.json(res, 200, { token, user: claims });
      }
      return this.json(res, 400, { error: "username+password or role required" });
    }

    // SSO stub — stands in for an OIDC/SAML callback. A real IdP integration
    // validates the id_token/assertion; here we map the email to a role.
    if (method === "POST" && url.startsWith("/auth/sso")) {
      if (!ALLOW_SSO_STUB) return this.json(res, 403, { error: "SSO not configured" });
      const body = await readJson(req).catch(() => ({}));
      const email = String(body?.email ?? "").trim().toLowerCase();
      if (!email.includes("@")) return this.json(res, 400, { error: "email required" });
      const local = email.split("@")[0]!;
      const role: Role = /admin/.test(local)
        ? "ADMIN"
        : /inspect/.test(local)
          ? "INSPECTOR"
          : /dispatch|emv/.test(local)
            ? "DISPATCHER"
            : "OPERATOR";
      const { token, claims } = issueTokenFor(role, `SSO-${local}`, email);
      return this.json(res, 200, { token, user: claims, via: "sso-stub" });
    }

    // ── guarded writes ───────────────────────────────────────
    if (method === "POST" && url.startsWith("/control/override")) {
      const claims = this.authorize(req, res, ["ADMIN", "OPERATOR"]);
      if (!claims) return;
      try {
        const body = await readJson(req);
        const override = this.control.requestOverride({
          ...body,
          requestedBy: `${claims.name} (${claims.sub})`,
        });
        return this.json(res, 200, { ok: true, override });
      } catch (err) {
        return this.json(res, 400, { ok: false, error: errMsg(err) });
      }
    }
    if (method === "POST" && url.startsWith("/control/clear")) {
      const claims = this.authorize(req, res, ["ADMIN", "OPERATOR"]);
      if (!claims) return;
      this.control.clearOverride(`${claims.name} (${claims.sub})`);
      return this.json(res, 200, { ok: true });
    }
    if (method === "POST" && url.startsWith("/control/dispatch")) {
      const claims = this.authorize(req, res, ["ADMIN", "DISPATCHER"]);
      if (!claims) return;
      if (!this.dispatch) return this.json(res, 503, { ok: false, error: "dispatch unavailable" });
      try {
        const body = await readJson(req);
        const result = this.dispatch({
          targetPhaseId: String(body.targetPhaseId ?? "NORTH").toUpperCase(),
          etaSeconds: Number(body.etaSeconds ?? 30),
          priorityClass: (String(body.priorityClass ?? "CRITICAL").toUpperCase() as DispatchParams["priorityClass"]),
          emvId: body.emvId,
        });
        if (result.ok) {
          this.control.audit(`${claims.name} (${claims.sub})`, "EMERGENCY", "ok", `dispatched ${result.token.emvId} → ${result.token.targetPhaseId}`);
          return this.json(res, 200, { ok: true, token: result.token });
        }
        return this.json(res, 409, result);
      } catch (err) {
        return this.json(res, 400, { ok: false, error: errMsg(err) });
      }
    }

    // ── challan resolution ───────────────────────────────────
    const challanMatch = /^\/challans\/([^/]+)\/(issue|reject)/.exec(url);
    if (method === "POST" && challanMatch) {
      const claims = this.authorize(req, res, ["ADMIN", "INSPECTOR"]);
      if (!claims) return;
      if (!this.challans) return this.json(res, 503, { error: "challan store unavailable" });
      const [, id, action] = challanMatch as unknown as [string, string, "issue" | "reject"];
      const status = action === "issue" ? "ISSUED" : "REJECTED";
      const updated = this.challans.resolve(id, status, `${claims.name} (${claims.sub})`);
      if (!updated) return this.json(res, 404, { error: "challan not found" });
      this.control.audit(`${claims.name} (${claims.sub})`, "DECISION", action === "issue" ? "ok" : "info", `challan ${id} ${status.toLowerCase()} (${updated.plate})`);
      return this.json(res, 200, { ok: true, challan: updated });
    }

    return this.json(res, 404, { error: "not found" });
  }

  private authorize(req: IncomingMessage, res: ServerResponse, roles: Role[]) {
    let claims;
    try {
      claims = claimsFromHeader(req.headers.authorization);
    } catch (err) {
      this.json(res, 401, { error: errMsg(err) });
      return null;
    }
    if (!roles.includes(claims.role)) {
      this.json(res, 403, { error: `role ${claims.role} not permitted` });
      return null;
    }
    return claims;
  }

  public broadcast(snapshot: CycleSnapshot): void {
    this.history.push(snapshot);
    if (this.history.length > this.historySize) this.history.shift();
    this.analyticsHistory.push(snapshot);
    if (this.analyticsHistory.length > ANALYTICS_CAP) this.analyticsHistory.shift();
    this.persistence?.appendSnapshot(snapshot);
    this.hotStore?.setJunctionState(snapshot.junctionId, snapshot);
    this.snapshotsTotal++;
    const frame = this.frame("snapshot", snapshot);
    for (const client of this.clients) client.write(frame);
    const wsf = this.wsFrame("snapshot", snapshot);
    for (const ws of this.wsClients) if (ws.readyState === WebSocket.OPEN) ws.send(wsf);
  }

  public broadcastCity(city: CitySnapshot): void {
    this.latestCity = city;
    this.hotStore?.setCityState(city);
    this.cityTotal++;
    const frame = this.frame("city", city);
    for (const client of this.clients) client.write(frame);
    const wsf = this.wsFrame("city", city);
    for (const ws of this.wsClients) if (ws.readyState === WebSocket.OPEN) ws.send(wsf);
  }

  private renderMetrics(): string {
    const a = this.computeAnalytics() as Record<string, number>;
    const latest = this.analyticsHistory[this.analyticsHistory.length - 1];
    const lines = [
      "# HELP stm_snapshots_total Cycle snapshots broadcast.",
      "# TYPE stm_snapshots_total counter",
      `stm_snapshots_total ${this.snapshotsTotal}`,
      "# HELP stm_city_snapshots_total City snapshots broadcast.",
      "# TYPE stm_city_snapshots_total counter",
      `stm_city_snapshots_total ${this.cityTotal}`,
      "# HELP stm_sse_clients Connected SSE dashboards.",
      "# TYPE stm_sse_clients gauge",
      `stm_sse_clients ${this.clients.size}`,
      "# HELP stm_safety_pass_ratio Safety-validated cycles (0..1).",
      "# TYPE stm_safety_pass_ratio gauge",
      `stm_safety_pass_ratio ${((a.safetyPassRate ?? 0) / 100).toFixed(3)}`,
      "# HELP stm_avg_congestion_pct Mean congestion over the analytics window.",
      "# TYPE stm_avg_congestion_pct gauge",
      `stm_avg_congestion_pct ${a.avgCongestionPct ?? 0}`,
      "# HELP stm_live_congestion_score Latest live junction congestion (0..1).",
      "# TYPE stm_live_congestion_score gauge",
      `stm_live_congestion_score ${latest ? latest.congestionScore.toFixed(3) : 0}`,
      "# HELP stm_challans_total Challans in the queue.",
      "# TYPE stm_challans_total gauge",
      `stm_challans_total ${this.challans?.list().length ?? 0}`,
      "# HELP stm_audit_entries Recent audit entries retained.",
      "# TYPE stm_audit_entries gauge",
      `stm_audit_entries ${this.control.recentAudit(100000).length}`,
    ];
    return lines.join("\n") + "\n";
  }

  public stop(): void {
    for (const client of this.clients) client.end();
    this.clients.clear();
    for (const ws of this.wsClients) ws.close();
    this.wsClients.clear();
    this.wss?.close();
    this.wss = null;
    this.server?.close();
    this.server = null;
  }

  public get clientCount(): number {
    return this.clients.size;
  }

  private computeAnalytics() {
    const h = this.analyticsHistory;
    const n = h.length;
    if (n === 0) return { cycles: 0 };
    const sum = (f: (s: CycleSnapshot) => number) => h.reduce((acc, s) => acc + f(s), 0);
    const dist = (f: (s: CycleSnapshot) => string) => {
      const m: Record<string, number> = {};
      for (const s of h) m[f(s)] = (m[f(s)] ?? 0) + 1;
      return m;
    };
    return {
      cycles: n,
      avgGreenSeconds: Math.round(sum((s) => s.decision.durationSeconds) / n),
      avgVehiclesPerCycle: Math.round(sum((s) => s.perception.approaches.reduce((t, a) => t + a.totalVehicles, 0)) / n),
      safetyPassRate: Math.round((h.filter((s) => s.decision.safetyValidationPassed).length / n) * 100),
      avgConfidencePct: Math.round((sum((s) => s.perception.cvConfidenceScore) / n) * 100),
      avgCongestionPct: Math.round((sum((s) => s.congestionScore) / n) * 100),
      modeDistribution: dist((s) => s.decision.executionMode),
      planDistribution: dist((s) => s.decision.planType),
    };
  }

  private handleSse(res: ServerResponse): void {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
      ...CORS_HEADERS,
    });
    res.write(": connected\n\n");
    for (const snapshot of this.history) res.write(this.frame("snapshot", snapshot));
    if (this.latestCity) res.write(this.frame("city", this.latestCity));
    this.clients.add(res);
    res.on("close", () => this.clients.delete(res));
  }

  private json(res: ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { "content-type": "application/json", ...CORS_HEADERS });
    res.end(JSON.stringify(body));
  }

  private frame(event: string, data: unknown): string {
    return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  }

  private wsFrame(event: string, data: unknown): string {
    return JSON.stringify({ event, data });
  }
}

function readJson(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) reject(new Error("payload too large"));
    });
    req.on("end", () => {
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
