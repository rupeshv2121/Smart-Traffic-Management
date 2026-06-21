import type { ConnectionState } from "../hooks/useSnapshotStream";

const LABEL: Record<ConnectionState, string> = {
  connecting: "Connecting…",
  live: "Live",
  disconnected: "Offline",
};

export function ConnectionChip({ state }: { state: ConnectionState }) {
  return (
    <span className={`conn ${state}`} title="Layer-3 SSE feed">
      <span className="dot" />
      {LABEL[state]}
    </span>
  );
}
