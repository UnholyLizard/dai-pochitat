import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Smoke tests run against the production build served by `vite preview` (no Worker, so /api/* is absent
// and the catalogue falls back to static data). PW_CHROMIUM points at a preinstalled browser if needed.
const knownPaths = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];
const executablePath = process.env.PW_CHROMIUM || knownPaths.find((p) => existsSync(p)) || undefined;
const launchOptions = executablePath ? { executablePath, args: ['--no-sandbox'] } : {};

export default defineConfig({
  testDir: 'tests',
  testMatch: /.*\.spec\.js/,
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure', launchOptions },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], launchOptions } },
    { name: 'phone', use: { ...devices['Pixel 7'], launchOptions } },
  ],
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
  },
});
