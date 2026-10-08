import { defineConfig } from '@playwright/test';

export const PORT = 4180;
export const APP_URL = `http://localhost:${PORT}/daily/`;

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: APP_URL,
    // iPhone-sized touch device.
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    locale: 'zh-TW',
    timezoneId: 'Asia/Taipei',
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  },
  projects: [{ name: 'iphone-chromium', use: { browserName: 'chromium' } }],
  webServer: {
    // Serves the production build under /daily/, the same sub-path GitHub Pages uses.
    command: `node scripts/serve-pages.mjs ${PORT} /daily/`,
    url: APP_URL,
    reuseExistingServer: false,
  },
});
