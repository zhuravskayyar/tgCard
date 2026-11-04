import { defineConfig } from "@playwright/test";

const reuseExistingServer = !process.env.CI;

export default defineConfig({
  testDir: "./client/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 7_000 },
  reporter: "list",
  outputDir: "./test-results",
  use: {
    baseURL: "http://127.0.0.1:5173",
    browserName: "chromium",
    headless: true,
    viewport: { width: 430, height: 932 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "npm run dev:server",
      url: "http://127.0.0.1:3000/api/health",
      reuseExistingServer,
      timeout: 120_000,
    },
    {
      command: "npm run dev --workspace client -- --host 127.0.0.1",
      url: "http://127.0.0.1:5173",
      reuseExistingServer,
      timeout: 60_000,
    },
  ],
});
