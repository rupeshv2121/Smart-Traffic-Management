import { useState } from "react";
import { Link } from "react-router-dom";

import indiaGate from "../assets/IndiaGate.jpg";
import rashtrapatiBhavan from "../assets/Rashtrapati_Bhavan.jpg";
import redFort from "../assets/Red_Fort.jpg";
import traffic1 from "../assets/Traffic-1.jpg";
import traffic2 from "../assets/Traffic-2.jpg";
import traffic3 from "../assets/Traffic-3.jpg.jpeg";
import { Modal } from "../components/Modal";
import { Reveal } from "../components/Reveal";
import { DelhiSkyline } from "../components/gov/DelhiSkyline";
import { EmblemCrest } from "../components/gov/Emblem";
import { FLOW_GLYPHS } from "../components/gov/FlowGlyphs";
import { GovFooter } from "../components/gov/GovFooter";
import { GovHeader } from "../components/gov/GovHeader";
import { MinistryCrest } from "../components/gov/MinistryCrest";
import { PhotoBackdrop } from "../components/gov/PhotoBackdrop";
import { SectionDivider } from "../components/gov/SectionDivider";
import { STAT_GLYPHS } from "../components/gov/StatGlyphs";
import { UtilityBar } from "../components/gov/UtilityBar";
import { useLang } from "../context/LangContext";
import { LANDING_CONTENT } from "../i18n/landingContent";

// Delhi landmarks for the hero crossfade; traffic scenes behind the problem.
const HERO_PHOTOS = [indiaGate, rashtrapatiBhavan, redFort];
const TRAFFIC_PHOTOS = [traffic1, traffic2, traffic3];

const MINISTRIES = [
  { name: "Ministry of Road Transport & Highways", hindi: "सड़क परिवहन और राजमार्ग मंत्रालय", tag: "MoRTH" },
  { name: "Ministry of Housing & Urban Affairs", hindi: "आवासन और शहरी कार्य मंत्रालय", tag: "MoHUA" },
  { name: "Transport Department, GNCTD", hindi: "परिवहन विभाग, दिल्ली सरकार", tag: "Delhi" },
];

export function LandingPage() {
  const { lang } = useLang();
  const c = LANDING_CONTENT[lang];

  // Which pipeline step's detail popup is open (null = none).
  const [activeStep, setActiveStep] = useState<number | null>(null);
  const steps = c.approach.steps;
  const step = activeStep != null ? steps[activeStep] : null;

  return (
    <div className="landing">
      <UtilityBar />
      <GovHeader />

      <main className="landing-main" id="main">
        <section className="hero">
          {/* Delhi landmarks — slow crossfade, faint behind the hero copy */}
          <PhotoBackdrop className="hero-bg" images={HERO_PHOTOS} interval={7} />
          <DelhiSkyline className="hero-skyline" />
          <div className="hero-content">
            <div className="emblem-xl">
              <EmblemCrest size={112} />
            </div>
            <div className="eyebrow">{c.hero.eyebrow}</div>

            <div className="hero-titlewrap">
              <h1>
                {c.hero.title}
                <span className="beta-badge">{c.hero.beta}</span>
              </h1>
              <span className="title-underline" aria-hidden />
            </div>
            <div className="hi-title hi">{c.hero.titleAlt}</div>

            <p className="tagline">{c.hero.tagline}</p>
            <p className="lede">{c.hero.lede}</p>

            <div className="hero-cta">
              <Link to="/dashboard" className="btn btn-primary">
                {c.hero.ctaPrimary}
              </Link>
              <a className="btn btn-ghost" href="#problem">
                {c.hero.ctaSecondary}
              </a>
            </div>

            <div className="quicklinks">
              <span className="quicklinks-cap">
                {lang === "hi" ? "त्वरित पहुँच :" : "Quick access :"}
              </span>
              {c.chips.map((chip) => (
                <Link key={chip.to} to={chip.to} className="chip">
                  {chip.label}
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Floating stats card overlapping the hero, india.gov.in style */}
        <section className="stats-float" aria-label="Platform at a glance">
          {c.stats.map((s, i) => {
            const Glyph = STAT_GLYPHS[i % STAT_GLYPHS.length];
            return (
              <div className="stat-cell" key={s.lbl}>
                <span className="stat-ic" aria-hidden>
                  <Glyph />
                </span>
                <div className="stat-text">
                  <div className="num">{s.num}</div>
                  <div className="lbl">{s.lbl}</div>
                </div>
              </div>
            );
          })}
        </section>

        {/* Partner ministries & national programmes */}
        <section className="ministries-strip" aria-label="Aligned national programmes">
          <div className="ministries-cap">{c.ministriesCap}</div>
          <div className="ministries-row">
            {MINISTRIES.map((m) => (
              <MinistryCrest key={m.name} name={m.name} hindi={m.hindi} tag={m.tag} />
            ))}
          </div>
        </section>

        <SectionDivider />

        {/* The problem */}
        <section id="problem" className="section section-problem">
          {/* Real Delhi traffic scenes, faint behind the problem cards */}
          <PhotoBackdrop className="problem-bg" images={TRAFFIC_PHOTOS} interval={8} />
          <Reveal className="section-head" variant="up">
            <div className="section-eyebrow">
              <span className="eyebrow-tick" aria-hidden />
              {c.problem.eyebrow}
            </div>
            <h2 className="section-title">{c.problem.title}</h2>
            <p className="section-lede">{c.problem.lede}</p>
          </Reveal>
          <div className="problem-grid">
            {c.problem.cards.map((p, i) => (
              <Reveal
                as="article"
                className="problem-card"
                key={p.label}
                variant="up"
                delay={i * 90}
              >
                <div className="problem-figure">{p.figure}</div>
                <div className="problem-label">{p.label}</div>
                <div className="problem-note">{p.note}</div>
              </Reveal>
            ))}
          </div>
        </section>

        <SectionDivider />

        {/* Our approach — solution architecture */}
        <section id="approach" className="section section-approach">
          <Reveal className="section-head" variant="up">
            <div className="section-eyebrow">
              <span className="eyebrow-tick" aria-hidden />
              {c.approach.eyebrow}
            </div>
            <h2 className="section-title text-center">{c.approach.title}</h2>
            {/* <p className="section-lede">{c.approach.lede}</p> */}
          </Reveal>

          <div className="flow">
            <div className="flow-track">
              <div className="flow-rail" aria-hidden>
                <span className="flow-rail-pulse" />
              </div>
              {steps.map((p, i) => {
                const Glyph = FLOW_GLYPHS[i % FLOW_GLYPHS.length];
                return (
                  <Reveal className="flow-cell" key={p.step} variant="up" delay={i * 120}>
                    <button
                      type="button"
                      className={`flow-node${activeStep === i ? " is-active" : ""}`}
                      onClick={() => setActiveStep(i)}
                      aria-haspopup="dialog"
                    >
                      <span className="flow-orb">
                        <span className="flow-step">{p.step}</span>
                        <span className="flow-ic" aria-hidden>
                          <Glyph />
                        </span>
                      </span>
                      <span className="flow-title">{p.title}</span>
                      <span className="flow-more">
                        {lang === "hi" ? "विवरण देखें" : "View details"}
                        <span aria-hidden> →</span>
                      </span>
                    </button>
                  </Reveal>
                );
              })}
            </div>
          </div>

          <div className="approach-grid">
            {c.approach.cards.map((a, i) => (
              <Reveal
                as="article"
                className="approach-card"
                key={a.title}
                variant="scale"
                delay={i * 80}
              >
                <span className="approach-icon">{a.icon}</span>
                <h3>{a.title}</h3>
                <p>{a.body}</p>
              </Reveal>
            ))}
          </div>

          {step && activeStep != null && (
            <Modal
              onClose={() => setActiveStep(null)}
              labelledBy="flow-modal-title"
              closeLabel={lang === "hi" ? "बंद करें" : "Close"}
            >
              <div className="step-modal">
                <div className="step-modal-head">
                  <span className="pipe-num lg">{step.step}</span>
                  <div>
                    <h3 id="flow-modal-title">{step.title}</h3>
                    <span className="pipe-tag">{step.tag}</span>
                  </div>
                </div>
                <p className="step-modal-body">{step.body}</p>
                <div className="step-modal-nav">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setActiveStep((s) => (s != null ? s - 1 : s))}
                    disabled={activeStep === 0}
                  >
                    ← {lang === "hi" ? "पिछला" : "Previous"}
                  </button>
                  <span className="step-modal-count">
                    {activeStep + 1} / {steps.length}
                  </span>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setActiveStep((s) => (s != null ? s + 1 : s))}
                    disabled={activeStep === steps.length - 1}
                  >
                    {lang === "hi" ? "अगला" : "Next"} →
                  </button>
                </div>
              </div>
            </Modal>
          )}
        </section>

        <SectionDivider />

        {/* Capabilities */}
        <section id="features" className="section section-features">
          <Reveal className="section-head section-head-center" variant="up">
            <div className="section-eyebrow">
              <span className="eyebrow-tick" aria-hidden />
              {c.features.eyebrow}
            </div>
            <h2 className="section-title">{c.features.title}</h2>
          </Reveal>
          <div className="feature-grid">
            {c.features.cards.map((f, i) => (
              <Reveal
                as="article"
                className="feature"
                key={f.title}
                variant="up"
                delay={i * 90}
              >
                <span className="feature-index" aria-hidden>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="ficon">{f.icon}</span>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
                <span className="feature-accent" aria-hidden />
              </Reveal>
            ))}
          </div>
        </section>
      </main>

      <GovFooter />
    </div>
  );
}
