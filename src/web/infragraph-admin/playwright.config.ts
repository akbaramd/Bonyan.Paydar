import { defineConfig, devices } from '@playwright/test'
import { resolve } from 'node:path'

const web = import.meta.dirname
const repo = resolve(web, '../../..')

/**
 * Run Vite as an explicit Playwright-managed process instead of relying on
 * ASP.NET Core SPA Proxy to spawn an orphaned child during browser tests.
 * The normal developer workflow still uses ASP.NET Core SPA Proxy.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 12_000 },
  reporter: [['list']],
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    ...devices['Desktop Chrome'],
    channel: process.env.CI ? undefined : 'msedge',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'npm run dev',
      cwd: web,
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 100_000,
    },
    {
      command: 'dotnet run --project src/server/InfraGraph.ControlPlane --launch-profile https --no-restore',
      cwd: repo,
      url: 'http://127.0.0.1:5187/health/live',
      reuseExistingServer: !process.env.CI,
      timeout: 100_000,
      env: { ASPNETCORE_ENVIRONMENT: 'Development' },
    },
  ],
})