// ============================================================
// auth-store.ts — persisted user directory with password verification.
//
// Replaces the "issue a token for any role" demo with real credentials: users
// are stored (via the Persistence doc surface) with a per-user scrypt salt+hash
// (node:crypto, no external deps). /auth/login verifies username+password before
// the gateway issues a JWT. A passwordless role login remains available for the
// demo, gated by ALLOW_DEMO_LOGIN.
//
// Default seeded accounts (CHANGE IN PRODUCTION): username = role lowercased,
// password = "stm@1234" — admin / operator / inspector / dispatcher.
// ============================================================

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

import type { Persistence } from "../persistence/persistence";
import type { Role } from "./jwt";

interface StoredUser {
  username: string;
  id: string;
  name: string;
  role: Role;
  salt: string;
  hash: string;
  status: "ACTIVE" | "SUSPENDED";
}

export interface VerifiedUser {
  id: string;
  name: string;
  role: Role;
}

const DOC = "auth_users.json";
const DEFAULT_PASSWORD = "stm@1234";

const SEED: Array<{ username: string; id: string; name: string; role: Role }> = [
  { username: "admin", id: "NCT-OPS-ADM", name: "System Administrator", role: "ADMIN" },
  { username: "operator", id: "NCT-OPS-OPR", name: "Signal Operator", role: "OPERATOR" },
  { username: "inspector", id: "NCT-OPS-INS", name: "Enforcement Inspector", role: "INSPECTOR" },
  { username: "dispatcher", id: "NCT-OPS-DSP", name: "Emergency Dispatcher", role: "DISPATCHER" },
];

function hash(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString("hex");
}

export class AuthStore {
  private users: StoredUser[];

  constructor(private readonly persistence: Persistence) {
    this.users = persistence.readDoc<StoredUser[]>(DOC, []);
    if (this.users.length === 0) this.seed();
  }

  /** Verify credentials; returns the user identity or null. */
  public verify(username: string, password: string): VerifiedUser | null {
    const u = this.users.find((x) => x.username === username.toLowerCase().trim());
    if (!u || u.status !== "ACTIVE") return null;
    const a = Buffer.from(hash(password, u.salt));
    const b = Buffer.from(u.hash);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return { id: u.id, name: u.name, role: u.role };
  }

  /** Public-safe roster (no secrets). */
  public list(): Array<{ username: string; id: string; name: string; role: Role; status: string }> {
    return this.users.map((u) => ({ username: u.username, id: u.id, name: u.name, role: u.role, status: u.status }));
  }

  private seed(): void {
    this.users = SEED.map((s) => {
      const salt = randomBytes(16).toString("hex");
      return { ...s, salt, hash: hash(DEFAULT_PASSWORD, salt), status: "ACTIVE" as const };
    });
    this.persistence.writeDoc(DOC, this.users);
  }
}
