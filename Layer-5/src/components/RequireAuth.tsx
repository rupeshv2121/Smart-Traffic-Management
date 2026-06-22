import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import { firstAllowedPath, moduleAllowed, type ModuleKey } from "../types/auth";

/**
 * Gate for the whole dashboard area: bounces to /login when there is
 * no session, preserving the intended destination so we can return
 * there after sign-in.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}

/**
 * Per-module gate: if the signed-in role is not permitted for this
 * module, redirect to the role's first allowed screen rather than
 * showing a forbidden page (keeps the operator productive).
 */
export function RequireModule({
  moduleKey,
  children,
}: {
  moduleKey: ModuleKey;
  children: ReactNode;
}) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!moduleAllowed(user.role, moduleKey)) {
    return <Navigate to={firstAllowedPath(user.role)} replace />;
  }
  return <>{children}</>;
}
