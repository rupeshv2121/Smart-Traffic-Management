import { Navigate, Route, Routes } from "react-router-dom";

import { StreamProvider } from "./context/StreamContext";
import { DashboardLayout } from "./layout/DashboardLayout";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { EmergencyPage } from "./pages/EmergencyPage";
import { LandingPage } from "./pages/LandingPage";
import { LiveOpsPage } from "./pages/LiveOpsPage";
import { SystemHealthPage } from "./pages/SystemHealthPage";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route
        path="/dashboard"
        element={
          <StreamProvider>
            <DashboardLayout />
          </StreamProvider>
        }
      >
        <Route index element={<Navigate to="live" replace />} />
        <Route path="live" element={<LiveOpsPage />} />
        <Route path="emergency" element={<EmergencyPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="health" element={<SystemHealthPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
