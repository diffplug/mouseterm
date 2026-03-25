import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "mouseterm-lib": path.resolve(__dirname, "../lib/src"),
    },
  },
  server: {
    host: true,
  },
});
