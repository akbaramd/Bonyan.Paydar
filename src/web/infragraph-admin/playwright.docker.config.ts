import { defineConfig, devices } from '@playwright/test'

// Real localhost Docker pilot; no mocked operational APIs.
export default defineConfig({
  testDir: 'e2e-docker',
  timeout: 30_000,
  reporter: [['list']],
  workers: 1,
  use: {
    baseURL: 'https://localhost:8443',
    ignoreHTTPSErrors: true, // Local developer certificate only.
    ...devices['Desktop Chrome'],
    channel: process.env.CI ? undefined : 'msedge',
    trace: 'off',
  },
})
