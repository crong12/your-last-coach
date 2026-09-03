import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  server: {
    watch: {
      // Ignore only this project root's own nested worktrees, so a dev
      // server running *inside* a worktree still watches its own files.
      ignored: [join(rootDir, ".worktrees") + "/**"],
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
