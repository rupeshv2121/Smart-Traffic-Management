// ============================================================
// control-channel.ts — the Layer 5 → Layer 3 write-path + audit log
//
// The dashboard gateway is otherwise READ-ONLY. This is the one sanctioned
// channel by which an authenticated operator can drive the junction: a manual
// phase override. It is deliberately constrained:
//   • single-phase only (NORTH|SOUTH|EAST|WEST) → never produces a conflicting
//     green, so it is safe by construction; clearance intervals are still
//     enforced by the live loop using the configured minima.
//   • time-bounded — expires after its duration (capped).
//   • subordinate to emergencies — an active green corridor always wins; the
//     override is deferred (and that deferral is audited).
//   • fully audited — every request/apply/defer/clear lands in the append-only
//     audit log, which also receives a per-cycle decision record.
// ============================================================

import { MIN_ALL_RED_SECONDS, MIN_YELLOW_SECONDS } from "../config";
import type { Persistence } from "../persistence/persistence";

export type PhaseId = "NORTH" | "SOUTH" | "EAST" | "WEST";

const VALID_PHASES: PhaseId[] = ["NORTH", "SOUTH", "EAST", "WEST"];
const MAX_OVERRIDE_SECONDS = 120;
const MIN_OVERRIDE_SECONDS = 10;
const AUDIT_CAP = 500;

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

export interface OverrideRequest {
  phaseId: string;
  durationSeconds?: number;
  requestedBy?: string;
  reason?: string;
}

export class ControlChannel {
  private override: ManualOverride | null = null;
  private auditLog: AuditEntry[] = [];
  private seq = 0;

  constructor(
    private readonly junctionId: string,
    private readonly persistence?: Persistence,
  ) {
    // Seed the in-memory window from durable storage so the audit trail
    // survives restarts.
    if (persistence) {
      this.auditLog = persistence.recentAudit(AUDIT_CAP);
      this.seq = this.auditLog.length;
    }
  }

  /** Validate + register an operator override. Throws on bad input. */
  public requestOverride(req: OverrideRequest): ManualOverride {
    const phaseId = String(req.phaseId).toUpperCase() as PhaseId;
    if (!VALID_PHASES.includes(phaseId)) {
      throw new Error(`invalid phaseId "${req.phaseId}" (expected NORTH|SOUTH|EAST|WEST)`);
    }
    const durationSeconds = clamp(
      Number(req.durationSeconds ?? 30),
      MIN_OVERRIDE_SECONDS,
      MAX_OVERRIDE_SECONDS,
    );
    const now = Date.now();
    const requestedBy = req.requestedBy?.trim() || "operator";
    const reason = req.reason?.trim() || "manual phase override";

    this.override = {
      phaseId,
      durationSeconds,
      requestedBy,
      reason,
      issuedAt: now,
      expiresAt: now + durationSeconds * 1000,
    };
    this.audit(requestedBy, "OVERRIDE_REQUESTED", "ok", `${phaseId} for ${durationSeconds}s — ${reason}`);
    return this.override;
  }

  public clearOverride(actor = "operator"): void {
    if (this.override) {
      this.audit(actor, "OVERRIDE_CLEARED", "info", `cleared override on ${this.override.phaseId}`);
    }
    this.override = null;
  }

  /** Current override if still valid; auto-expires and audits otherwise. */
  public activeOverride(): ManualOverride | null {
    if (this.override && Date.now() >= this.override.expiresAt) {
      this.audit("SYSTEM", "OVERRIDE_CLEARED", "info", `override on ${this.override.phaseId} expired`);
      this.override = null;
    }
    return this.override;
  }

  public recordApplied(o: ManualOverride): void {
    this.audit(o.requestedBy, "OVERRIDE_APPLIED", "ok", `green held on ${o.phaseId}`);
  }

  public recordDeferred(o: ManualOverride, why: string): void {
    this.audit(o.requestedBy, "OVERRIDE_DEFERRED", "blocked", `override on ${o.phaseId} deferred: ${why}`);
  }

  /** Clearance intervals applied to override commands (configured minima). */
  public clearanceIntervals(): { yellowSeconds: number; allRedSeconds: number } {
    return { yellowSeconds: MIN_YELLOW_SECONDS, allRedSeconds: MIN_ALL_RED_SECONDS };
  }

  /** Generic audit append — used by the live loop for per-cycle records too. */
  public audit(
    actor: string,
    action: AuditAction,
    outcome: AuditEntry["outcome"],
    detail: string,
  ): AuditEntry {
    const entry: AuditEntry = {
      id: `aud-${++this.seq}`,
      ts: new Date().toISOString(),
      actor,
      action,
      junctionId: this.junctionId,
      detail,
      outcome,
    };
    this.auditLog.push(entry);
    if (this.auditLog.length > AUDIT_CAP) this.auditLog.shift();
    this.persistence?.appendAudit(entry);
    return entry;
  }

  /** Most-recent-first audit slice. */
  public recentAudit(limit = 100): AuditEntry[] {
    return this.auditLog.slice(-limit).reverse();
  }

  public state(): { override: ManualOverride | null } {
    return { override: this.activeOverride() };
  }
}

function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}
