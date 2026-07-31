/**
 * Run:  npm run save-session
 *
 * Opens your real Chrome browser with a persistent profile stored in
 * playwright/auth/user-data/  (keeps cookies, localStorage, site data).
 *
 * 1. Log in to https://app.bask.health
 * 2. Come back here and press Enter — session is saved automatically.
 *
 * After this, tests load the same profile so Vercel doesn't block them.
 */

const { chromium } = require("@playwright/test");
const path = require("path");
const readline = require("readline");

const USER_DATA_DIR = path.join(__dirname, "auth", "user-data");
const SESSION_FILE  = path.join(__dirname, "auth", "session.json");

(async () => {
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    channel: "chrome",
    viewport: { width: 1280, height: 900 },
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
    ],
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  });

  // Remove webdriver fingerprint
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });

  const page = await context.newPage();
  await page.goto("https://app.bask.health");

  console.log("\n✅ Chrome opened at https://app.bask.health");
  console.log("   → Log in to Bask admin");
  console.log("\n   Press ENTER here when fully logged in...\n");

  await waitForEnter();

  // Also save storageState as a fallback for tests that need it
  await context.storageState({ path: SESSION_FILE });
  console.log(`\n💾 Session saved → ${SESSION_FILE}`);
  console.log(`💾 Profile stored → ${USER_DATA_DIR}`);
  console.log("\n   Run tests:  npx playwright test --headed\n");

  await context.close();
})();

function waitForEnter() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question("", () => { rl.close(); resolve(); });
  });
}
