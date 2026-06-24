// ============================================================
// layer2-bridge.ts — Live Layer 2 perception client
//
// Bridges the GatiShakti-ML FastAPI computer-vision service (Layer 2) into
// the Layer-3 STM orchestrator. Instead of the MockDataGenerator, the live
// pipeline pulls a real `Layer2Payload` (built from YOLO inference) from the
// Python service every cycle.
// ============================================================

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import type { BusLaneResult, Layer2Payload, PlateEvent } from "./types/types";

// ── Bus lane camera registry ────────────────────────────────────
// Points to the bundled test images + pre-picked lane polygon coordinates.
// In production, replace with real camera frames and surveyed lane geometry.

const ML_ROOT = resolve(__dirname, "..", "..", "GatiShakti-ML");
const BUS_LANE_DIR = resolve(ML_ROOT, "testing", "BusLane");
const LANE_COORDS_PATH = resolve(ML_ROOT, "lanecoordinates.json");

interface BusLaneCamera {
  imagePath: string;
  coordinates: number[][];
}

function loadBusLaneCameras(): BusLaneCamera[] {
  if (!existsSync(LANE_COORDS_PATH)) return [];
  try {
    const raw = JSON.parse(readFileSync(LANE_COORDS_PATH, "utf-8")) as Record<string, number[][]>;
    return Object.entries(raw)
      .map(([filename, coords]) => ({
        imagePath: resolve(BUS_LANE_DIR, filename),
        coordinates: coords,
      }))
      .filter((c) => existsSync(c.imagePath));
  } catch {
    return [];
  }
}

const busLaneCameras = loadBusLaneCameras();

export class Layer2Bridge {
  private readonly baseUrl: string;
  private readonly junctionId: string;
  private readonly timeoutMs: number;
  private busLaneCycleIndex = 0;

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

  /**
   * Fetch bus lane violation detection from the perception service.
   * Cycles through the bundled test images (with pre-picked lane polygon
   * coordinates) so different frames are analysed across cycles.
   * Returns null if no cameras are configured or the service is unreachable.
   */
  public async fetchBusLane(): Promise<BusLaneResult | null> {
    if (busLaneCameras.length === 0) return null;

    const camera = busLaneCameras[this.busLaneCycleIndex % busLaneCameras.length]!;
    this.busLaneCycleIndex++;

    const imageBytes = readFileSync(camera.imagePath);
    const blob = new Blob([imageBytes], { type: "image/png" });

    const form = new FormData();
    form.append("lane_image", blob, "frame.png");
    form.append("signal_id", "1");
    form.append("bus_lane_coordinates", JSON.stringify(camera.coordinates));

    const res = await fetch(`${this.baseUrl}/predict/buslane`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(15_000), // YOLO inference can be slower
    });

    if (!res.ok) {
      throw new Error(`Bus lane API returned ${res.status} ${res.statusText}`);
    }

    const raw = (await res.json()) as Record<string, unknown>;
    return {
      unauthorizedCount: Number(raw.unauthorized_count ?? raw.unauthorizedCount ?? 0),
      confidenceScore: Number(raw.confidence_score ?? raw.confidenceScore ?? 0),
      violations: (Array.isArray(raw.violations) ? raw.violations : []).map(
        (v: Record<string, unknown>) => ({
          type: String(v.type ?? "Unknown"),
          bbox: Array.isArray(v.bbox) ? v.bbox.map(Number) : [],
        }),
      ),
      annotatedImage: String(raw.annotated_image ?? raw.annotatedImage ?? ""),
    };
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

