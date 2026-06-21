import { Link } from "react-router-dom";

import { AshokaChakra } from "../components/gov/Emblem";
import { GovFooter } from "../components/gov/GovFooter";
import { GovHeader } from "../components/gov/GovHeader";

const FEATURES = [
  {
    icon: "🧠",
    title: "AI Signal Optimization",
    body: "Computer-vision perception drives a max-pressure optimizer that retimes every junction in real time.",
  },
  {
    icon: "🚑",
    title: "Emergency Green Corridor",
    body: "Cryptographically signed, GPS-verified ambulance priority — a clear path when seconds matter.",
  },
  {
    icon: "🛡️",
    title: "Safety-First Control",
    body: "A deterministic Safety Supervisor owns every signal change: no conflicting greens, enforced clearances.",
  },
  {
    icon: "📊",
    title: "Live Transparency",
    body: "Operators see every decision and its reasoning, cycle by cycle, with a full audit trail.",
  },
];

const STATS = [
  { num: "30s", lbl: "Optimization cycle" },
  { num: "4", lbl: "Approaches per junction" },
  { num: "100%", lbl: "Signal changes safety-checked" },
  { num: "24×7", lbl: "Autonomous operation" },
];

export function LandingPage() {
  return (
    <div className="landing">
      <GovHeader />

      <main className="landing-main">
        <section className="hero">
          <div className="emblem-xl">
            <AshokaChakra size={84} />
          </div>
          <div className="eyebrow">Government of NCT of Delhi · Transport Department</div>
          <h1>Smart Traffic Management System</h1>
          <div className="hi-title hi">स्मार्ट यातायात प्रबंधन प्रणाली</div>
          <p className="lede">
            A person-centric, safety-first traffic-signal platform for Delhi —
            uniting AI perception, real-time optimization, and a secure
            emergency green-corridor service across the city's junctions.
          </p>
          <div className="hero-cta">
            <Link to="/dashboard" className="btn btn-primary">
              Enter Control Center →
            </Link>
            <a className="btn btn-ghost" href="#features">
              Learn more
            </a>
          </div>

          <div className="landing-stats">
            {STATS.map((s) => (
              <div className="landing-stat" key={s.lbl}>
                <div className="num">{s.num}</div>
                <div className="lbl">{s.lbl}</div>
              </div>
            ))}
          </div>
        </section>

        <section id="features" className="feature-grid">
          {FEATURES.map((f) => (
            <article className="feature" key={f.title}>
              <span className="ficon">{f.icon}</span>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </article>
          ))}
        </section>
      </main>

      <GovFooter />
    </div>
  );
}
