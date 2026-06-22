// ============================================================
// hot-store.ts — hot live-state store interface + factory.
//
// Architecture §8: "Live junction state from Redis (junction:{id}:state)". The
// gateway writes the latest per-junction snapshot + city snapshot to the hot
// store each cycle so other processes (or a horizontally-scaled dashboard tier)
// can read current state without the SSE stream. RedisHotStore implements it;
// NullHotStore is the zero-infra default so Redis stays optional.
// ============================================================

import { REDIS_URL } from "../config";
import type { CitySnapshot } from "../dashboard/city";
import type { CycleSnapshot } from "../dashboard/snapshot";
import { RedisHotStore } from "./redis-hot-store";

export interface HotStore {
  init(): Promise<void>;
  setJunctionState(junctionId: string, snap: CycleSnapshot): void;
  setCityState(city: CitySnapshot): void;
  close(): Promise<void>;
}

/** No-op store: the gateway's in-memory state remains the only hot copy. */
export class NullHotStore implements HotStore {
  public async init(): Promise<void> {}
  public setJunctionState(): void {}
  public setCityState(): void {}
  public async close(): Promise<void> {}
}

export function createHotStore(): HotStore {
  return REDIS_URL ? new RedisHotStore(REDIS_URL) : new NullHotStore();
}
