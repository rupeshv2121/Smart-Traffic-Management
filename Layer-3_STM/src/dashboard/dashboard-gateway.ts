// ============================================================
// dashboard-gateway.ts — Layer 5 (Dashboard) live read-out API
//
// The live loop produces one CycleSnapshot per cycle; this gateway fans it out
// to any number of browser dashboards over Server-Sent Events (SSE). It is a
// READ-ONLY projection: the dashboard can only observe, never command the
// junction. That keeps Layer 5 safely outside the control path.
//
// On connect a client is replayed the recent history buffer (so a freshly
// opened dashboard isn't blank for 30s) and then receives every new snapshot
// live. SSE is one-way and browser-native (EventSource), needs no extra broker.
//
// Routes:
//   GET /events   → text/event-stream; replay history, then live snapshots
//   GET /health   → { status: "ok", clients, buffered }
// ============================================================

import { createServer, type Server, type ServerResponse } from "node:http";

import type { CycleSnapshot } from "./snapshot";

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "*",
} as const;

export class DashboardGateway {
  private server: Server | null = null;
  private clients = new Set<ServerResponse>();
  private history: CycleSnapshot[] = [];

  constructor(
    private readonly port: number,
    /** How many recent snapshots to replay to a newly-connected dashboard. */
    private readonly historySize = 20,
  ) {}

  public start(): Promise<void> {
    this.server = createServer((req, res) => {
      const url = req.url ?? "/";
      const method = req.method ?? "GET";

      if (method === "OPTIONS") {
        res.writeHead(204, CORS_HEADERS);
        return res.end();
      }

      if (method === "GET" && url.startsWith("/health")) {
        res.writeHead(200, { "content-type": "application/json", ...CORS_HEADERS });
        return res.end(
          JSON.stringify({
            status: "ok",
            clients: this.clients.size,
            buffered: this.history.length,
          }),
        );
      }

      if (method === "GET" && url.startsWith("/events")) {
        return this.handleSse(res);
      }

      res.writeHead(404, { "content-type": "application/json", ...CORS_HEADERS });
      res.end(JSON.stringify({ error: "not found" }));
    });

    return new Promise((resolve) => {
      this.server?.listen(this.port, () => resolve());
    });
  }

  /** Push a new cycle snapshot to history and all connected dashboards. */
  public broadcast(snapshot: CycleSnapshot): void {
    this.history.push(snapshot);
    if (this.history.length > this.historySize) this.history.shift();

    const frame = this.frame("snapshot", snapshot);
    for (const client of this.clients) client.write(frame);
  }

  public stop(): void {
    for (const client of this.clients) client.end();
    this.clients.clear();
    this.server?.close();
    this.server = null;
  }

  public get clientCount(): number {
    return this.clients.size;
  }

  private handleSse(res: ServerResponse): void {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
      ...CORS_HEADERS,
    });
    // Flush headers + an initial comment so the browser opens the stream.
    res.write(": connected\n\n");

    // Replay recent history so the dashboard renders immediately.
    for (const snapshot of this.history) {
      res.write(this.frame("snapshot", snapshot));
    }

    this.clients.add(res);
    res.on("close", () => this.clients.delete(res));
  }

  private frame(event: string, data: unknown): string {
    return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  }
}
