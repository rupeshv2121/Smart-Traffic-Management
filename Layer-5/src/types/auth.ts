// ============================================================
// auth.ts — Roles, users and the role→module access matrix.
//
// This file is the SINGLE SOURCE OF TRUTH for access control.
// Both the route guards (RequireModule) and the Sidebar read
// from MODULES, so a screen can never appear in the nav for a
// role that is not allowed to open it. The human-readable copy
// of this matrix lives in ROLE_ACCESS_MATRIX.md.
// ============================================================

export type Role = "ADMIN" | "OPERATOR" | "INSPECTOR" | "DISPATCHER";

export const ALL_ROLES: Role[] = ["ADMIN", "OPERATOR", "INSPECTOR", "DISPATCHER"];

export interface RoleMeta {
  label: string;
  labelHi: string;
  blurb: string;
  blurbHi: string;
  icon: string;
}

export const ROLE_META: Record<Role, RoleMeta> = {
  ADMIN: {
    label: "Administrator",
    labelHi: "प्रशासक",
    blurb: "Full command access — all modules, users & nodes.",
    blurbHi: "पूर्ण नियंत्रण — सभी मॉड्यूल, उपयोगकर्ता और नोड।",
    icon: "🛡️",
  },
  OPERATOR: {
    label: "Signal Operator",
    labelHi: "सिग्नल संचालक",
    blurb: "Live monitoring and manual signal phase control.",
    blurbHi: "लाइव निगरानी और मैनुअल सिग्नल नियंत्रण।",
    icon: "🎛️",
  },
  INSPECTOR: {
    label: "Enforcement Inspector",
    labelHi: "प्रवर्तन निरीक्षक",
    blurb: "Corridor compliance and violation (challan) review.",
    blurbHi: "गलियारा अनुपालन और चालान समीक्षा।",
    icon: "🔍",
  },
  DISPATCHER: {
    label: "Emergency Dispatcher",
    labelHi: "आपातकालीन प्रेषक",
    blurb: "Dispatch and track emergency green corridors.",
    blurbHi: "आपातकालीन हरित गलियारे का प्रेषण और ट्रैकिंग।",
    icon: "🚑",
  },
};

export interface SessionUser {
  id: string;
  name: string;
  role: Role;
  /** ISO timestamp of when the session began. */
  since: string;
  /** Server-issued JWT (absent if the gateway was unreachable at login). */
  token?: string;
}

/** Demo personas — one per role. Replaces real auth until JWT lands. */
export const DEMO_USERS: Record<Role, Omit<SessionUser, "since">> = {
  ADMIN: { id: "NCT-OPS-ADM", name: "System Administrator", role: "ADMIN" },
  OPERATOR: { id: "NCT-OPS-OPR", name: "Signal Operator", role: "OPERATOR" },
  INSPECTOR: { id: "NCT-OPS-INS", name: "Enforcement Inspector", role: "INSPECTOR" },
  DISPATCHER: { id: "NCT-OPS-DSP", name: "Emergency Dispatcher", role: "DISPATCHER" },
};

export type ModuleKey =
  | "command"
  | "live"
  | "emergency"
  | "signal"
  | "challan"
  | "ti"
  | "analytics"
  | "admin"
  | "health";

export interface ModuleDef {
  key: ModuleKey;
  /** Path segment under /dashboard (also the route child path). */
  seg: string;
  /** Full router path used by NavLink. */
  path: string;
  label: string;
  labelHi: string;
  icon: string;
  roles: Role[];
  /** Whether the screen is actually implemented & routed yet. */
  built: boolean;
}

function mod(
  key: ModuleKey,
  seg: string,
  label: string,
  labelHi: string,
  icon: string,
  roles: Role[],
  built: boolean,
): ModuleDef {
  return { key, seg, path: `/dashboard/${seg}`, label, labelHi, icon, roles, built };
}

// The access matrix. `roles` lists who may open the module; `built`
// flips to true as each screen ships. Sidebar shows built ∧ permitted.
export const MODULES: ModuleDef[] = [
  mod("command", "command", "Command Dashboard", "कमांड डैशबोर्ड", "🗺️", ALL_ROLES, true),
  mod("live", "live", "Live Operations", "लाइव संचालन", "🚦", ALL_ROLES, true),
  mod("emergency", "emergency", "Emergency Corridor", "आपातकालीन गलियारा", "🚑", ["ADMIN", "DISPATCHER"], true),
  mod("signal", "signal", "Signal Control", "सिग्नल नियंत्रण", "🎛️", ["ADMIN", "OPERATOR"], true),
  mod("challan", "challan", "Challan Review", "चालान समीक्षा", "🧾", ["ADMIN", "INSPECTOR"], true),
  mod("ti", "ti", "Corridor Inspector", "गलियारा निरीक्षक", "🛡️", ["ADMIN", "INSPECTOR"], true),
  mod("analytics", "analytics", "Analytics", "विश्लेषण", "📊", ALL_ROLES, true),
  mod("admin", "admin", "Administration", "प्रशासन", "⚙️", ["ADMIN"], true),
  mod("health", "health", "System Health", "सिस्टम स्थिति", "🩺", ALL_ROLES, true),
];

export function moduleBySeg(seg: string): ModuleDef | undefined {
  return MODULES.find((m) => m.seg === seg);
}

export function moduleAllowed(role: Role, key: ModuleKey): boolean {
  const m = MODULES.find((x) => x.key === key);
  return !!m && m.roles.includes(role);
}

/** Built modules this role may see, in nav order. */
export function modulesForRole(role: Role): ModuleDef[] {
  return MODULES.filter((m) => m.built && m.roles.includes(role));
}

/** First landing screen for a role after login. */
export function firstAllowedPath(role: Role): string {
  return modulesForRole(role)[0]?.path ?? "/dashboard/live";
}
