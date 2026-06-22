import type { ReactNode } from "react";

import { GovBadge } from "./Emblem";

// National-government masthead: tricolour strip + emblem + bilingual titles.
// `actions` renders on the right (e.g. the live-connection chip).
export function GovHeader({ actions }: { actions?: ReactNode }) {
  return (
    <header className="centered-content">
      <div className="tricolour" />
      <div className="gov-header">
        <div className="gov-header-inner ">
          <GovBadge size={56} />
          <div className="gov-titles">
            <span className="en">Government of NCT of Delhi</span>
            <span className="hi">राष्ट्रीय राजधानी क्षेत्र दिल्ली सरकार</span>
            <span className="dept">Transport Department · Smart Traffic Management System</span>
          </div>
          <div className="gov-header-spacer" />
          {actions && <div className="gov-header-actions">{actions}</div>}
        </div>
      </div>
    </header>
  );
}
