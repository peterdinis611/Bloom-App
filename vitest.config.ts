import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import path from "path"

// Standalone config for tests so we don't pull in the Tauri dev-server /
// Tailwind pipeline from vite.config.ts.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/__tests__/**/*.{test,spec}.{ts,tsx}"],
    css: false,
  },
})
