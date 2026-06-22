// ============================================================
// redis-hot-store.ts — Redis adapter for the hot live-state store.
//
// Writes the latest per-junction snapshot to `junction:{id}:state` and the city
// snapshot to `city:state` (with a short TTL so stale state expires if the loop
// stops). Selected when REDIS_URL is set. Writes are fire-and-forget so a slow
// Redis never stalls the control loop.
// ============================================================

import { createClient, type RedisClientType } from "redis";

import type { CitySnapshot } from "../dashboard/city";
import type { CycleSnapshot } from "../dashboard/snapshot";
import type { HotStore } from "./hot-store";

const STATE_TTL_SECONDS = 120;

export class RedisHotStore implements HotStore {
  private client: RedisClientType;
  private ready = false;

  constructor(url: string) {
    // Fail fast: don't retry forever when Redis is down, so init() rejects
    // promptly and the live loop can fall back to in-memory state.
    this.client = createClient({
      url,
      socket: { connectTimeout: 2000, reconnectStrategy: () => new Error("redis unavailable") },
    });
    // Swallow post-init errors (a drop after connect shouldn't crash the loop).
    this.client.on("error", (e: Error) => {
      if (this.ready) console.error("[hotstore] redis error:", e.message);
    });
  }

  public async init(): Promise<void> {
    await this.client.connect();
    this.ready = true;
    console.log("[hotstore] Redis connected");
  }

  public setJunctionState(junctionId: string, snap: CycleSnapshot): void {
    if (!this.ready) return;
    void this.client
      .set(`junction:${junctionId}:state`, JSON.stringify(snap), { EX: STATE_TTL_SECONDS })
      .catch((e) => console.error("[hotstore] set junction failed:", e.message));
  }

  public setCityState(city: CitySnapshot): void {
    if (!this.ready) return;
    void this.client
      .set("city:state", JSON.stringify(city), { EX: STATE_TTL_SECONDS })
      .catch((e) => console.error("[hotstore] set city failed:", e.message));
  }

  public async close(): Promise<void> {
    if (this.ready) await this.client.quit();
  }
}
