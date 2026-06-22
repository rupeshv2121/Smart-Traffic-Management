import { useLang } from "../../context/LangContext";
import { LANDING_CONTENT } from "../../i18n/landingContent";

/**
 * Slim government utility strip, modelled on india.gov.in's top bar:
 * skip-link on the left; accessibility + language controls on the right.
 * The language control is functional and drives the whole landing page.
 */
export function UtilityBar() {
  const { lang, toggle } = useLang();
  const t = LANDING_CONTENT[lang].utility;

  return (
    <div className="utility-bar">
      <div className="utility-inner">
        <div className="utility-spacer" />
        <div className="utility-actions">
          <button type="button" className="utility-icon" aria-label={t.accessibility} title={t.accessibility}>
            <AccessibilityGlyph />
          </button>
          <span className="utility-sep" aria-hidden />
          <button
            type="button"
            className="utility-lang"
            onClick={toggle}
            aria-label={`Switch language to ${t.langLabel}`}
          >
            <LangGlyph />
            <span className="utility-lang-text">{t.langLabel}</span>
          </button>
          <span className="utility-flag" aria-hidden title="Government of India">
            <i className="uf-saffron" />
            <i className="uf-white" />
            <i className="uf-green" />
          </span>
        </div>
      </div>
    </div>
  );
}

function AccessibilityGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="6.6" r="1.5" fill="currentColor" />
      <path
        d="M5.5 9.2c2 .8 4.2 1.2 6.5 1.2s4.5-.4 6.5-1.2M12 10.4V15m0 0-2.6 4.2M12 15l2.6 4.2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function LangGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 5h8M7 5v2.5C7 11 5 13.5 2.5 15M4.5 9.5c.8 2 2.6 3.6 4.8 4.6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M13 21l4-10 4 10m-6.6-3h5.2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
