import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || "http://localhost:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    allowedHosts: [
      "unfluorescent-robt-unidly.ngrok-free.dev",
      "unfluorescent-robt-unidly.ngrok-free.app",
      "vegan-buddhism-storage.ngrok-free.dev",
    ],
    proxy: {
      "/api": {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
});
