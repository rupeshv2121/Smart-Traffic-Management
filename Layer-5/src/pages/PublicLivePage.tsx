import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { CityMap } from "../components/command/CityMap";
import { GovFooter } from "../components/gov/GovFooter";
import { GovHeader } from "../components/gov/GovHeader";
import { UtilityBar } from "../components/gov/UtilityBar";
import { ConnectionChip } from "../components/ConnectionChip";
import { Ambulance, OctagonAlert } from "../components/icons/AppIcons";
import { useLang } from "../context/LangContext";
import { useStream } from "../context/StreamContext";
import { CONGESTION_COLOR, CONGESTION_LABEL, CONGESTION_LABEL_HI } from "../lib/congestion";

const COPY = {
  en: {
    title: "Delhi Live Traffic",
    sub: "Real-time junction conditions across the city network.",
    map: "Live Network Map",
    clearest: "Clearest routes now",
    avoid: "Heavy — expect delays",
    alerts: "Public Alerts",
    noAlerts: "No public alerts at this time.",
    planner: "Plan a route",
    from: "From",
    to: "To",
    advisory: "Advisory",
    operator: "Operator sign up",
    vehicles: "vehicles",
  },
  hi: {
    title: "दिल्ली लाइव यातायात",
    sub: "पूरे शहर नेटवर्क में वास्तविक समय की जंक्शन स्थिति।",
    map: "लाइव नेटवर्क मानचित्र",
    clearest: "अभी सबसे साफ़ मार्ग",
    avoid: "भारी — देरी की संभावना",
    alerts: "सार्वजनिक चेतावनियाँ",
    noAlerts: "इस समय कोई सार्वजनिक चेतावनी नहीं।",
    planner: "मार्ग योजना",
    from: "से",
    to: "तक",
    advisory: "सलाह",
    operator: "संचालक साइन-इन →",
    vehicles: "वाहन",
  },
} as const;

export function PublicLivePage() {
  const { city, connection } = useStream();
  const { lang } = useLang();
  const t = COPY[lang];
  const label = lang === "hi" ? CONGESTION_LABEL_HI : CONGESTION_LABEL;

  const junctions = city?.junctions ?? [];
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const sorted = useMemo(
    () => [...junctions].sort((a, b) => a.congestionScore - b.congestionScore),
    [junctions],
  );
  const clearest = sorted.slice(0, 3);
  const busiest = [...sorted].reverse().slice(0, 3);

  const publicAlerts = (city?.incidents ?? []).filter(
    (i) => i.kind === "EMERGENCY" || i.kind === "GRIDLOCK",
  );

  const route = useMemo(() => {
    const f = junctions.find((j) => j.id === from);
    const tt = junctions.find((j) => j.id === to);
    if (!f || !tt) return null;
    const avg = (f.congestionScore + tt.congestionScore) / 2;
    const lvl =
      avg < 0.4 ? "CLEAR" : avg < 0.6 ? "MODERATE" : avg < 0.8 ? "HEAVY" : "GRIDLOCK";
    return { f, tt, lvl: lvl as keyof typeof CONGESTION_COLOR, avg };
  }, [from, to, junctions]);

  return (
    <div className="landing">
      <UtilityBar />
      <GovHeader
        actions={
          <Link to="/login" className="btn btn-ghost">
            {t.operator}
          </Link>
        }
      />
      <main className="landing-main">
        <div className="page" style={{ maxWidth: 1180, margin: "0 auto" }}>
          <div className="mb-20">
            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <h1 style={{ color: "var(--navy)", fontSize: 30, margin: 0 }}>{t.title}</h1>
              <ConnectionChip state={connection} />
            </div>
            <p className="muted" style={{ marginTop: 6 }}>{t.sub}</p>
          </div>

          <div className="cols cols-2 mb-20">
            <section className="card">
              <h2 className="card-title">{t.map}</h2>
              {city ? (
                <CityMap junctions={junctions} selectedId={null} onSelect={() => { }} />
              ) : (
                <p className="feed-empty">Connecting to live feed…</p>
              )}
              <div className="map-legend">
                {(["CLEAR", "SMOOTH", "MODERATE", "HEAVY", "GRIDLOCK"] as const).map((l) => (
                  <span key={l} className="legend-item">
                    <span className="legend-dot" style={{ background: CONGESTION_COLOR[l] }} />
                    {label[l]}
                  </span>
                ))}
              </div>
            </section>

            <div>
              <section className="card mb-20">
                <h2 className="card-title">{t.alerts}</h2>
                {publicAlerts.length === 0 ? (
                  <p className="feed-empty">{t.noAlerts}</p>
                ) : (
                  <ul className="incident-feed">
                    {publicAlerts.map((a) => (
                      <li key={a.id} className={`incident sev-${a.severity}`}>
                        <span className="inc-ic" aria-hidden>
                          {a.kind === "EMERGENCY" ? <Ambulance size={18} /> : <OctagonAlert size={18} />}
                        </span>
                        <div className="inc-body">
                          <div className="inc-msg">{a.message}</div>
                          <div className="inc-meta">{a.junctionCode}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="card">
                <h2 className="card-title">{t.planner}</h2>
                <div className="cols cols-2" style={{ gap: 12 }}>
                  <div>
                    <label className="field-label">{t.from}</label>
                    <select className="text-input" value={from} onChange={(e) => setFrom(e.target.value)}>
                      <option value="">—</option>
                      {junctions.map((j) => (
                        <option key={j.id} value={j.id}>{j.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="field-label">{t.to}</label>
                    <select className="text-input" value={to} onChange={(e) => setTo(e.target.value)}>
                      <option value="">—</option>
                      {junctions.map((j) => (
                        <option key={j.id} value={j.id}>{j.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                {route && (
                  <div className="map-selected" style={{ marginTop: 14 }}>
                    <div className="ms-head">
                      <span className="jx-name">{route.f.name} → {route.tt.name}</span>
                      <span className="pill" style={{ marginLeft: "auto", background: "#eef4ff", color: "var(--navy)" }}>
                        {t.advisory}
                      </span>
                    </div>
                    <p className="oa-line">
                      <span className="cong-dot" style={{ background: CONGESTION_COLOR[route.lvl], display: "inline-block", marginRight: 8 }} />
                      {label[route.lvl]} · {Math.round(route.avg * 100)}% avg occupancy
                    </p>
                  </div>
                )}
              </section>
            </div>
          </div>

          <div className="cols cols-2">
            <section className="card">
              <h2 className="card-title">{t.clearest}</h2>
              {clearest.map((j) => (
                <div className="kv" key={j.id}>
                  <span className="k">{j.name}</span>
                  <span className="cong-cell">
                    <span className="cong-dot" style={{ background: CONGESTION_COLOR[j.congestionLevel] }} />
                    {label[j.congestionLevel]}
                  </span>
                </div>
              ))}
            </section>
            <section className="card">
              <h2 className="card-title">{t.avoid}</h2>
              {busiest.map((j) => (
                <div className="kv" key={j.id}>
                  <span className="k">{j.name}</span>
                  <span className="cong-cell">
                    <span className="cong-dot" style={{ background: CONGESTION_COLOR[j.congestionLevel] }} />
                    {label[j.congestionLevel]} · {j.vehicleCount} {t.vehicles}
                  </span>
                </div>
              ))}
            </section>
          </div>
        </div>
      </main>
      <GovFooter />
    </div>
  );
}
