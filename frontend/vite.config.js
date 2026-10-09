import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  // Pre-bundle common deps so the FIRST navigation to any route doesn't
  // stall while Vite discovers and transforms them on demand.
  optimizeDeps: {
    include: ["react", "react-dom", "react-router-dom", "zustand", "axios", "lucide-react", "date-fns", "react-hot-toast"],
  },
  build: {
    rollupOptions: {
      output: {
        // Split vendor code from app code so route chunks stay small
        manualChunks: {
          vendor: ["react", "react-dom", "react-router-dom", "zustand", "axios"],
        },
      },
    },
  },
});
