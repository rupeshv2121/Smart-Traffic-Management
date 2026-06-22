import { AshokaChakra } from "./Emblem";

/**
 * Decorative government-style section divider: a tricolour rule with the
 * Ashoka Chakra centred. Purely ornamental, hidden from assistive tech.
 */
export function SectionDivider() {
  return (
    <div className="section-divider" aria-hidden>
      <span className="sd-line" />
      <span className="sd-chakra">
        <AshokaChakra size={24} />
      </span>
      <span className="sd-line" />
    </div>
  );
}
