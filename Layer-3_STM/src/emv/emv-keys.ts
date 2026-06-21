// ============================================================
// emv-keys.ts — keypair provisioning for the EMV trust model
//
// Resolution order (first hit wins):
//   1. Env: EMV_PRIVATE_KEY_PEM + EMV_PUBLIC_KEY_PEM (production / CI).
//   2. File: .emv-keys.json at the package root (written by `npm run emv:keygen`).
//      Persisting the dev keypair lets the dispatch CLI (signer) and the live
//      STM process (verifier) agree on keys ACROSS processes.
//   3. Ephemeral: a freshly minted pair held in memory, with a warning. Fine
//      for single-process tests (signer + verifier share the same key), but
//      cross-process dispatch will fail until you run `npm run emv:keygen`.
// ============================================================

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { generateEd25519KeyPair } from "./emv-crypto";

export interface EmvKeyPair {
  publicKeyPem: string;
  privateKeyPem: string;
}

// src/emv/emv-keys.ts → package root is two levels up.
const KEYS_FILE = resolve(__dirname, "..", "..", ".emv-keys.json");

let cached: EmvKeyPair | null = null;

export function loadEmvKeys(): EmvKeyPair {
  if (cached) return cached;

  const envPub = process.env.EMV_PUBLIC_KEY_PEM;
  const envPriv = process.env.EMV_PRIVATE_KEY_PEM;
  if (envPub && envPriv) {
    cached = { publicKeyPem: envPub, privateKeyPem: envPriv };
    return cached;
  }

  if (existsSync(KEYS_FILE)) {
    cached = JSON.parse(readFileSync(KEYS_FILE, "utf8")) as EmvKeyPair;
    return cached;
  }

  cached = generateEd25519KeyPair();
  console.warn(
    "[EMV] No persisted keypair found — generated an EPHEMERAL dev keypair. " +
      "Single-process tests work; for cross-process `npm run emv:dispatch`, " +
      "run `npm run emv:keygen` first.",
  );
  return cached;
}

/** Mint and persist a keypair to .emv-keys.json. Returns the file path. */
export function writeEmvKeys(): string {
  const pair = generateEd25519KeyPair();
  writeFileSync(KEYS_FILE, JSON.stringify(pair, null, 2), "utf8");
  cached = pair;
  return KEYS_FILE;
}
