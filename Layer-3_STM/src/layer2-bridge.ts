// ============================================================
// layer2-bridge.ts — Live Layer 2 perception client
//
// Bridges the GatiShakti-ML FastAPI computer-vision service (Layer 2) into
// the Layer-3 STM orchestrator. Instead of the MockDataGenerator, the live
// pipeline pulls a real `Layer2Payload` (built from YOLO inference) from the
// Python service every cycle.
// ============================================================

import type { Layer2Payload, PlateEvent } from "./types/types";

export class Layer2Bridge {
  private readonly baseUrl: string;
  private readonly junctionId: string;
  private readonly timeoutMs: number;

  constructor(baseUrl: string, junctionId: string, timeoutMs = 8000) {
    // Strip any trailing slash so URL composition is predictable.
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.junctionId = junctionId;
    this.timeoutMs = timeoutMs;
  }

  /** True if the perception service is up and answering /health. */
  public async isHealthy(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!res.ok) return false;
      const body = (await res.json()) as { status?: string };
      return body.status === "ok";
    } catch {
      return false;
    }
  }

  /**
   * Fetch a fresh Layer 2 perception payload for this junction.
   * @param confidenceOverride optional 0..1 value to force cvConfidenceScore
   *        (used to demo the STM's low-confidence historical fallback).
   * @throws if the service is unreachable or returns a non-2xx response.
   */
  public async fetchLayer2(confidenceOverride?: number): Promise<Layer2Payload> {
    const url = new URL(`${this.baseUrl}/perception/layer2`);
    url.searchParams.set("junction_id", this.junctionId);
    if (confidenceOverride !== undefined) {
      url.searchParams.set("confidence", String(confidenceOverride));
    }

    const res = await fetch(url, {
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) {
      throw new Error(
        `Perception service returned ${res.status} ${res.statusText}`,
      );
    }

    const raw = (await res.json()) as Layer2Payload & { plate_events?: unknown };
    if (!raw?.approaches?.length) {
      throw new Error("Perception payload had no approaches");
    }
    // ANPR pass-through: accept either camelCase plateEvents or the Python
    // service's snake_case plate_events.
    const plates = normalizePlateEvents(raw.plateEvents ?? raw.plate_events);
    if (plates.length) raw.plateEvents = plates;
    return raw;
  }
}

function normalizePlateEvents(input: unknown): PlateEvent[] {
  if (!Array.isArray(input)) return [];
  const ok = new Set(["RED_LIGHT", "NO_HELMET", "WRONG_LANE", "SPEEDING", "STOP_LINE"]);
  return input
    .map((e): PlateEvent | null => {
      const r = e as Record<string, unknown>;
      const plate = typeof r.plate === "string" ? r.plate : null;
      const violation = String(r.violation ?? "").toUpperCase();
      if (!plate || !ok.has(violation)) return null;
      return {
        plate,
        approachId: (["NORTH", "SOUTH", "EAST", "WEST"].includes(String(r.approachId ?? r.approach_id))
          ? (r.approachId ?? r.approach_id)
          : "NORTH") as PlateEvent["approachId"],
        violation: violation as PlateEvent["violation"],
        confidence: typeof r.confidence === "number" ? r.confidence : 0.8,
        ...(typeof r.speedKmph === "number" ? { speedKmph: r.speedKmph } : typeof r.speed_kmph === "number" ? { speedKmph: r.speed_kmph } : {}),
        ...(typeof r.evidenceUrl === "string" ? { evidenceUrl: r.evidenceUrl } : {}),
      };
    })
    .filter((x): x is PlateEvent => x !== null);
}
