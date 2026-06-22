// ============================================================
// emv-ingest-server.ts — Layer 1 EMV telemetry intake (real endpoint)
//
// The architecture's Layer 1 (Perception) ingests EMV device telemetry —
// "GPS position + signed token" — as a SECOND sensing stream, independent of
// the camera. This is that intake channel for the STM edge node.
//
// It is deliberately a dumb pipe: it stores the latest signed token + GPS and
// hands it to the orchestrator each cycle. It does NOT decide trust — the
// junction-side EmvVerifier (Layer 3 gate) is the single authority on whether a
// token opens a corridor. The server only manages presence, expiry and
// revocation.
//
// Routes:
//   POST /emergency/token   body = EmergencyToken JSON   → stores as active
//   POST /emergency/revoke  body = { tokenId }           → clears + notifies
//   GET  /emergency/token                                → active token | null
//   GET  /emergency/health                               → { status: "ok" }
// ============================================================

import { createServer, type Server } from "node:http";

import type { EmergencyToken } from "../types/types";

function isEmergencyToken(value: unknown): value is EmergencyToken {
  if (typeof value !== "object" || value === null) return false;
  const t = value as Record<string, unknown>;
  return (
    typeof t.emvId === "string" &&
    typeof t.targetPhaseId === "string" &&
    typeof t.signature === "string" &&
    typeof t.tokenId === "string" &&
    typeof t.expiresAt === "number" &&
    typeof t.gpsTrack === "object" &&
    t.gpsTrack !== null
  );
}

async function readJsonBody(
  req: import("node:http").IncomingMessage,
): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

export class EmvIngestServer {
  private active: EmergencyToken | null = null;
  private server: Server | null = null;

  constructor(
    private readonly port: number,
    /** Called when a token is revoked so the junction verifier can blocklist it. */
    private readonly onRevoke?: (tokenId: string) => void,
  ) {}

  /** Latest active token, or null if none / expired. Expiry is enforced here too. */
  public getActiveToken(): EmergencyToken | null {
    if (this.active && Date.now() > this.active.expiresAt) {
      this.active = null;
    }
    return this.active;
  }

  /** Inject a token from in-process (used by the dashboard dispatch endpoint). */
  public submit(token: EmergencyToken): void {
    this.active = token;
    console.log(
      `[EMV-INGEST] Token submitted in-process: ${token.emvId} → ${token.targetPhaseId} (tokenId ${token.tokenId})`,
    );
  }

  public start(): Promise<void> {
    this.server = createServer((req, res) => {
      void this.handle(req, res);
    });
    return new Promise((resolve) => {
      this.server?.listen(this.port, () => resolve());
    });
  }

  public stop(): void {
    this.server?.close();
    this.server = null;
  }

  private async handle(
    req: import("node:http").IncomingMessage,
    res: import("node:http").ServerResponse,
  ): Promise<void> {
    const send = (status: number, body: unknown): void => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };

    try {
      const url = req.url ?? "/";
      const method = req.method ?? "GET";

      if (method === "GET" && url.startsWith("/emergency/health")) {
        return send(200, { status: "ok" });
      }

      if (method === "GET" && url.startsWith("/emergency/token")) {
        return send(200, { token: this.getActiveToken() });
      }

      if (method === "POST" && url.startsWith("/emergency/token")) {
        const body = await readJsonBody(req);
        if (!isEmergencyToken(body)) {
          return send(400, { error: "malformed EmergencyToken" });
        }
        this.active = body;
        console.log(
          `[EMV-INGEST] Token received: ${body.emvId} → ${body.targetPhaseId} (tokenId ${body.tokenId})`,
        );
        return send(202, { accepted: true, tokenId: body.tokenId });
      }

      if (method === "POST" && url.startsWith("/emergency/revoke")) {
        const body = (await readJsonBody(req)) as { tokenId?: string };
        if (!body.tokenId) return send(400, { error: "tokenId required" });
        if (this.active?.tokenId === body.tokenId) this.active = null;
        this.onRevoke?.(body.tokenId);
        console.log(`[EMV-INGEST] Token revoked: ${body.tokenId}`);
        return send(200, { revoked: body.tokenId });
      }

      return send(404, { error: "not found" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      send(400, { error: message });
    }
  }
}
