// ============================================================
// persistence.ts — durable store interface + file-backed adapter + factory.
//
// `PersistenceStore` is the surface the rest of Layer-3 depends on (audit +
// cycle history + JSON docs). Two adapters implement it:
//   • FilePersistence — JSONL/JSON under DATA_DIR. Zero infrastructure; the
//     default so the stack runs with one command.
//   • PostgresPersistence — Postgres/TimescaleDB (see postgres-persistence.ts),
//     selected when DATABASE_URL / STORE=postgres is set.
//
// The interface is intentionally SYNCHRONOUS for reads/appends so callers
// (ControlChannel, the gateway, ChallanStore, the registry) need no async
// plumbing. The Postgres adapter satisfies this with an in-memory cache hydrated
// in init() and write-behind INSERTs. Call init() once (before serving).
// ============================================================

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { DATA_DIR, DATABASE_URL, USE_POSTGRES } from "../config";
import type { AuditEntry } from "../control/control-channel";
import type { CycleSnapshot } from "../dashboard/snapshot";
import { PostgresPersistence } from "./postgres-persistence";

export interface PersistenceStore {
  /** Connect / open and hydrate caches. Safe to call once at startup. */
  init(): Promise<void>;
  appendAudit(entry: AuditEntry): void;
  recentAudit(limit: number): AuditEntry[];
  appendSnapshot(snap: CycleSnapshot): void;
  recentSnapshots(limit: number): CycleSnapshot[];
  readDoc<T>(name: string, fallback: T): T;
  writeDoc(name: string, value: unknown): void;
}

/** Back-compat alias: existing imports use `Persistence` as the type. */
export type Persistence = PersistenceStore;

const AUDIT_FILE = "audit.jsonl";
const HISTORY_FILE = "history.jsonl";
const AUDIT_CAP = 5000;
const HISTORY_CAP = 2000;

export class FilePersistence implements PersistenceStore {
  constructor(private readonly dir: string) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  public async init(): Promise<void> {
    /* nothing to open — files are created lazily */
  }

  public appendAudit(entry: AuditEntry): void {
    this.append(AUDIT_FILE, entry, AUDIT_CAP);
  }
  public recentAudit(limit: number): AuditEntry[] {
    return this.readJsonl<AuditEntry>(AUDIT_FILE).slice(-limit);
  }
  public appendSnapshot(snap: CycleSnapshot): void {
    this.append(HISTORY_FILE, snap, HISTORY_CAP);
  }
  public recentSnapshots(limit: number): CycleSnapshot[] {
    return this.readJsonl<CycleSnapshot>(HISTORY_FILE).slice(-limit);
  }
  public readDoc<T>(name: string, fallback: T): T {
    const path = join(this.dir, name);
    if (!existsSync(path)) return fallback;
    try {
      return JSON.parse(readFileSync(path, "utf8")) as T;
    } catch {
      return fallback;
    }
  }
  public writeDoc(name: string, value: unknown): void {
    writeFileSync(join(this.dir, name), JSON.stringify(value, null, 2));
  }

  private append(file: string, obj: unknown, cap: number): void {
    const path = join(this.dir, file);
    appendFileSync(path, JSON.stringify(obj) + "\n");
    if (this.lineCount(path) > cap * 2) this.trim(path, cap);
  }
  private readJsonl<T>(file: string): T[] {
    const path = join(this.dir, file);
    if (!existsSync(path)) return [];
    return readFileSync(path, "utf8")
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => {
        try {
          return JSON.parse(l) as T;
        } catch {
          return null;
        }
      })
      .filter((x): x is T => x !== null);
  }
  private lineCount(path: string): number {
    if (!existsSync(path)) return 0;
    return readFileSync(path, "utf8").split("\n").filter((l) => l.trim()).length;
  }
  private trim(path: string, cap: number): void {
    const kept = readFileSync(path, "utf8").split("\n").filter((l) => l.trim()).slice(-cap);
    writeFileSync(path, kept.join("\n") + "\n");
  }
}

/** Pick the adapter from config: Postgres when configured, else file-backed. */
export function createPersistence(): PersistenceStore {
  if (USE_POSTGRES) {
    return new PostgresPersistence(DATABASE_URL || "postgres://postgres:postgres@localhost:5432/stm");
  }
  return new FilePersistence(DATA_DIR);
}
