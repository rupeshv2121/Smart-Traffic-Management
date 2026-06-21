// ============================================================
// emv-dispatch-cli.ts — `npm run emv:dispatch`
//
// Mock dispatch authority that signs a corridor token and POSTs it to the live
// STM's EMV ingestion endpoint. Demonstrates the real Layer 1 intake channel
// end to end: signer (here) → POST /emergency/token → junction verifier.
//
// Usage:
//   npm run emv:dispatch -- [TARGET_PHASE] [ETA_SECONDS] [PRIORITY] [--revoke TOKEN_ID]
// Examples:
//   npm run emv:dispatch -- EAST 35 CRITICAL
//   npm run emv:dispatch -- --revoke TKN-...   (cancel an active corridor)
//
// Requires `npm run emv:keygen` first so this signer and the live verifier
// share the same persisted keypair.
// ============================================================

import { EMV_INGEST_PORT, JUNCTION_ID, JUNCTION_LOCATION } from "../config";
import { MockEmvDispatch } from "./emv-dispatch";
import { loadEmvKeys } from "./emv-keys";
import type { PriorityClass } from "../types/types";

const ENDPOINT = `http://localhost:${EMV_INGEST_PORT}`;
const PHASES = ["NORTH", "SOUTH", "EAST", "WEST"];
const PRIORITIES: PriorityClass[] = ["CRITICAL", "HIGH", "NORMAL"];

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  const revokeIdx = args.indexOf("--revoke");
  if (revokeIdx !== -1) {
    const tokenId = args[revokeIdx + 1];
    if (!tokenId) {
      console.error("--revoke requires a tokenId");
      process.exit(1);
    }
    const res = await fetch(`${ENDPOINT}/emergency/revoke`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tokenId }),
    });
    console.log(`Revoke → ${res.status}`, await res.json());
    return;
  }

  const targetPhaseId = (args[0] ?? "EAST").toUpperCase();
  if (!PHASES.includes(targetPhaseId)) {
    console.error(`Invalid phase '${targetPhaseId}'. Use one of ${PHASES.join(", ")}`);
    process.exit(1);
  }
  const etaSeconds = Number(args[1] ?? 35);
  const priorityClass = (args[2] ?? "CRITICAL").toUpperCase() as PriorityClass;
  if (!PRIORITIES.includes(priorityClass)) {
    console.error(
      `Invalid priority '${priorityClass}'. Use one of ${PRIORITIES.join(", ")}`,
    );
    process.exit(1);
  }

  const dispatch = new MockEmvDispatch(
    loadEmvKeys().privateKeyPem,
    JUNCTION_ID,
    JUNCTION_LOCATION,
  );
  const token = dispatch.issue({
    emvId: `AMB-${Math.floor(Math.random() * 9999)}`,
    priorityClass,
    etaSeconds,
    targetPhaseId,
    routeJunctions: [JUNCTION_ID],
  });

  const res = await fetch(`${ENDPOINT}/emergency/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(token),
  });

  console.log(
    `🚑 Dispatched signed token ${token.tokenId} → ${targetPhaseId} ` +
      `(ETA ${etaSeconds}s, ${priorityClass}) to ${ENDPOINT}`,
  );
  console.log(`   Endpoint responded ${res.status}`, await res.json());
}

main().catch((err) => {
  console.error("Dispatch failed:", err instanceof Error ? err.message : err);
  console.error(
    `Is the live STM running with its ingest server on ${ENDPOINT}? (npm run live)`,
  );
  process.exit(1);
});
