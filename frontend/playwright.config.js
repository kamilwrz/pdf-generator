import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://127.0.0.1:4173";

/**
 * Browser smoke tests run against a local Vite server whose API base is forced
 * to `/api`. Every test intercepts that namespace before navigation, ensuring
 * editor fixtures can never fall through to a deployed backend.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.js",
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: false,
  workers: process.env.CI ? 1 : undefined,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never", outputFolder: "playwright-report" }]]
    : "list",
  outputDir: "test-results/e2e",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4173",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      VITE_API_URL: "/api",
    },
  },
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // Pixel 5 is a stable Chromium touch/viewport profile and exercises the
      // compact editor sheets without requiring a second browser engine.
      name: "mobile-chromium",
      use: { ...devices["Pixel 5"] },
    },
  ],
});
