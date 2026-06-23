import { Link, NavLink, useNavigate } from "react-router-dom";

import { AshokaChakra } from "../components/gov/Emblem";
import { ModuleIcon, RoleIcon } from "../components/icons/AppIcons";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../context/LangContext";
import { ROLE_META, modulesForRole } from "../types/auth";

export function Sidebar() {
  const { user, logout } = useAuth();
  const { lang } = useLang();
  const navigate = useNavigate();

  const nav = user ? modulesForRole(user.role) : [];

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <nav className="sidebar">
      <Link to="/" className="sidebar-brand" style={{ textDecoration: "none" }}>
        <AshokaChakra size={34} />
        <div>
          <div className="b-title">STM Delhi</div>
          <div className="b-sub">Control Center</div>
        </div>
      </Link>

      {nav.map((n) => (
        <NavLink
          key={n.key}
          to={n.path}
          className={({ isActive }) => `navlink ${isActive ? "active" : ""}`}
        >
          <span className="nicon">
            <ModuleIcon moduleKey={n.key} size={19} />
          </span>
          {lang === "hi" ? n.labelHi : n.label}
        </NavLink>
      ))}

      {user && (
        <div className="sidebar-user">
          <div className="su-row">
            <span className="su-ic" aria-hidden>
              <RoleIcon role={user.role} size={18} />
            </span>
            <div className="su-text">
              <div className="su-name">{user.name}</div>
              <div className="su-role">
                {lang === "hi" ? ROLE_META[user.role].labelHi : ROLE_META[user.role].label} ·{" "}
                {user.id}
              </div>
            </div>
          </div>
          <button type="button" className="su-logout" onClick={handleLogout}>
            {lang === "hi" ? "साइन आउट" : "Sign out"}
          </button>
        </div>
      )}

      <div className="sidebar-foot">
        Transport Department
        <br />
        Govt. of NCT of Delhi
      </div>
    </nav>
  );
}
