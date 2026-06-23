import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  Ambulance,
  BarChart3,
  Flag,
  Info,
  Map,
  OctagonAlert,
  Radio,
  Receipt,
  Search,
  Settings,
  Shield,
  SlidersHorizontal,
  Stethoscope,
  WifiOff,
} from "lucide-react";

import type { Role, ModuleKey } from "../../types/auth";
import type { CityIncident } from "../../types/snapshot";

const MODULE_ICON: Record<ModuleKey, LucideIcon> = {
  command: Map,
  live: Radio,
  emergency: Ambulance,
  signal: SlidersHorizontal,
  challan: Receipt,
  ti: Shield,
  analytics: BarChart3,
  admin: Settings,
  health: Stethoscope,
};

const ROLE_ICON: Record<Role, LucideIcon> = {
  ADMIN: Shield,
  OPERATOR: SlidersHorizontal,
  INSPECTOR: Search,
  DISPATCHER: Ambulance,
};

const INCIDENT_ICON: Record<CityIncident["kind"], LucideIcon> = {
  EMERGENCY: Ambulance,
  GRIDLOCK: OctagonAlert,
  SAFETY: AlertTriangle,
  DEGRADED: WifiOff,
};

type IconProps = {
  size?: number;
  className?: string;
  strokeWidth?: number;
};

function renderIcon(Icon: LucideIcon, { size = 18, className, strokeWidth = 2 }: IconProps) {
  return <Icon size={size} strokeWidth={strokeWidth} className={className} aria-hidden />;
}

export function ModuleIcon({ moduleKey, ...props }: IconProps & { moduleKey: ModuleKey }) {
  return renderIcon(MODULE_ICON[moduleKey], props);
}

export function RoleIcon({ role, ...props }: IconProps & { role: Role }) {
  return renderIcon(ROLE_ICON[role], props);
}

export function IncidentKindIcon({ kind, ...props }: IconProps & { kind: CityIncident["kind"] }) {
  return renderIcon(INCIDENT_ICON[kind], props);
}

export { AlertTriangle, Ambulance, Flag, Info, OctagonAlert, Receipt, Shield };
