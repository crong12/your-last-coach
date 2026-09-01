import { defineConfig, devices } from "@playwright/test";
import type { PlaywrightTestConfig } from "@playwright/test";

export const sharedBrowserConfig: PlaywrightTestConfig = {
  testDir: "./e2e",
  testIgnore: "release-candidate.spec.ts",
  fullyParallel: true,
  workers: process.env.CI ? 1 : undefined,
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
  },
};

export default defineConfig({
  ...sharedBrowserConfig,
  grep: /@contract/,
});
