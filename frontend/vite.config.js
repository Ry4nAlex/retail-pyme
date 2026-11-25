import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  const apiProxyTarget =
    env.VITE_API_PROXY_TARGET || "http://localhost:8000";

  console.log("[VITE] Backend configurado:", apiProxyTarget);

  return {
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
  };
});
