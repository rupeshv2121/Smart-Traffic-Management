import { Link } from "react-router-dom";

import { useLang } from "../../context/LangContext";
import { LANDING_CONTENT } from "../../i18n/landingContent";
import { AshokaChakra } from "./Emblem";

/**
 * Government-standard footer: identity lockup + about, link columns
 * (control center / explore / policies / related links), a contact block,
 * and a bottom bar with copyright, ownership credit and statutory links.
 * Fully bilingual via the language toggle.
 */
export function GovFooter() {
  const { lang } = useLang();
  const f = LANDING_CONTENT[lang].footer;

  // Internal routes use react-router; "#..." anchors and http links use <a>.
  const renderLink = (label: string, to: string, ext?: boolean) => {
    if (ext) {
      return (
        <a href={to} target="_blank" rel="noreferrer noopener">
          {label}
          <span className="ext-mark" aria-hidden> ↗</span>
        </a>
      );
    }
    if (to.startsWith("#") || to === "#") {
      return <a href={to}>{label}</a>;
    }
    return <Link to={to}>{label}</Link>;
  };

  return (
    <footer className="gov-footer">
      <div className="tricolour thin" />

      <div className="gov-footer-top">
        <div className="gov-footer-grid">
          {/* Identity + about + social */}
          <div className="gf-brand">
            <div className="gf-brand-head">
              <span className="gf-emblem">
                <AshokaChakra size={46} />
              </span>
              <div className="gf-brand-text">
                <strong>Smart Traffic Management System</strong>
                <span className="gf-brand-sub">
                  {lang === "hi"
                    ? "परिवहन विभाग · दिल्ली सरकार"
                    : "Transport Department · Govt. of NCT of Delhi"}
                </span>
              </div>
            </div>
            <p className="gf-about">{f.about}</p>

            <div className="gf-social">
              <span className="gf-social-label">{f.socialLabel}</span>
              <div className="gf-social-row">
                <a className="gf-social-ic" href="#" aria-label="X (Twitter)"><XGlyph /></a>
                <a className="gf-social-ic" href="#" aria-label="Facebook"><FbGlyph /></a>
                <a className="gf-social-ic" href="#" aria-label="YouTube"><YtGlyph /></a>
                <a className="gf-social-ic" href="#" aria-label="Instagram"><IgGlyph /></a>
              </div>
            </div>
          </div>

          {/* Link columns */}
          {f.cols.map((col) => (
            <nav className="gf-col" key={col.title} aria-label={col.title}>
              <h4 className="gf-col-title">{col.title}</h4>
              <ul>
                {col.links.map((l) => (
                  <li key={l.label}>{renderLink(l.label, l.to, l.ext)}</li>
                ))}
              </ul>
            </nav>
          ))}

          {/* Contact */}
          <address className="gf-contact">
            <h4 className="gf-col-title">{f.contact.title}</h4>
            <div className="gf-contact-row">
              <PinGlyph />
              <span>
                <strong>{f.contact.dept}</strong>
                <br />
                {f.contact.address}
              </span>
            </div>
            <div className="gf-contact-row">
              <MailGlyph />
              <span>
                {f.contact.emailLabel}:{" "}
                <a href={`mailto:${f.contact.email}`}>{f.contact.email}</a>
              </span>
            </div>
            <div className="gf-contact-row">
              <PhoneGlyph />
              <span>
                {f.contact.helplineLabel}: <strong>{f.contact.helpline}</strong>
              </span>
            </div>
          </address>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="gov-footer-bottom">
        <div className="gf-bottom-inner">
          <div className="gf-bottom-left">
            <div>{f.copyright}</div>
            <div className="gf-credit">{f.credit}</div>
          </div>
          <div className="gf-bottom-right">
            <ul className="gf-bottom-links">
              {f.bottomLinks.map((l) => (
                <li key={l.label}>
                  <a href={l.to}>{l.label}</a>
                </li>
              ))}
            </ul>
            <div className="gf-updated">{f.lastUpdated}</div>
          </div>
        </div>
      </div>
    </footer>
  );
}

/* ── Inline icons ─────────────────────────────────── */
const stroke = {
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function PinGlyph() {
  return (
    <svg className="gf-ic" width="17" height="17" viewBox="0 0 24 24" {...stroke} aria-hidden>
      <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}
function MailGlyph() {
  return (
    <svg className="gf-ic" width="17" height="17" viewBox="0 0 24 24" {...stroke} aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
}
function PhoneGlyph() {
  return (
    <svg className="gf-ic" width="17" height="17" viewBox="0 0 24 24" {...stroke} aria-hidden>
      <path d="M6.5 3.5 9 4l1 4-2 1.5a12 12 0 0 0 6.5 6.5L16 14l4 1 .5 2.5A2 2 0 0 1 18.5 20 15 15 0 0 1 4 5.5 2 2 0 0 1 6.5 3.5Z" />
    </svg>
  );
}
function XGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.5 3h3l-7 8 8.2 10h-6.4l-5-6.1L8 21H5l7.4-8.5L4.5 3h6.5l4.5 5.6L17.5 3Zm-1.1 16h1.7L8.2 4.8H6.4L16.4 19Z" />
    </svg>
  );
}
function FbGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M14 8.5V7c0-.7.3-1 1-1h1.5V3H14c-2.2 0-3.5 1.4-3.5 3.7V8.5H8.5V12h2V21H14v-9h2.3l.5-3.5H14Z" />
    </svg>
  );
}
function YtGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M21.6 7.2a2.6 2.6 0 0 0-1.8-1.8C18 5 12 5 12 5s-6 0-7.8.4A2.6 2.6 0 0 0 2.4 7.2 27 27 0 0 0 2 12a27 27 0 0 0 .4 4.8 2.6 2.6 0 0 0 1.8 1.8C6 19 12 19 12 19s6 0 7.8-.4a2.6 2.6 0 0 0 1.8-1.8A27 27 0 0 0 22 12a27 27 0 0 0-.4-4.8ZM10 15V9l5 3-5 3Z" />
    </svg>
  );
}
function IgGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" {...stroke} aria-hidden>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17" cy="7" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
