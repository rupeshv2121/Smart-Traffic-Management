// ============================================================
// challan-store.ts — durable violation (challan) queue.
//
// Backed by the Persistence store (challans.json) so issued/rejected decisions
// survive restarts. Fed by ANPR plate events: real ones from Layer 2's
// plateEvents[] when present, otherwise synthesised at a low rate so the queue
// is alive for the demo. Inspectors issue or reject via the gateway.
// ============================================================

import type { Persistence } from "../persistence/persistence";
import type { PlateEvent } from "../types/types";

export type ViolationType = PlateEvent["violation"];
export type ChallanStatus = "PENDING" | "ISSUED" | "REJECTED";

export interface Challan {
  id: string;
  plate: string;
  junctionCode: string;
  junctionName: string;
  violation: ViolationType;
  ts: string;
  speedKmph?: number;
  fineRupees: number;
  status: ChallanStatus;
  confidence: number;
  resolvedBy?: string;
  resolvedAt?: string;
}

const FINE: Record<ViolationType, number> = {
  RED_LIGHT: 1000,
  NO_HELMET: 1000,
  WRONG_LANE: 1500,
  SPEEDING: 2000,
  STOP_LINE: 500,
};

const VIOLATIONS: ViolationType[] = ["RED_LIGHT", "NO_HELMET", "WRONG_LANE", "SPEEDING", "STOP_LINE"];
const SERIES = ["DL3C", "DL8S", "DL1C", "HR26", "UP14", "DL5S", "DL9C"];

const DOC = "challans.json";
const CAP = 200;

export class ChallanStore {
  private challans: Challan[];
  private seq: number;

  constructor(private readonly persistence: Persistence) {
    this.challans = persistence.readDoc<Challan[]>(DOC, []);
    this.seq = this.challans.length;
    if (this.challans.length === 0) this.seed();
  }

  public list(): Challan[] {
    // Newest first.
    return [...this.challans].sort((a, b) => b.ts.localeCompare(a.ts));
  }

  public resolve(id: string, status: "ISSUED" | "REJECTED", actor: string): Challan | null {
    const c = this.challans.find((x) => x.id === id);
    if (!c || c.status !== "PENDING") return c ?? null;
    c.status = status;
    c.resolvedBy = actor;
    c.resolvedAt = new Date().toISOString();
    this.flush();
    return c;
  }

  /** Ingest ANPR plate events (real or synthetic) for a junction. */
  public ingest(events: PlateEvent[], junctionCode: string, junctionName: string): void {
    if (events.length === 0) return;
    for (const e of events) {
      this.add(e, junctionCode, junctionName);
    }
    this.flush();
  }

  /** Low-rate synthetic plate event so the queue stays alive without Layer-2 ANPR. */
  public maybeSynthesize(junctionCode: string, junctionName: string): void {
    if (Math.random() > 0.35) return;
    const violation = VIOLATIONS[Math.floor(Math.random() * VIOLATIONS.length)]!;
    const evt: PlateEvent = {
      plate: this.randomPlate(),
      approachId: "NORTH",
      violation,
      confidence: 0.7 + Math.random() * 0.29,
      ...(violation === "SPEEDING" ? { speedKmph: 65 + Math.floor(Math.random() * 25) } : {}),
    };
    this.add(evt, junctionCode, junctionName);
    this.flush();
  }

  private add(e: PlateEvent, junctionCode: string, junctionName: string): void {
    this.challans.push({
      id: `CH-${10000 + ++this.seq}`,
      plate: e.plate,
      junctionCode,
      junctionName,
      violation: e.violation,
      ts: new Date().toISOString(),
      ...(e.speedKmph != null ? { speedKmph: e.speedKmph } : {}),
      fineRupees: FINE[e.violation],
      status: "PENDING",
      confidence: Number(e.confidence.toFixed(2)),
    });
    if (this.challans.length > CAP) this.challans = this.challans.slice(-CAP);
  }

  private randomPlate(): string {
    const series = SERIES[Math.floor(Math.random() * SERIES.length)]!;
    const letters = String.fromCharCode(65 + Math.floor(Math.random() * 26), 65 + Math.floor(Math.random() * 26));
    const num = String(1000 + Math.floor(Math.random() * 9000));
    return `${series}${letters}${num}`;
  }

  private seed(): void {
    const samples: Array<[string, ViolationType, string, string]> = [
      ["DL3CAB1234", "RED_LIGHT", "JN-ITO", "ITO Crossing"],
      ["DL8SBC9087", "NO_HELMET", "JN-CP", "Connaught Place"],
      ["HR26DK5521", "SPEEDING", "JN-AIIMS", "AIIMS Crossing"],
      ["DL1CAA4412", "STOP_LINE", "JN-MH", "Mandi House"],
    ];
    for (const [plate, violation, code, name] of samples) {
      this.add(
        { plate, approachId: "NORTH", violation, confidence: 0.85, ...(violation === "SPEEDING" ? { speedKmph: 74 } : {}) },
        code,
        name,
      );
    }
    this.flush();
  }

  private flush(): void {
    this.persistence.writeDoc(DOC, this.challans);
  }
}
