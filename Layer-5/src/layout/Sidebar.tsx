import { Link, NavLink } from "react-router-dom";

import { AshokaChakra } from "../components/gov/Emblem";

const NAV = [
  { to: "/dashboard/live", icon: "🚦", label: "Live Operations" },
  { to: "/dashboard/emergency", icon: "🚑", label: "Emergency Corridor" },
  { to: "/dashboard/analytics", icon: "📊", label: "Analytics" },
  { to: "/dashboard/health", icon: "🩺", label: "System Health" },
];

export function Sidebar() {
  return (
    <nav className="sidebar">
      <Link to="/" className="sidebar-brand" style={{ textDecoration: "none" }}>
        <AshokaChakra size={34} />
        <div>
          <div className="b-title">STM Delhi</div>
          <div className="b-sub">Control Center</div>
        </div>
      </Link>

      {NAV.map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          className={({ isActive }) => `navlink ${isActive ? "active" : ""}`}
        >
          <span className="nicon">{n.icon}</span>
          {n.label}
        </NavLink>
      ))}

      <div className="sidebar-foot">
        Transport Department
        <br />
        Govt. of NCT of Delhi
      </div>
    </nav>
  );
}
