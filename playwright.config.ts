import { defineConfig } from "@playwright/test"

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3111)
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${port}`

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL,
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: `npm run dev -- -p ${port}`,
        url: baseURL,
        reuseExistingServer: true,
        timeout: 180_000,
      },
})
