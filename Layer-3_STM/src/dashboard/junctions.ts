// ============================================================
// junctions.ts — the Delhi junction registry for the city map
//
// Layer 3 actively orchestrates exactly ONE junction (config.JUNCTION_ID).
// The Command Dashboard, however, shows a city of junctions. This registry
// provides real Delhi coordinates + identity for the live junction and a set
// of DISPLAY-ONLY peer junctions whose state is simulated (CitySimulator).
// Peers never enter the control path — they exist only to populate the map.
// ============================================================

import { JUNCTION_ID, JUNCTION_LOCATION } from "../config";

export interface JunctionMeta {
  id: string;
  /** Short operator code, e.g. JN-ITO. */
  code: string;
  name: string;
  zone: string;
  lat: number;
  lng: number;
  /** True only for the junction Layer 3 actually orchestrates. */
  live: boolean;
}

// Display-only peers (real Delhi crossings, plausible coordinates).
const PEERS: Omit<JunctionMeta, "live">[] = [
  { id: "DEL_DL_CP_02", code: "JN-CP", name: "Connaught Place", zone: "New Delhi", lat: 28.6315, lng: 77.2167 },
  { id: "DEL_DL_MH_03", code: "JN-MH", name: "Mandi House", zone: "Central", lat: 28.6258, lng: 77.2344 },
  { id: "DEL_DL_IG_04", code: "JN-IG", name: "India Gate C-Hexagon", zone: "New Delhi", lat: 28.6129, lng: 77.2295 },
  { id: "DEL_DL_AIIMS_05", code: "JN-AIIMS", name: "AIIMS Crossing", zone: "South", lat: 28.5672, lng: 77.21 },
  { id: "DEL_DL_DK_06", code: "JN-DK", name: "Dhaula Kuan", zone: "South West", lat: 28.5916, lng: 77.161 },
  { id: "DEL_DL_ASH_07", code: "JN-ASH", name: "Ashram Chowk", zone: "South East", lat: 28.5733, lng: 77.2588 },
  { id: "DEL_DL_MC_08", code: "JN-MC", name: "Moolchand", zone: "South", lat: 28.5639, lng: 77.236 },
  { id: "DEL_DL_PB_09", code: "JN-PB", name: "Punjabi Bagh Chowk", zone: "West", lat: 28.668, lng: 77.134 },
];

/** The live junction's identity, derived from config. */
export const LIVE_JUNCTION: JunctionMeta = {
  id: JUNCTION_ID,
  code: "JN-ITO",
  name: "ITO Crossing",
  zone: "Central",
  lat: JUNCTION_LOCATION.lat,
  lng: JUNCTION_LOCATION.lng,
  live: true,
};

/** All junctions: the live one first, then the display-only peers. */
export const ALL_JUNCTIONS: JunctionMeta[] = [
  LIVE_JUNCTION,
  ...PEERS.map((p) => ({ ...p, live: false })),
];

export const PEER_JUNCTIONS: JunctionMeta[] = ALL_JUNCTIONS.filter((j) => !j.live);
