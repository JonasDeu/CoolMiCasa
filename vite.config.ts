import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// When deployed to GitHub Pages at https://<user>.github.io/CoolMiCasa/ the app
// must be served from the "/CoolMiCasa/" sub-path. Locally (dev/preview) we want "/".
// Override with VITE_BASE if your repo is named differently.
const base = process.env.VITE_BASE ?? (process.env.NODE_ENV === "production" ? "/CoolMiCasa/" : "/");

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    target: "es2020",
    outDir: "dist",
  },
});
