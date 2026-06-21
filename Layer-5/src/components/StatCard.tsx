import type { ReactNode } from "react";

type Accent = "saffron" | "green" | "blue" | "danger" | "none";

/** Large-number stat tile with an optional left accent bar. */
export function StatCard({
  label,
  value,
  foot,
  accent = "none",
}: {
  label: string;
  value: ReactNode;
  foot?: ReactNode;
  accent?: Accent;
}) {
  const cls = accent === "none" ? "stat" : `stat accent-${accent}`;
  return (
    <div className={cls}>
      <div className="s-label">{label}</div>
      <div className="s-value">{value}</div>
      {foot && <div className="s-foot">{foot}</div>}
    </div>
  );
}
