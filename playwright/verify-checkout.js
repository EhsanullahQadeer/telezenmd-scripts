/**
 * Quick visual + data verification of the custom checkout UI.
 * Run: node playwright/verify-checkout.js
 */
const { chromium } = require("@playwright/test");
const path = require("path");
const fs   = require("fs");

const USER_DATA_DIR = path.join(__dirname, "auth", "user-data");
const SNAPSHOT_FILE = path.join(__dirname, "auth", "checkout-snapshot.json");
const SCREENSHOT    = path.join(__dirname, "auth", "verify-screenshot.png");

(async () => {
  const snap = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, "utf8"));

  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    channel:  "chrome",
    viewport: { width: 430, height: 900 },
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  });

  await context.addInitScript((ls) => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    try { Object.entries(ls).forEach(([k, v]) => localStorage.setItem(k, v)); } catch(_) {}
  }, snap.localStorage);

  const page = await context.newPage();
  await page.goto(snap.url);

  console.log("\n⏳ Waiting for custom plan UI (.prog-plans)...");
  try {
    await page.waitForSelector(".prog-plans", { timeout: 20_000 });
  } catch {
    console.error("❌ .prog-plans never appeared — script may not have loaded.");
    await page.screenshot({ path: SCREENSHOT, fullPage: true });
    console.log("📸 Screenshot saved:", SCREENSHOT);
    await new Promise(() => {});
  }

  await page.waitForTimeout(1500);

  // Read our custom plan cards
  const cards = await page.$$eval(".prog-plan-card", els => els.map(el => ({
    id:      el.dataset.id,
    selected: el.classList.contains("prog-selected"),
    badge:   el.querySelector(".prog-plan-badge")?.textContent?.trim() ?? "",
    price:   el.querySelector(".prog-amt")?.textContent?.trim() ?? "",
    billed:  el.querySelector(".prog-plan-billed")?.textContent?.trim() ?? "",
    save:    el.querySelector(".prog-plan-save")?.textContent?.trim() ?? "",
  })));

  console.log(`\n✅ Found ${cards.length} custom plan cards\n${"─".repeat(55)}`);
  cards.forEach(c => {
    const sel = c.selected ? " ◀ SELECTED" : "";
    console.log(`\n  [${c.id}]${sel}`);
    console.log(`    badge:  ${c.badge}`);
    console.log(`    price:  ${c.price}/mo`);
    console.log(`    billed: ${c.billed}`);
    if (c.save) console.log(`    save:   ${c.save}`);
  });

  // Check for negative savings
  const negSavings = cards.filter(c => c.save.includes("-"));
  if (negSavings.length) {
    console.log("\n❌ NEGATIVE SAVINGS DETECTED:", negSavings.map(c => c.id).join(", "));
  } else {
    console.log("\n✅ All savings are positive (or not shown for monthly)");
  }

  // Check order
  const ids = cards.map(c => c.id);
  const expectedOrder = ["monthly", "quarterly", "sixmonth", "twelvemonth"];
  const orderOk = ids.join(",") === expectedOrder.join(",");
  console.log(orderOk
    ? "✅ Display order correct: Monthly → Quarterly → 6 Month → Annual"
    : `❌ Order mismatch — got: ${ids.join(", ")}`);

  await page.screenshot({ path: SCREENSHOT, fullPage: true });
  console.log(`\n📸 Screenshot saved: ${SCREENSHOT}`);
  console.log("\n   Browser staying open for manual inspection. Press Ctrl+C to close.\n");

  await new Promise(() => {});
})();
