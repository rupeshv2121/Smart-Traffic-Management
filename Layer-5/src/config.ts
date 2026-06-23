// Base URL of the Layer-3 dashboard SSE gateway. Override with VITE_GATEWAY_URL
// (e.g. in a .env.local) when the backend runs on another host/port.
export const GATEWAY_URL =
  import.meta.env.VITE_GATEWAY_URL ?? "http://localhost:8200";

export const EVENTS_URL = `${GATEWAY_URL}/events`;

// URL of the green-corridor-sim (3D traffic simulation). Override with
// VITE_SIM_URL when it runs on a different host/port.
export const SIM_URL =
  import.meta.env.VITE_SIM_URL ?? "http://localhost:8081";
