// ============================================================
// emv-crypto.ts — Ed25519 signing primitives for the EMV trust model
//
// Design (STM Architecture v2.0, §5 Security & trust): a corridor token is
// "signed (so it cannot be forged)". The central authority (dispatch) signs the
// token's claims with a PRIVATE key once at dispatch; every junction verifies
// with the PUBLIC key only — no shared secret to leak, and the offline
// certificate story (pre-provisioned public keys) drops out naturally.
//
// This module is pure crypto: it knows how to canonicalise a token's claims,
// sign them, verify them, and mint a keypair. It has no traffic/domain logic.
// ============================================================

import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as edSign,
  verify as edVerify,
} from "node:crypto";

/**
 * The exact set of fields covered by the signature. The live GPS track is
 * deliberately NOT signed — it is continuous telemetry, checked separately for
 * consistency against these (static, signed) claims.
 */
export interface EmvSignableClaims {
  emvId: string;
  priorityClass: string;
  etaSeconds: number;
  targetPhaseId: string;
  routeJunctions: string[];
  issuedAt: number; // epoch ms
  expiresAt: number; // epoch ms
  tokenId: string;
}

/**
 * Deterministic, canonical serialisation of the claims. Both signer and
 * verifier MUST produce byte-identical input, so we pin field order and
 * delimiters here rather than relying on JSON key ordering.
 */
export function canonicalClaimsString(claims: EmvSignableClaims): string {
  return [
    "emv-v1",
    claims.emvId,
    claims.priorityClass,
    String(claims.etaSeconds),
    claims.targetPhaseId,
    claims.routeJunctions.join(","),
    String(claims.issuedAt),
    String(claims.expiresAt),
    claims.tokenId,
  ].join("|");
}

/** Sign claims with an Ed25519 private key (PEM). Returns a base64 signature. */
export function signClaims(
  claims: EmvSignableClaims,
  privateKeyPem: string,
): string {
  const message = Buffer.from(canonicalClaimsString(claims), "utf8");
  const key = createPrivateKey(privateKeyPem);
  // Ed25519 takes a null digest algorithm — it hashes internally.
  return edSign(null, message, key).toString("base64");
}

/** Verify a base64 signature over claims with an Ed25519 public key (PEM). */
export function verifyClaims(
  claims: EmvSignableClaims,
  signatureB64: string,
  publicKeyPem: string,
): boolean {
  try {
    const message = Buffer.from(canonicalClaimsString(claims), "utf8");
    const key = createPublicKey(publicKeyPem);
    return edVerify(null, message, key, Buffer.from(signatureB64, "base64"));
  } catch {
    // Malformed key / signature / base64 → treat as a failed verification, never throw.
    return false;
  }
}

/** Mint a fresh Ed25519 keypair as PEM strings (dispatch keeps private; junctions get public). */
export function generateEd25519KeyPair(): {
  publicKeyPem: string;
  privateKeyPem: string;
} {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    privateKeyPem: privateKey
      .export({ type: "pkcs8", format: "pem" })
      .toString(),
  };
}
