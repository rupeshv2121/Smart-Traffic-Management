// ============================================================
// layer2-bridge.ts — Live Layer 2 perception client
//
// Bridges the GatiShakti-ML FastAPI computer-vision service (Layer 2) into
// the Layer-3 STM orchestrator. Instead of the MockDataGenerator, the live
// pipeline pulls a real `Layer2Payload` (built from YOLO inference) from the
// Python service every cycle.
// ============================================================

import type { Layer2Payload } from "./types/types";

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

    const payload = (await res.json()) as Layer2Payload;
    if (!payload?.approaches?.length) {
      throw new Error("Perception payload had no approaches");
    }
    return payload;
  }
}
