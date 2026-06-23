import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";

import { EmblemCrest } from "../components/gov/Emblem";
import { AlertTriangle, RoleIcon } from "../components/icons/AppIcons";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../context/LangContext";
import { ALL_ROLES, ROLE_META, firstAllowedPath, type Role } from "../types/auth";

const COPY = {
  en: {
    eyebrow: "Secure Operator Access",
    title: "STM Delhi · Control Center",
    credentials: "Sign in with credentials",
    username: "Username",
    password: "Password",
    signIn: "Sign in",
    ssoTitle: "Single Sign-On",
    ssoEmail: "Work email",
    ssoBtn: "Continue with SSO",
    quick: "Quick demo sign-in",
    hint: "Default demo accounts: admin / operator / inspector / dispatcher · password stm@1234",
    back: "Back to Home",
    bad: "Sign-in failed. Check your credentials or the gateway connection.",
  },
  hi: {
    eyebrow: "सुरक्षित संचालक पहुँच",
    title: "एसटीएम दिल्ली · नियंत्रण केंद्र",
    credentials: "क्रेडेंशियल से साइन इन करें",
    username: "उपयोगकर्ता नाम",
    password: "पासवर्ड",
    signIn: "साइन इन",
    ssoTitle: "सिंगल साइन-ऑन",
    ssoEmail: "कार्य ईमेल",
    ssoBtn: "एसएसओ से जारी रखें",
    quick: "त्वरित डेमो साइन-इन",
    hint: "डिफ़ॉल्ट डेमो खाते: admin / operator / inspector / dispatcher · पासवर्ड stm@1234",
    back: "होम",
    bad: "साइन-इन विफल। क्रेडेंशियल या गेटवे कनेक्शन जाँचें।",
  },
} as const;

export function LoginPage() {
  const { user, login, loginWithPassword, loginWithSso } = useAuth();
  const { lang } = useLang();
  const navigate = useNavigate();
  const location = useLocation();
  const t = COPY[lang];

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [ssoEmail, setSsoEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user) return <Navigate to={firstAllowedPath(user.role)} replace />;
  const from = (location.state as { from?: string } | null)?.from;

  function go(role: Role) {
    const dest = from && from.startsWith("/dashboard") ? from : firstAllowedPath(role);
    navigate(dest, { replace: true });
  }

  async function run(action: () => Promise<{ role: Role }>) {
    setBusy(true);
    setError(null);
    try {
      const session = await action();
      go(session.role);
    } catch {
      setError(t.bad);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="tricolour thin" aria-hidden />
      <main className="login-card">
        <div className="login-head">
          <EmblemCrest size={84} />
          <p className="login-eyebrow">{t.eyebrow}</p>
          <h1 className="login-title">{t.title}</h1>
        </div>

        {error && (
          <div className="notice-bar error" style={{ marginBottom: 16 }}>
            <span aria-hidden><AlertTriangle size={18} /></span>
            <span>{error}</span>
          </div>
        )}

        <form
          className="override-form"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void run(() => loginWithPassword(username, password));
          }}
        >
          <label className="field-label">{t.credentials}</label>
          <input
            className="text-input"
            placeholder={t.username}
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <input
            className="text-input"
            type="password"
            placeholder={t.password}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button type="submit" className="btn btn-primary sign-in-btn" disabled={busy || !username || !password}>
            {t.signIn}
          </button>
        </form>

        <div className="login-divider">
          <span className="field-label" style={{ margin: 0 }}>{t.ssoTitle}</span>
        </div>
        <form
          className="sso-row"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void run(() => loginWithSso(ssoEmail));
          }}
        >
          <input
            className="text-input"
            type="email"
            placeholder={t.ssoEmail}
            value={ssoEmail}
            onChange={(e) => setSsoEmail(e.target.value)}
          />
          <button type="submit" className="btn btn-ghost" disabled={busy || !ssoEmail.includes("@")}>
            {t.ssoBtn}
          </button>
        </form>

        <div className="login-divider">
          <span className="field-label" style={{ margin: 0 }}>{t.quick}</span>
        </div>
        <div className="login-roles">
          {ALL_ROLES.map((role) => {
            const m = ROLE_META[role];
            return (
              <button
                key={role}
                type="button"
                className="role-card"
                disabled={busy}
                onClick={() => void run(() => login(role))}
              >
                <span className="role-ic" aria-hidden><RoleIcon role={role} size={22} /></span>
                <span className="role-body">
                  <span className="role-name">
                    {m.label}
                    <span className="role-name-hi hi">{m.labelHi}</span>
                  </span>
                  <span className="role-blurb">{lang === "hi" ? m.blurbHi : m.blurb}</span>
                </span>
              </button>
            );
          })}
        </div>

        <p className="login-notice">{t.hint}</p>
        <Link to="/" className="login-back">{t.back}</Link>
      </main>
    </div>
  );
}
