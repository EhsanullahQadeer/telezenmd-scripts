const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./playwright/tests",
  timeout: 60_000,
  use: {
    headless: false,
    channel: "chrome",          // real Chrome, not Playwright's bundled Chromium
    viewport: { width: 1280, height: 900 },
    storageState: "./playwright/auth/session.json",
    launchOptions: {
      args: [
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
      ],
    },
    // Remove the navigator.webdriver flag that Vercel bot detection looks for
    contextOptions: {
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    },
  },
  projects: [{ name: "chrome" }],
});
