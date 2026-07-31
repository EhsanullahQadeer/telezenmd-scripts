/**
 * Run:  npm run save-checkout
 *
 * Opens Chrome at the questionnaire start.
 * Navigate through ALL steps until you reach the plan-selection / checkout screen.
 * The script watches for .prog-plans to appear and automatically saves the state.
 *
 * After saving you'll be asked to press Enter — browser stays open until then.
 */

const { chromium } = require("@playwright/test");
const path    = require("path");
const fs      = require("fs");
const readline = require("readline");

const USER_DATA_DIR   = path.join(__dirname, "auth", "user-data");
const SNAPSHOT_FILE   = path.join(__dirname, "auth", "checkout-snapshot.json");
const START_URL       = "https://join.telezenmd.com/start-online-visit/glp1-intake";
const DETECT_SELECTOR = ".prog-plans";
const MAX_WAIT_MS     = 10 * 60 * 1000; // 10 minutes

(async () => {
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    channel:  "chrome",
    viewport: { width: 1280, height: 900 },
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });

  const page = await context.newPage();
  await page.goto(START_URL);

  // Give the page 2 seconds to settle so we don't snap on an instantly-restored
  // SPA state before the user has done anything useful.
  await page.waitForTimeout(2000);

  // If .prog-plans is ALREADY visible right after load, it means the browser
  // restored a previous checkout session — that's fine, we'll save it.
  // But tell the user what's happening.
  const alreadyVisible = await page.locator(DETECT_SELECTOR).isVisible().catch(() => false);
  if (alreadyVisible) {
    console.log("\n⚡ Plan-selection screen already visible (SPA restored previous session).");
    console.log("   If that's the correct checkout step, we'll save it.");
    console.log("   If you want a fresh run, clear the questionnaire and navigate again.\n");
  } else {
    console.log("\n✅ Browser open — navigate through the questionnaire to the plan-selection screen.");
    console.log("   Watching for .prog-plans to appear automatically...\n");
    await page.waitForSelector(DETECT_SELECTOR, { timeout: MAX_WAIT_MS });
  }

  console.log("📸 Saving snapshot...");

  const url = page.url();

  const localStorageData = await page.evaluate(() => {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      out[k] = localStorage.getItem(k);
    }
    return out;
  });

  const sessionStorageData = await page.evaluate(() => {
    const out = {};
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      out[k] = sessionStorage.getItem(k);
    }
    return out;
  });

  const storageState = await context.storageState();

  const snapshot = {
    savedAt:        new Date().toISOString(),
    url,
    localStorage:   localStorageData,
    sessionStorage: sessionStorageData,
    storageState,
  };

  fs.mkdirSync(path.dirname(SNAPSHOT_FILE), { recursive: true });
  fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(snapshot, null, 2));

  console.log(`\n💾 Snapshot saved → ${SNAPSHOT_FILE}`);
  console.log(`   URL: ${url}`);
  console.log(`   localStorage keys: ${Object.keys(localStorageData).join(", ") || "(none)"}`);
  console.log("\n   Browser staying open. Press ENTER here to close it.\n");

  await waitForEnter();
  await context.close();
  console.log("Browser closed. Run tests with:  npx playwright test --headed\n");
})();

function waitForEnter() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question("", () => { rl.close(); resolve(); });
  });
}
