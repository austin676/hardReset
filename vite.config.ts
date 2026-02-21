import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "path";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
  cacheDir: path.resolve("node_modules/.vite"),
  optimizeDeps: {
    // Pre-bundle Phaser so Vite doesn't try to re-optimize mid-session
    include: ["phaser"],
  },
  ssr: {
    // Phaser is browser-only — don't bundle it in the SSR build
    external: ["phaser"],
  },
});
