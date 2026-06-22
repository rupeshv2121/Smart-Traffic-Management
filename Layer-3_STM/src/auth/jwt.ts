// ============================================================
// jwt.ts — minimal, dependency-free HS256 JWTs for the dashboard.
//
// Real server-side auth for the ONE write-path (Signal Control / EMV dispatch).
// The gateway issues a signed token at /auth/login and verifies it on every
// write, enforcing the role matrix server-side (the React app's client-side
// guard is now a convenience, not the security boundary). HMAC-SHA256 via
// node:crypto — no external JWT library needed.
// ============================================================

import { createHmac, timingSafeEqual } from "node:crypto";

import { JWT_SECRET, JWT_TTL_SECONDS } from "../config";

export type Role = "ADMIN" | "OPERATOR" | "INSPECTOR" | "DISPATCHER";

export interface JwtClaims {
  sub: string; // user id
  name: string;
  role: Role;
  iat: number;
  exp: number;
}

// Server-side user directory (demo personas). Real deployments swap this for a
// user table + password/SSO check; the issued token shape stays identical.
export const SERVER_USERS: Record<Role, { id: string; name: string }> = {
  ADMIN: { id: "NCT-OPS-ADM", name: "System Administrator" },
  OPERATOR: { id: "NCT-OPS-OPR", name: "Signal Operator" },
  INSPECTOR: { id: "NCT-OPS-INS", name: "Enforcement Inspector" },
  DISPATCHER: { id: "NCT-OPS-DSP", name: "Emergency Dispatcher" },
};

const b64url = (buf: Buffer | string): string =>
  Buffer.from(buf).toString("base64url");

function sign(data: string): string {
  return createHmac("sha256", JWT_SECRET).update(data).digest("base64url");
}

/** Issue a token for an explicit identity (used by real password login). */
export function issueTokenFor(role: Role, sub: string, name: string): { token: string; claims: JwtClaims } {
  const now = Math.floor(Date.now() / 1000);
  const claims: JwtClaims = { sub, name, role, iat: now, exp: now + JWT_TTL_SECONDS };
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify(claims));
  const signature = sign(`${header}.${payload}`);
  return { token: `${header}.${payload}.${signature}`, claims };
}

/** Demo convenience: issue for a role using the seeded identity. */
export function issueToken(role: Role): { token: string; claims: JwtClaims } {
  const user = SERVER_USERS[role];
  return issueTokenFor(role, user.id, user.name);
}

/** Verify signature + expiry. Returns claims or throws. */
export function verifyToken(token: string): JwtClaims {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("malformed token");
  const [header, payload, signature] = parts as [string, string, string];
  const expected = sign(`${header}.${payload}`);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error("bad signature");
  }
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as JwtClaims;
  if (typeof claims.exp !== "number" || claims.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("token expired");
  }
  return claims;
}

/** Pull + verify a Bearer token from an Authorization header. */
export function claimsFromHeader(authHeader: string | undefined): JwtClaims {
  const m = /^Bearer\s+(.+)$/i.exec(authHeader ?? "");
  if (!m) throw new Error("missing bearer token");
  return verifyToken(m[1]!);
}
