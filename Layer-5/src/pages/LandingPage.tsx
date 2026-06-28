import { useState, useRef } from "react";
import { Link } from "react-router-dom";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Observer } from "gsap/Observer";
import { useGSAP } from "@gsap/react";
import {
  ShieldCheck,
  MapPin,
  Camera,
  Database,
  Brain,
  Siren,
  Eye,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import indiaGate from "../assets/IndiaGate.jpg";
import rashtrapatiBhavan from "../assets/Rashtrapati_Bhavan.jpg";
import redFort from "../assets/Red_Fort.jpg";
import traffic1 from "../assets/Traffic-1.jpg";
import traffic2 from "../assets/Traffic-2.jpg";
import traffic3 from "../assets/Traffic-3.jpg.jpeg";
import { Modal } from "../components/Modal";
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

gsap.registerPlugin(ScrollTrigger, Observer, useGSAP);

const HERO_PHOTOS = [indiaGate, rashtrapatiBhavan, redFort];
const TRAFFIC_PHOTOS = [traffic1, traffic2, traffic3];

const MINISTRIES = [
  { name: "Ministry of Road Transport & Highways", hindi: "सड़क परिवहन और राजमार्ग मंत्रालय", tag: "MoRTH" },
  { name: "Ministry of Housing & Urban Affairs", hindi: "आवासन और शहरी कार्य मंत्रालय", tag: "MoHUA" },
  { name: "Transport Department, GNCTD", hindi: "परिवहन विभाग, दिल्ली सरकार", tag: "Delhi" },
];

const APPROACH_ICONS: LucideIcon[] = [ShieldCheck, MapPin, Camera, Database];
const FEATURE_ICONS: LucideIcon[] = [Brain, Siren, ShieldCheck, Eye];

export function LandingPage() {
  const { lang } = useLang();
  const c = LANDING_CONTENT[lang];

  const [activeStep, setActiveStep] = useState<number | null>(null);
  const steps = c.approach.steps;
  const step = activeStep != null ? steps[activeStep] : null;

  const containerRef = useRef<HTMLDivElement>(null);
  const [activeSlide, setActiveSlide] = useState(0);
  const [dotsVisible, setDotsVisible] = useState(false);
  const gotoSlideRef = useRef<((index: number, direction: number) => void) | null>(null);

  useGSAP(() => {
    let animating = false;
    let currentIndex = -1;
    const sections = gsap.utils.toArray<HTMLElement>(".slide.section");
    
    if (!sections.length) return;

    gsap.set(sections, { autoAlpha: 0, zIndex: 0 });

    const gotoSection = (index: number, direction: number) => {
      if (animating) return;
      
      if (index < 0) {
        intentObserver.disable();
        document.body.style.overflow = "";
        window.scrollBy({ top: -50, behavior: "smooth" });
        return;
      }
      if (index >= sections.length) {
        intentObserver.disable();
        document.body.style.overflow = "";
        window.scrollBy({ top: 50, behavior: "smooth" });
        return;
      }

      animating = true;
      const dFactor = direction === 1 ? 1 : -1;
      
      const tl = gsap.timeline({
        defaults: { duration: 1, ease: "power3.inOut" },
        onComplete: () => {
          animating = false;
          setActiveSlide(index);
          sections.forEach((sec, i) => {
            if (i !== index) {
              gsap.set(sec, { autoAlpha: 0, pointerEvents: "none" });
            }
          });
        }
      });
      
      if (currentIndex >= 0) {
        gsap.set(sections[currentIndex], { zIndex: 0, pointerEvents: "none" });
        tl.to(sections[currentIndex], { 
          yPercent: -100 * dFactor, 
          autoAlpha: 0 
        }, 0);
      }
      
      gsap.set(sections[index], { zIndex: 1, pointerEvents: "auto" });
      tl.fromTo(sections[index], 
        { yPercent: 100 * dFactor, autoAlpha: 0 },
        { yPercent: 0, autoAlpha: 1 }, 
        0
      );
      
      const head = sections[index].querySelector(".section-head");
      const grid = sections[index].querySelector(".problem-grid, .approach-grid, .feature-grid, .flow");
      
      if (head) {
        tl.fromTo(head, { autoAlpha: 0, y: 40 }, { autoAlpha: 1, y: 0, duration: 0.8 }, 0.4);
      }
      if (grid) {
        tl.fromTo(grid.children, { autoAlpha: 0, y: 40 }, { autoAlpha: 1, y: 0, duration: 0.6, stagger: 0.1 }, 0.5);
      }
      
      currentIndex = index;
    };

    gotoSlideRef.current = gotoSection;

    const intentObserver = Observer.create({
      target: window,
      type: "wheel,touch,pointer",
      wheelSpeed: -1,
      onDown: () => !animating && gotoSection(currentIndex + 1, 1),
      onUp: () => !animating && gotoSection(currentIndex - 1, -1),
      tolerance: 10,
      preventDefault: true
    });
    intentObserver.disable();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!intentObserver.isEnabled) return;
      if (['ArrowDown', 'ArrowRight', 'PageDown'].includes(e.key)) {
        e.preventDefault();
        !animating && gotoSection(currentIndex + 1, 1);
      } else if (['ArrowUp', 'ArrowLeft', 'PageUp'].includes(e.key)) {
        e.preventDefault();
        !animating && gotoSection(currentIndex - 1, -1);
      }
    };
    window.addEventListener("keydown", handleKeyDown, { passive: false });

    ScrollTrigger.create({
      trigger: containerRef.current,
      start: "top top",
      end: "+=1",
      onEnter: () => {
        document.body.style.overflow = "hidden";
        intentObserver.enable();
        setDotsVisible(true);
        if (currentIndex < 0) gotoSection(0, 1);
      },
      onEnterBack: () => {
        document.body.style.overflow = "hidden";
        intentObserver.enable();
        setDotsVisible(true);
        if (currentIndex >= sections.length) gotoSection(sections.length - 1, -1);
      }
    });

    return () => {
      intentObserver.kill();
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, { scope: containerRef });

  const handleDotClick = (index: number) => {
    if (gotoSlideRef.current && index !== activeSlide) {
      gotoSlideRef.current(index, index > activeSlide ? 1 : -1);
    }
  };

  return (
    <div className="landing">
      <UtilityBar />
      <GovHeader />

      <main className="landing-main" id="main" style={{ paddingBottom: 0 }}>
        {/* Normal scroll area */}
        <div className="hero-scroll-area">
          <section className="hero">
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
                <a className="btn btn-ghost" href="#problem" onClick={(e) => {
                  e.preventDefault();
                  document.querySelector('.slides-wrapper')?.scrollIntoView({ behavior: 'smooth' });
                }}>
                  {c.hero.ctaSecondary}
                </a>
                <Link to="/live-traffic" className="btn btn-ghost">
                  {lang === "hi" ? "लाइव ट्रैफ़िक देखें" : "View Live Traffic"}
                </Link>
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

          <section className="ministries-strip" aria-label="Aligned national programmes">
            <div className="ministries-cap">{c.ministriesCap}</div>
            <div className="ministries-row">
              {MINISTRIES.map((m) => (
                <MinistryCrest key={m.name} name={m.name} hindi={m.hindi} tag={m.tag} />
              ))}
            </div>
          </section>

          <SectionDivider />
        </div>

        {/* Slides Area */}
        <div className="slides-wrapper" ref={containerRef}>
          {/* Navigation Dots */}
          <div className={`nav-dots ${dotsVisible ? "visible" : ""}`}>
            {[0, 1, 2].map((i) => (
              <button
                key={i}
                type="button"
                className={`nav-dot ${activeSlide === i ? "active" : ""}`}
                onClick={() => handleDotClick(i)}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>

          <section id="problem" className="slide section section-problem">
            <PhotoBackdrop className="problem-bg" images={TRAFFIC_PHOTOS} interval={8} />
            <div className="section-head">
              <div className="section-eyebrow">
                <span className="eyebrow-tick" aria-hidden />
                {c.problem.eyebrow}
              </div>
              <h2 className="section-title">{c.problem.title}</h2>
              <p className="section-lede">{c.problem.lede}</p>
            </div>
            <div className="problem-grid">
              {c.problem.cards.map((p) => (
                <article className="problem-card" key={p.label}>
                  <div className="problem-figure">{p.figure}</div>
                  <div className="problem-label">{p.label}</div>
                  <div className="problem-note">{p.note}</div>
                </article>
              ))}
            </div>
          </section>

          <section id="approach" className="slide section section-approach">
            <div className="section-head">
              <div className="section-eyebrow">
                <span className="eyebrow-tick" aria-hidden />
                {c.approach.eyebrow}
              </div>
              <h2 className="section-title text-center">{c.approach.title}</h2>
            </div>

            <div className="flow">
              <div className="flow-track">
                <div className="flow-rail" aria-hidden>
                  <span className="flow-rail-pulse" />
                </div>
                {steps.map((p, i) => {
                  const Glyph = FLOW_GLYPHS[i % FLOW_GLYPHS.length];
                  return (
                    <div className="flow-cell" key={p.step}>
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
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="approach-grid">
              {c.approach.cards.map((a, i) => {
                const ApproachIcon = APPROACH_ICONS[i];
                return (
                  <article className="approach-card" key={a.title}>
                    <span className="approach-icon" aria-hidden>
                      <ApproachIcon size={26} strokeWidth={1.8} />
                    </span>
                    <h3>{a.title}</h3>
                    <p>{a.body}</p>
                  </article>
                );
              })}
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
                      {lang === "hi" ? "पिछला" : "Previous"}
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

          <section id="features" className="slide section section-features">
            <div className="section-head section-head-center">
              <div className="section-eyebrow">
                <span className="eyebrow-tick" aria-hidden />
                {c.features.eyebrow}
              </div>
              <h2 className="section-title">{c.features.title}</h2>
            </div>
            <div className="feature-grid">
              {c.features.cards.map((f, i) => {
                const FeatIcon = FEATURE_ICONS[i];
                return (
                  <article className="feature" key={f.title}>
                    <span className="feature-index" aria-hidden>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="ficon" aria-hidden>
                      <FeatIcon size={28} strokeWidth={1.8} />
                    </span>
                    <h3>{f.title}</h3>
                    <p>{f.body}</p>
                    <span className="feature-accent" aria-hidden />
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      </main>

      <GovFooter />
    </div>
  );
}
