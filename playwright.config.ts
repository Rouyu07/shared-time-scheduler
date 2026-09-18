import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  outputDir: "./test-results/playwright-artifacts",
  timeout: 180000,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    headless: true,
    trace: "off",
    screenshot: "off",
  },
});
