import { tanstackRouter } from "@tanstack/router-plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, "../..", "");
  return {
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    plugins: [
      tanstackRouter({
        target: "react",
        autoCodeSplitting: true,
        routeFileIgnorePattern: "(test|spec)\\.tsx?$",
      }),
      react(),
      tailwindcss(),
    ],
    envDir: "../..",
    server: { port: Number(env.VITE_DASHBOARD_PORT ?? 3000), strictPort: true },
  };
});
