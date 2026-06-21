import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite dev server for the Layer 5 dashboard. The SSE feed is read directly from
// the Layer-3 gateway (default http://localhost:8200) via VITE_GATEWAY_URL, so
// no proxy is needed — the gateway already sends permissive CORS headers.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5273,
    open: true,
  },
});
