import type { EmergencySnapshot } from "../types/snapshot";

const CLASS_PILL: Record<EmergencySnapshot["priorityClass"], string> = {
  CRITICAL: "crit",
  HIGH: "high",
  NORMAL: "normal",
};

/** Pulsing banner shown only while an EMV green corridor is active. */
export function EmergencyBanner({ emv }: { emv: EmergencySnapshot }) {
  return (
    <div className="emv-banner">
      <span className="siren">🚨</span>
      <div>
        <div className="emv-main">
          GREEN CORRIDOR ACTIVE — {emv.emvId} → {emv.targetPhaseId}
        </div>
        <div className="emv-meta">ETA {emv.etaSeconds}s to junction</div>
      </div>
      <span className={`pill ${CLASS_PILL[emv.priorityClass]}`}>
        {emv.priorityClass}
      </span>
    </div>
  );
}
