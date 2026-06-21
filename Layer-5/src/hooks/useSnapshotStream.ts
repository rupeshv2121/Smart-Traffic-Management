import { useEffect, useRef, useState } from "react";

import { EVENTS_URL } from "../config";
import type { CycleSnapshot } from "../types/snapshot";

export type ConnectionState = "connecting" | "live" | "disconnected";

export interface SnapshotStream {
  /** Most recent cycle, or null before the first arrives. */
  latest: CycleSnapshot | null;
  /** Recent cycles, newest last (bounded). Seeded by the gateway's replay. */
  history: CycleSnapshot[];
  connection: ConnectionState;
}

const HISTORY_LIMIT = 60;

/**
 * Subscribe to the Layer-3 dashboard SSE feed. EventSource auto-reconnects on
 * drop; we surface that as the connection state so the UI can show it. On
 * reconnect the gateway replays its history buffer, so we de-dupe by cycle.
 */
export function useSnapshotStream(): SnapshotStream {
  const [latest, setLatest] = useState<CycleSnapshot | null>(null);
  const [history, setHistory] = useState<CycleSnapshot[]>([]);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const seenCycles = useRef<Set<number>>(new Set());

  useEffect(() => {
    const source = new EventSource(EVENTS_URL);

    source.onopen = () => setConnection("live");
    source.onerror = () => setConnection("disconnected");

    source.addEventListener("snapshot", (ev) => {
      setConnection("live");
      let snap: CycleSnapshot;
      try {
        snap = JSON.parse((ev as MessageEvent).data) as CycleSnapshot;
      } catch {
        return;
      }

      setLatest(snap);
      if (seenCycles.current.has(snap.cycle)) return;
      seenCycles.current.add(snap.cycle);

      setHistory((prev) => {
        const next = [...prev, snap];
        return next.length > HISTORY_LIMIT
          ? next.slice(next.length - HISTORY_LIMIT)
          : next;
      });
    });

    return () => source.close();
  }, []);

  return { latest, history, connection };
}
