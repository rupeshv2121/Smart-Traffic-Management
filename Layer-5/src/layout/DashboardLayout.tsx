import { Outlet, useLocation } from "react-router-dom";

import { ConnectionChip } from "../components/ConnectionChip";
import { useLang } from "../context/LangContext";
import { useStream } from "../context/StreamContext";
import { moduleBySeg } from "../types/auth";
import { Sidebar } from "./Sidebar";

export function DashboardLayout() {
  const { latest, connection } = useStream();
  const { lang } = useLang();
  const location = useLocation();
  const seg = location.pathname.split("/").pop() ?? "live";
  const mod = moduleBySeg(seg) ?? moduleBySeg("live")!;
  const title = lang === "hi" ? mod.labelHi : mod.label;

  return (
    <div className="shell">
      <Sidebar />
      <div className="content">
        <div className="content-bar">
          <div>
            <h1>{title}</h1>
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
