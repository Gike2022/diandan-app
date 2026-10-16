import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  expect: { timeout: 10000 },
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:5174",
    viewport: { width: 390, height: 844 },
    locale: "zh-CN", timezoneId: "Asia/Shanghai",
    screenshot: "only-on-failure", trace: "retain-on-failure",
  },
  webServer: [
    { command: "npm --prefix server run dev:e2e", url: "http://127.0.0.1:3002/api/health", reuseExistingServer: false, timeout: 30000 },
    { command: "npm run dev -- --host 127.0.0.1 --port 5174 --strictPort", url: "http://127.0.0.1:5174", reuseExistingServer: false, timeout: 30000, env: { API_PROXY_TARGET: "http://127.0.0.1:3002" } },
  ],
});
