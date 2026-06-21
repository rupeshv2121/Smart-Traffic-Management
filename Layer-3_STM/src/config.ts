// Shared Layer-3 pipeline configuration (single source of truth)

import { loadEmvKeys } from "./emv/emv-keys";

export const PIPELINE_CYCLE_MS = 30_000;
export const PIPELINE_CYCLE_SECONDS = 30;

export const MIN_YELLOW_SECONDS = 5;
export const MIN_ALL_RED_SECONDS = 2;
export const MIN_PEDESTRIAN_WALK_SECONDS = 8;
export const MIN_GREEN_ENFORCED = 10;

export const CONFIDENCE_CRITICAL = 0.7;
export const CONFIDENCE_WARNING = 0.8;
export const MAX_DATA_AGE_SECONDS = 10;

export const DEFAULT_PHASE = "NORTH";

// Layer 2 (GatiShakti-ML perception service) base URL. The live pipeline
// (`npm run live`) polls `${PERCEPTION_URL}/perception/layer2` each cycle.
export const PERCEPTION_URL =
  process.env.PERCEPTION_URL ?? "http://localhost:8000";

// Junction id requested from the perception service.
export const JUNCTION_ID = process.env.JUNCTION_ID ?? "DEL_DL_ITO_01";

// Physical location of this junction (WGS84). Used by the EMV GPS-consistency
// check to confirm an emergency vehicle is actually in this junction's approach
// zone. Default ≈ ITO crossing, New Delhi.
export const JUNCTION_LOCATION = {
  lat: Number(process.env.JUNCTION_LAT ?? 28.6304),
  lng: Number(process.env.JUNCTION_LNG ?? 77.2177),
};

// Port for the EMV telemetry intake (Layer 1 second sensing stream). The live
// pipeline listens here for POST /emergency/token.
export const EMV_INGEST_PORT = Number(process.env.EMV_INGEST_PORT ?? 8100);

// Port for the Layer 5 dashboard SSE gateway. The live pipeline broadcasts one
// CycleSnapshot per cycle here; the Layer-5 React app subscribes at GET /events.
export const DASHBOARD_PORT = Number(process.env.DASHBOARD_PORT ?? 8200);

// EMV trust configuration consumed by the junction-side EmvVerifier (Layer 3
// Security & Trust gate). The junction holds only the PUBLIC key.
export const emvTrust = {
  publicKeyPem: loadEmvKeys().publicKeyPem,
  junctionId: JUNCTION_ID,
  junctionLocation: JUNCTION_LOCATION,
  gpsMaxDistanceMeters: Number(process.env.EMV_GPS_MAX_DISTANCE_METERS ?? 3000),
  gpsMaxSpeedMps: Number(process.env.EMV_GPS_MAX_SPEED_MPS ?? 40),
  // 60s tolerates a fix taken up to two cycles before it is read; a real EMV
  // streams GPS continuously, so this only bounds how stale a fix may be.
  gpsMaxAgeMs: Number(process.env.EMV_GPS_MAX_AGE_MS ?? 60_000),
  etaToleranceRatio: Number(process.env.EMV_ETA_TOL_RATIO ?? 0.6),
  etaToleranceAbsSeconds: Number(process.env.EMV_ETA_TOL_ABS ?? 15),
  clockSkewMs: Number(process.env.EMV_CLOCK_SKEW_MS ?? 5_000),
};

export const safetyConfig = {
  minYellowSeconds: MIN_YELLOW_SECONDS,
  minAllRedSeconds: MIN_ALL_RED_SECONDS,
  minPedestrianWalkSeconds: MIN_PEDESTRIAN_WALK_SECONDS,
  minGreenEnforced: MIN_GREEN_ENFORCED,
  conflictMatrix: {
    NORTH: ["SOUTH"],
    SOUTH: ["NORTH"],
    EAST: ["WEST"],
    WEST: ["EAST"],
  },
};

export const orchestratorConfig = {
  safetyConfig,
  resilienceThresholds: {
    criticalLowerBound: CONFIDENCE_CRITICAL,
    warningThreshold: CONFIDENCE_WARNING,
  },
  maxDataAgeSeconds: MAX_DATA_AGE_SECONDS,
  defaultPhaseIfNoProposal: DEFAULT_PHASE,
  emvTrust,
};
