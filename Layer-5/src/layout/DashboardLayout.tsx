import { Outlet, useLocation } from "react-router-dom";

import { ConnectionChip } from "../components/ConnectionChip";
import { useStream } from "../context/StreamContext";
import { Sidebar } from "./Sidebar";

const TITLES: Record<string, { title: string; hi: string }> = {
  live: { title: "Live Operations", hi: "लाइव संचालन" },
  emergency: { title: "Emergency Corridor", hi: "आपातकालीन गलियारा" },
  analytics: { title: "Analytics", hi: "विश्लेषण" },
  health: { title: "System Health", hi: "सिस्टम स्थिति" },
};

export function DashboardLayout() {
  const { latest, connection } = useStream();
  const location = useLocation();
  const key = location.pathname.split("/").pop() ?? "live";
  const meta = TITLES[key] ?? TITLES.live;

  return (
    <div className="shell">
      <Sidebar />
      <div className="content">
        <div className="content-bar">
          <div>
            <h1>{meta.title}</h1>
            <div className="sub">
              {latest
                ? `${latest.junctionId} · Cycle #${latest.cycle} · ${new Date(
                    latest.timestamp,
                  ).toLocaleTimeString()}`
                : "Awaiting first cycle from Layer 3…"}
            </div>
          </div>
          <div className="spacer" />
          <ConnectionChip state={connection} />
        </div>
        <div className="page">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
