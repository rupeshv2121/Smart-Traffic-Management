// ============================================================
// emv-dispatch.ts — mock central authority (token issuance)
//
// Stands in for the dispatch hub in §7 of the architecture: "verify the vehicle
// and issue the signed, time-bound, route-scoped, revocable token, carrying its
// priority class". For the prototype it ALSO synthesises a plausible live GPS
// track (a known distance from the junction, consistent with the claimed ETA)
// so the junction-side EmvVerifier has real telemetry to validate.
//
// In production this lives outside the junction; the junction only ever holds
// the PUBLIC key and verifies. Here it is a thin helper used by the mock
// generator, the integration tests, and the `emv:dispatch` CLI.
// ============================================================

import type { EmergencyToken, PriorityClass } from "../types/types";
import { signClaims } from "./emv-crypto";
import { destinationPoint } from "./geo";

export interface IssueParams {
  emvId: string;
  priorityClass: PriorityClass;
  etaSeconds: number;
  targetPhaseId: string;
  /** Junctions on the corridor route. Defaults to [this junction]. */
  routeJunctions?: string[];
  /** Token lifetime; defaults to ETA + 60s of slack. */
  ttlMs?: number;
  /** Assumed approach speed used to place the synthetic GPS fix. */
  assumedSpeedMps?: number;
  /** Bearing of the vehicle FROM the junction; deterministic default if omitted. */
  bearingDeg?: number;
}

export class MockEmvDispatch {
  private issueCounter = 0;

  constructor(
    private readonly privateKeyPem: string,
    private readonly junctionId: string,
    private readonly junctionLocation: { lat: number; lng: number },
  ) {}

  public issue(params: IssueParams): EmergencyToken {
    const now = Date.now();
    const ttlMs = params.ttlMs ?? params.etaSeconds * 1000 + 60_000;
    const speedMps = params.assumedSpeedMps ?? 12; // ~43 km/h
    // Place the vehicle exactly etaSeconds away at the assumed speed, so the
    // GPS-derived ETA matches the claim and the approach-zone check passes.
    const distMeters = Math.max(50, params.etaSeconds * speedMps);
    const bearingFromJunction =
      params.bearingDeg ?? (this.issueCounter * 53) % 360;
    this.issueCounter += 1;

    const pos = destinationPoint(
      this.junctionLocation.lat,
      this.junctionLocation.lng,
      bearingFromJunction,
      distMeters,
    );

    const claims = {
      emvId: params.emvId,
      priorityClass: params.priorityClass,
      etaSeconds: params.etaSeconds,
      targetPhaseId: params.targetPhaseId,
      routeJunctions: params.routeJunctions ?? [this.junctionId],
      issuedAt: now,
      expiresAt: now + ttlMs,
      tokenId: `TKN-${now}-${this.issueCounter}-${Math.floor(
        Math.random() * 1_000_000,
      )}`,
    };

    return {
      ...claims,
      signature: signClaims(claims, this.privateKeyPem),
      gpsTrack: {
        lat: pos.lat,
        lng: pos.lng,
        // Vehicle heads back toward the junction → opposite of the placement bearing.
        headingDeg: (bearingFromJunction + 180) % 360,
        speedMps,
        timestamp: now,
      },
    };
  }
}
