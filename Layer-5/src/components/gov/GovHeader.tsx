import type { ReactNode } from "react";

import { Link } from "react-router-dom";
import ashokSatambh from "../../assets/Ashok Satambh.png";

// National-government masthead: tricolour strip + emblem + bilingual titles.
// `actions` renders on the right (e.g. the live-connection chip).
export function GovHeader({ actions }: { actions?: ReactNode }) {
  return (
    <header className="centered-content">
      <div className="tricolour" />
      <div className="gov-header">
        <Link to="/" className="gov-header-inner text-decoration-none ">
          <img
            className="gov-emblem-img"
            src={ashokSatambh}
            alt="State Emblem of India — Ashoka Pillar"
            width={56}
            height={56}
          />
          <div className="gov-titles">
            <span className="en">Government of NCT of Delhi</span>
            <span className="hi">राष्ट्रीय राजधानी क्षेत्र दिल्ली सरकार</span>
            <span className="dept">Transport Department · Smart Traffic Management System</span>
          </div>
          <div className="gov-header-spacer" />
          {actions && <div className="gov-header-actions">{actions}</div>}
        </Link>
      </div>
    </header>
  );
}
