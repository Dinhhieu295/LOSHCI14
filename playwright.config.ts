import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

const edgeInstalled = process.platform === 'win32' && existsSync('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe');
export default defineConfig({
  testDir: './test',
  timeout: 60000,
  expect: { timeout: 10000 },
  use: {
    browserName: 'chromium',
    channel: process.env.PLAYWRIGHT_CHANNEL ?? (edgeInstalled ? 'msedge' : undefined),
    viewport: { width: 1440, height: 1000 },
    timezoneId: 'Asia/Ho_Chi_Minh',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node --import tsx tests/workflow-server.ts',
    cwd: './backend',
    url: 'http://127.0.0.1:4002/health',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
