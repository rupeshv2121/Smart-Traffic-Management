import { Navigate, Route, Routes } from "react-router-dom";

import { RequireAuth, RequireModule } from "./components/RequireAuth";
import { useAuth } from "./context/AuthContext";
import { StreamProvider } from "./context/StreamContext";
import { DashboardLayout } from "./layout/DashboardLayout";
import { AdministrationPage } from "./pages/AdministrationPage";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { ChallanPage } from "./pages/ChallanPage";
import { CommandPage } from "./pages/CommandPage";
import { EmergencyPage } from "./pages/EmergencyPage";
import { LandingPage } from "./pages/LandingPage";
import { LiveOpsPage } from "./pages/LiveOpsPage";
import { LoginPage } from "./pages/LoginPage";
import { PublicLivePage } from "./pages/PublicLivePage";
import { SignalControlPage } from "./pages/SignalControlPage";
import { SystemHealthPage } from "./pages/SystemHealthPage";
import { TIPage } from "./pages/TIPage";
import { firstAllowedPath } from "./types/auth";

/** Sends a freshly-arrived user to the first screen their role can open. */
function DashboardIndex() {
  const { user } = useAuth();
  return <Navigate to={user ? firstAllowedPath(user.role) : "/login"} replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/live-traffic"
        element={
          <StreamProvider>
            <PublicLivePage />
          </StreamProvider>
        }
      />
      <Route
        path="/dashboard"
        element={
          <RequireAuth>
            <StreamProvider>
              <DashboardLayout />
            </StreamProvider>
          </RequireAuth>
        }
      >
        <Route index element={<DashboardIndex />} />
        <Route
          path="command"
          element={
            <RequireModule moduleKey="command">
              <CommandPage />
            </RequireModule>
          }
        />
        <Route
          path="live"
          element={
            <RequireModule moduleKey="live">
              <LiveOpsPage />
            </RequireModule>
          }
        />
        <Route
          path="emergency"
          element={
            <RequireModule moduleKey="emergency">
              <EmergencyPage />
            </RequireModule>
          }
        />
        <Route
          path="signal"
          element={
            <RequireModule moduleKey="signal">
              <SignalControlPage />
            </RequireModule>
          }
        />
        <Route
          path="challan"
          element={
            <RequireModule moduleKey="challan">
              <ChallanPage />
            </RequireModule>
          }
        />
        <Route
          path="ti"
          element={
            <RequireModule moduleKey="ti">
              <TIPage />
            </RequireModule>
          }
        />
        <Route
          path="analytics"
          element={
            <RequireModule moduleKey="analytics">
              <AnalyticsPage />
            </RequireModule>
          }
        />
        <Route
          path="admin"
          element={
            <RequireModule moduleKey="admin">
              <AdministrationPage />
            </RequireModule>
          }
        />
        <Route
          path="health"
          element={
            <RequireModule moduleKey="health">
              <SystemHealthPage />
            </RequireModule>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
