// Base URL of the Layer-3 dashboard SSE gateway. Override with VITE_GATEWAY_URL
// (e.g. in a .env.local) when the backend runs on another host/port.
export const GATEWAY_URL =
  import.meta.env.VITE_GATEWAY_URL ?? "http://localhost:8200";

export const EVENTS_URL = `${GATEWAY_URL}/events`;
