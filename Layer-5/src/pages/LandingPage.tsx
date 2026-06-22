import { Link } from "react-router-dom";

import { DelhiSkyline } from "../components/gov/DelhiSkyline";
import { AshokaChakra } from "../components/gov/Emblem";
import { GovFooter } from "../components/gov/GovFooter";
import { GovHeader } from "../components/gov/GovHeader";
import { MinistryCrest } from "../components/gov/MinistryCrest";

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

// The problem we are solving — Delhi-specific congestion impact.
const PROBLEM = [
  {
    figure: "₹60,000 cr",
    label: "Estimated annual economic loss to congestion across India's metros",
    note: "Fuel burn, lost productivity and freight delay (NCR among the worst-hit).",
  },
  {
    figure: "~1.5 hrs",
    label: "Daily commute time lost per Delhi road user in peak hours",
    note: "Fixed-timer signals can't adapt to surging, uneven demand.",
  },
  {
    figure: "10+ min",
    label: "Avoidable delay an ambulance can face crossing congested corridors",
    note: "No verified, city-wide priority path for emergency vehicles today.",
  },
  {
    figure: "Manual",
    label: "Most junctions still run pre-set or hand-controlled timing plans",
    note: "Little real-time sensing, no audit trail, no safety interlocks.",
  },
];

// Our approach — the five-layer sense → process → decide → guard → act → log pipeline.
const PIPELINE = [
  {
    step: "01",
    title: "Perception",
    body: "Roadside cameras feed YOLOv8 / OpenCV vehicle detection at every approach.",
    tag: "Layer 2 · GatiShakti-ML",
  },
  {
    step: "02",
    title: "Processing & Detection",
    body: "Per-approach demand, queue pressure and emergency-vehicle presence are extracted.",
    tag: "Detection",
  },
  {
    step: "03",
    title: "Decision & Optimization",
    body: "A max-pressure optimizer chooses the next phase; A*/D* logic frames green corridors.",
    tag: "Layer 3 · STM",
  },
  {
    step: "04",
    title: "Safety Supervisor",
    body: "A deterministic guard vets every change — no conflicting greens, enforced all-red & ped phases.",
    tag: "Guard",
  },
  {
    step: "05",
    title: "Control & Logging",
    body: "Validated plans drive the signals; every cycle streams to this dashboard and the audit log.",
    tag: "Layer 4–5",
  },
];

// How emergency priority is trusted end-to-end.
const APPROACH = [
  {
    icon: "🔐",
    title: "Verify once, trust per-junction",
    body: "At dispatch the vehicle gets a signed, time-bound, route-scoped, revocable token (Ed25519).",
  },
  {
    icon: "🛰️",
    title: "GPS-matched route gate",
    body: "Each junction checks the token signature and that the live GPS track matches its claimed route.",
  },
  {
    icon: "🎥",
    title: "Camera corroboration",
    body: "ANPR only confirms the vehicle has passed — it never opens the gate on its own.",
  },
  {
    icon: "🧩",
    title: "Two systems, one shared DB",
    body: "Edge control and digital apps stay decoupled through a strict Data Access Layer.",
  },
];

const MINISTRIES = [
  { name: "Ministry of Road Transport & Highways", hindi: "सड़क परिवहन और राजमार्ग मंत्रालय", tag: "MoRTH" },
  { name: "Ministry of Housing & Urban Affairs", hindi: "आवासन और शहरी कार्य मंत्रालय", tag: "MoHUA" },
  { name: "Transport Department, GNCTD", hindi: "परिवहन विभाग, दिल्ली सरकार", tag: "Delhi" },
];

export function LandingPage() {
  return (
    <div className="landing">
      <GovHeader />

      <main className="landing-main">
        <section className="hero">
          <DelhiSkyline className="hero-skyline" />
          <div className="hero-content">
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
              <a className="btn btn-ghost" href="#problem">
                See the problem & approach
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
          </div>
        </section>

        {/* Partner ministries & national programmes */}
        <section className="ministries-strip" aria-label="Aligned national programmes">
          <div className="ministries-cap">Aligned with national programmes</div>
          <div className="ministries-row">
            {MINISTRIES.map((m) => (
              <MinistryCrest key={m.name} name={m.name} hindi={m.hindi} tag={m.tag} />
            ))}
          </div>
        </section>

        {/* The problem */}
        <section id="problem" className="section">
          <div className="section-head">
            <div className="section-eyebrow">The Problem</div>
            <h2 className="section-title">Delhi's roads lose time, money and lives to static signals</h2>
            <p className="section-lede">
              Conventional fixed-timer junctions can't react to real demand, and
              there is no trustworthy, city-wide priority path for emergency
              vehicles. The cost is measured in hours, rupees and minutes that
              ambulances cannot spare.
            </p>
          </div>
          <div className="problem-grid">
            {PROBLEM.map((p) => (
              <article className="problem-card" key={p.label}>
                <div className="problem-figure">{p.figure}</div>
                <div className="problem-label">{p.label}</div>
                <div className="problem-note">{p.note}</div>
              </article>
            ))}
          </div>
        </section>

        {/* Our approach — solution architecture */}
        <section id="approach" className="section">
          <div className="section-head">
            <div className="section-eyebrow">Our Approach</div>
            <h2 className="section-title">A five-layer pipeline: sense → process → decide → guard → act → log</h2>
            <p className="section-lede">
              Two systems share one database — a physical edge loop and a digital
              applications layer — so every signal change is sensed, optimized,
              safety-checked and audited in a single 30-second cycle.
            </p>
          </div>

          <div className="pipeline">
            {PIPELINE.map((p, i) => (
              <div className="pipe-step" key={p.step}>
                <div className="pipe-num">{p.step}</div>
                <h3 className="pipe-title">{p.title}</h3>
                <p className="pipe-body">{p.body}</p>
                <span className="pipe-tag">{p.tag}</span>
                {i < PIPELINE.length - 1 && <span className="pipe-arrow" aria-hidden>→</span>}
              </div>
            ))}
          </div>

          <div className="approach-grid">
            {APPROACH.map((a) => (
              <article className="approach-card" key={a.title}>
                <span className="approach-icon">{a.icon}</span>
                <h3>{a.title}</h3>
                <p>{a.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Capabilities */}
        <section id="features" className="section">
          <div className="section-head">
            <div className="section-eyebrow">Capabilities</div>
            <h2 className="section-title">What the platform delivers</h2>
          </div>
          <div className="feature-grid">
            {FEATURES.map((f) => (
              <article className="feature" key={f.title}>
                <span className="ficon">{f.icon}</span>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <GovFooter />
    </div>
  );
}
