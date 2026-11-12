import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // The backend's CORS_WHITELIST allows this origin; keep the port fixed so it matches.
    port: 5173,
    strictPort: true,
  },
  optimizeDeps: {
    include: [
      "@phosphor-icons/react",
      "@tanstack/react-query",
      "react-router-dom",
      "react-hook-form",
      "@hookform/resolvers/zod",
      "zod",
      "dayjs",
      "dayjs/plugin/relativeTime",
      "axios",
      "sonner",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
