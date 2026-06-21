import { createContext, useContext, type ReactNode } from "react";

import { useSnapshotStream, type SnapshotStream } from "../hooks/useSnapshotStream";

// One SSE connection for the whole dashboard. Without this, every page that
// reads the stream would open its own EventSource and reset history on mount.
const StreamCtx = createContext<SnapshotStream | null>(null);

export function StreamProvider({ children }: { children: ReactNode }) {
  const stream = useSnapshotStream();
  return <StreamCtx.Provider value={stream}>{children}</StreamCtx.Provider>;
}

export function useStream(): SnapshotStream {
  const ctx = useContext(StreamCtx);
  if (!ctx) throw new Error("useStream must be used within <StreamProvider>");
  return ctx;
}
