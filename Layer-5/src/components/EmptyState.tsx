import type { ConnectionState } from "../hooks/useSnapshotStream";

/** Shown before the first snapshot arrives, with a connection-aware hint. */
export function EmptyState({ connection }: { connection: ConnectionState }) {
  return (
    <div className="empty">
      <div className="big">
        {connection === "disconnected"
          ? "No connection to Layer 3"
          : "Waiting for the first cycle…"}
      </div>
      <p className="muted">
        {connection === "disconnected"
          ? "The Layer-3 dashboard gateway isn't reachable. Start the pipeline with `npm run live` (it serves the feed on port 8200)."
          : "Connected to the gateway — the next 30-second optimization cycle will appear here."}
      </p>
    </div>
  );
}
