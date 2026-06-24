// ============================================================
// postgres-persistence.ts — Postgres / TimescaleDB adapter.
//
// Implements the synchronous PersistenceStore surface over an async driver via
// an in-memory cache hydrated in init() + write-behind INSERTs. cycle_history is
// promoted to a Timescale hypertable when the extension is present (plain table
// otherwise). Selected when DATABASE_URL / STORE=postgres is set; the file
// adapter remains the default so no database is required to run.
// ============================================================

import { Pool } from "pg";

import type { AuditEntry } from "../control/control-channel";
import type { CycleSnapshot } from "../dashboard/snapshot";
import type { PersistenceStore } from "./persistence";

const AUDIT_CAP = 5000;
const HISTORY_CAP = 2000;

export class PostgresPersistence implements PersistenceStore {
  private readonly pool: Pool;
  private auditCache: AuditEntry[] = [];
  private historyCache: CycleSnapshot[] = [];
  private docs = new Map<string, unknown>();

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  public async init(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS audit_log (
        seq         BIGSERIAL PRIMARY KEY,
        ts          TIMESTAMPTZ NOT NULL DEFAULT now(),
        junction_id TEXT,
        entry       JSONB NOT NULL
      );
      CREATE TABLE IF NOT EXISTS cycle_history (
        ts          TIMESTAMPTZ NOT NULL DEFAULT now(),
        cycle       INTEGER,
        junction_id TEXT,
        snap        JSONB NOT NULL
      );
      CREATE TABLE IF NOT EXISTS kv_docs (
        name  TEXT PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    // Promote cycle_history to a Timescale hypertable when available; ignore if not.
    try {
      await this.pool.query(`SELECT create_hypertable('cycle_history','ts',if_not_exists=>TRUE);`);
    } catch {
      /* TimescaleDB extension not installed — plain table is fine */
    }

    // Hydrate caches so the synchronous reads return real data immediately.
    const a = await this.pool.query<{ entry: AuditEntry }>(
      `SELECT entry FROM audit_log ORDER BY seq DESC LIMIT $1`,
      [AUDIT_CAP],
    );
    this.auditCache = a.rows.map((r) => r.entry).reverse();

    const h = await this.pool.query<{ snap: CycleSnapshot }>(
      `SELECT snap FROM cycle_history ORDER BY ts DESC LIMIT $1`,
      [HISTORY_CAP],
    );
    this.historyCache = h.rows.map((r) => r.snap).reverse();

    const d = await this.pool.query<{ name: string; value: unknown }>(`SELECT name, value FROM kv_docs`);
    for (const row of d.rows) this.docs.set(row.name, row.value);

    console.log("[persistence] Postgres adapter ready (audit %d, history %d, docs %d)", this.auditCache.length, this.historyCache.length, this.docs.size);
  }

  public appendAudit(entry: AuditEntry): void {
    this.auditCache.push(entry);
    if (this.auditCache.length > AUDIT_CAP) this.auditCache.shift();
    void this.pool
      .query(`INSERT INTO audit_log (junction_id, entry) VALUES ($1, $2)`, [entry.junctionId, entry])
      .catch((e) => console.error("[persistence] audit insert failed:", e.message));
  }
  public recentAudit(limit: number): AuditEntry[] {
    return this.auditCache.slice(-limit);
  }

  public appendSnapshot(snap: CycleSnapshot): void {
    this.historyCache.push(snap);
    if (this.historyCache.length > HISTORY_CAP) this.historyCache.shift();
    void this.pool
      .query(`INSERT INTO cycle_history (cycle, junction_id, snap) VALUES ($1, $2, $3)`, [snap.cycle, snap.junctionId, snap])
      .catch((e) => console.error("[persistence] history insert failed:", e.message));
  }
  public recentSnapshots(limit: number): CycleSnapshot[] {
    return this.historyCache.slice(-limit);
  }

  public readDoc<T>(name: string, fallback: T): T {
    return this.docs.has(name) ? (this.docs.get(name) as T) : fallback;
  }
  public writeDoc(name: string, value: unknown): void {
    this.docs.set(name, value);
    void this.pool
      .query(
        `INSERT INTO kv_docs (name, value, updated_at) VALUES ($1, $2, now())
         ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [name, JSON.stringify(value)],
      )
      .catch((e) => console.error("[persistence] doc upsert failed:", e.message));
  }
}
