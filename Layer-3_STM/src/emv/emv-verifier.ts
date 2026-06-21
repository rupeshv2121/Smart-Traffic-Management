// ============================================================
// emv-verifier.ts — the Security & Trust gate (STM Architecture v2.0 §5)
//
// LAYER: this is the per-junction "cheap local check" the design places at the
// Layer 3 decision boundary. It runs BEFORE the orchestrator opens a green
// corridor. It is fail-closed: any failed check rejects the corridor request.
//
// Five independent checks, mirroring the doc's attack-surface analysis:
//   1. signature   — Ed25519 over the canonical claims (forged token fails).
//   2. time-bound  — now within [issuedAt, expiresAt] (replayed/expired fails).
//   3. route-scope — this junction is on the token's route (out-of-scope fails).
//   4. revocation  — tokenId not in the local revocation set (cancelled fails).
//   5. GPS         — live track is in this junction's approach zone AND its
//                    position+speed are consistent with the claimed ETA
//                    (a stolen token replayed from a different vehicle fails).
// ============================================================

import type { EmergencyToken } from "../types/types";
import {
  type EmvSignableClaims,
  verifyClaims,
} from "./emv-crypto";
import { haversineMeters } from "./geo";

export interface EmvTrustConfig {
  publicKeyPem: string;
  junctionId: string;
  junctionLocation: { lat: number; lng: number };
  gpsMaxDistanceMeters: number; // approach-zone radius around the junction
  gpsMaxSpeedMps: number; // physical sanity bound on EMV speed
  gpsMaxAgeMs: number; // how stale a GPS fix may be
  etaToleranceRatio: number; // allowed |gpsEta - claimedEta| as a fraction of claim
  etaToleranceAbsSeconds: number; // ...or this absolute floor, whichever is larger
  clockSkewMs: number; // tolerance on time-bound checks
}

export type EmvCheck =
  | "signature"
  | "timeBound"
  | "routeScope"
  | "revocation"
  | "gps";

export interface EmvVerdict {
  valid: boolean;
  reasons: string[]; // human-readable failures; empty when valid
  checks: Record<EmvCheck, boolean>;
}

/** Pull the signed subset of fields out of a full token. */
function tokenClaims(token: EmergencyToken): EmvSignableClaims {
  return {
    emvId: token.emvId,
    priorityClass: token.priorityClass,
    etaSeconds: token.etaSeconds,
    targetPhaseId: token.targetPhaseId,
    routeJunctions: token.routeJunctions,
    issuedAt: token.issuedAt,
    expiresAt: token.expiresAt,
    tokenId: token.tokenId,
  };
}

export class EmvVerifier {
  private readonly revoked = new Set<string>();

  constructor(
    private readonly cfg: EmvTrustConfig,
    // Injectable clock keeps the verifier deterministic under test.
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Revoke a token by id (e.g. end-of-run or abort). Idempotent. */
  public revoke(tokenId: string): void {
    this.revoked.add(tokenId);
  }

  public isRevoked(tokenId: string): boolean {
    return this.revoked.has(tokenId);
  }

  public verify(token: EmergencyToken): EmvVerdict {
    const reasons: string[] = [];
    const checks: Record<EmvCheck, boolean> = {
      signature: false,
      timeBound: false,
      routeScope: false,
      revocation: false,
      gps: false,
    };

    // 1. Signature ----------------------------------------------------------
    checks.signature = verifyClaims(
      tokenClaims(token),
      token.signature,
      this.cfg.publicKeyPem,
    );
    if (!checks.signature) reasons.push("SIGNATURE_INVALID");

    // 2. Time-bound ---------------------------------------------------------
    const now = this.now();
    if (now + this.cfg.clockSkewMs < token.issuedAt) {
      reasons.push("TOKEN_NOT_YET_VALID");
    } else if (now - this.cfg.clockSkewMs > token.expiresAt) {
      reasons.push(
        `TOKEN_EXPIRED (${Math.round((now - token.expiresAt) / 1000)}s past)`,
      );
    } else {
      checks.timeBound = true;
    }

    // 3. Route-scope --------------------------------------------------------
    checks.routeScope = token.routeJunctions.includes(this.cfg.junctionId);
    if (!checks.routeScope) {
      reasons.push(
        `ROUTE_SCOPE_MISMATCH (junction ${this.cfg.junctionId} not on token route)`,
      );
    }

    // 4. Revocation ---------------------------------------------------------
    checks.revocation = !this.revoked.has(token.tokenId);
    if (!checks.revocation) reasons.push("TOKEN_REVOKED");

    // 5. GPS track-consistency ---------------------------------------------
    const gps = this.checkGps(token);
    checks.gps = gps.ok;
    reasons.push(...gps.reasons);

    return { valid: reasons.length === 0, reasons, checks };
  }

  private checkGps(token: EmergencyToken): { ok: boolean; reasons: string[] } {
    const reasons: string[] = [];
    const g = token.gpsTrack;

    if (!g) return { ok: false, reasons: ["GPS_MISSING"] };

    const ageMs = this.now() - g.timestamp;
    if (ageMs > this.cfg.gpsMaxAgeMs) {
      reasons.push(`GPS_STALE (${Math.round(ageMs / 1000)}s old)`);
    }

    if (g.speedMps < 0 || g.speedMps > this.cfg.gpsMaxSpeedMps) {
      reasons.push(`GPS_SPEED_IMPLAUSIBLE (${g.speedMps.toFixed(1)} m/s)`);
    }

    const distMeters = haversineMeters(
      g.lat,
      g.lng,
      this.cfg.junctionLocation.lat,
      this.cfg.junctionLocation.lng,
    );
    if (distMeters > this.cfg.gpsMaxDistanceMeters) {
      reasons.push(
        `GPS_OUT_OF_APPROACH_ZONE (${Math.round(distMeters)}m > ${this.cfg.gpsMaxDistanceMeters}m)`,
      );
    }

    // Could the vehicle even reach the junction in the claimed ETA?
    const requiredSpeed = distMeters / Math.max(token.etaSeconds, 1);
    if (requiredSpeed > this.cfg.gpsMaxSpeedMps) {
      reasons.push(
        `ETA_IMPOSSIBLE (needs ${requiredSpeed.toFixed(1)} m/s to cover ${Math.round(distMeters)}m in ${token.etaSeconds}s)`,
      );
    }

    // Does the GPS-derived ETA match the claimed ETA (right vehicle, on route)?
    if (g.speedMps > 0.5) {
      const gpsEta = distMeters / g.speedMps;
      const tolerance = Math.max(
        this.cfg.etaToleranceAbsSeconds,
        token.etaSeconds * this.cfg.etaToleranceRatio,
      );
      if (Math.abs(gpsEta - token.etaSeconds) > tolerance) {
        reasons.push(
          `ETA_GPS_MISMATCH (gps≈${gpsEta.toFixed(0)}s vs claim ${token.etaSeconds}s)`,
        );
      }
    }

    return { ok: reasons.length === 0, reasons };
  }
}
