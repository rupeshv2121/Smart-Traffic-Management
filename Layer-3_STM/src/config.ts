// Shared Layer-3 pipeline configuration (single source of truth)

// Load .env (from the process working dir, i.e. Layer-3_STM/) BEFORE reading any
// process.env value below. Imported first so every entrypoint that pulls in
// config — live.ts, the EMV CLI, etc. — gets the same environment.
import "dotenv/config";

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

// Durable store location (audit, history, challans). File-backed JSONL/JSON;
// swap the Persistence adapter for Postgres/TimescaleDB without touching callers.
export const DATA_DIR = process.env.DATA_DIR ?? ".data";

// When DATABASE_URL is set (or STORE=postgres), the live loop uses the Postgres/
// TimescaleDB adapter instead of the file store. Otherwise it stays file-backed
// so the stack still runs with zero infrastructure.
export const DATABASE_URL = process.env.DATABASE_URL ?? "";
export const USE_POSTGRES = process.env.STORE === "postgres" || DATABASE_URL.length > 0;

// Redis hot store for live junction/city state (junction:{id}:state). When
// unset, a no-op store is used and the gateway's in-memory state is the only
// hot copy — so Redis is optional.
export const REDIS_URL = process.env.REDIS_URL ?? "";

// Secret used to sign dashboard auth JWTs (HMAC-SHA256). MUST be overridden in
// production via JWT_SECRET; the default exists only so the demo runs.
export const JWT_SECRET = process.env.JWT_SECRET ?? "stm-delhi-dev-secret-change-me";
export const JWT_TTL_SECONDS = Number(process.env.JWT_TTL_SECONDS ?? 8 * 3600);

// Allow passwordless role login (the demo "sign in as a role" buttons). Set
// ALLOW_DEMO_LOGIN=false in production so only username+password is accepted.
export const ALLOW_DEMO_LOGIN = process.env.ALLOW_DEMO_LOGIN !== "false";

// SSO stub: stands in for an OIDC/SAML IdP. A real deployment validates an
// id_token / assertion here; the stub maps an email to a role. Disable with
// ALLOW_SSO_STUB=false once a real IdP is wired.
export const ALLOW_SSO_STUB = process.env.ALLOW_SSO_STUB !== "false";

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
