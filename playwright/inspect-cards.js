/**
 * Diagnostic: inspect Bask's plan card DOM
 * Run: node playwright/inspect-cards.js
 */
const { chromium } = require("@playwright/test");
const path = require("path");
const fs   = require("fs");

const USER_DATA_DIR  = path.join(__dirname, "auth", "user-data");
const SNAPSHOT_FILE  = path.join(__dirname, "auth", "checkout-snapshot.json");

(async () => {
  const snap = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, "utf8"));

  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    channel:  "chrome",
    viewport: { width: 1280, height: 900 },
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  });

  await context.addInitScript((ls) => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    try { Object.entries(ls).forEach(([k, v]) => localStorage.setItem(k, v)); } catch(_) {}
  }, snap.localStorage);

  const page = await context.newPage();
  await page.goto(snap.url);

  // Wait for Bask's plan list — it may be hidden by our script, so use 'attached' not 'visible'
  await page.waitForSelector("ul.relative.mt-5.flex.flex-col.gap-3", { state: "attached", timeout: 20_000 });
  await page.waitForTimeout(1500);

  const cards = await page.$$("ul.relative.mt-5.flex.flex-col.gap-3 > li");
  console.log(`\n Found ${cards.length} Bask plan cards\n${"─".repeat(60)}`);

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];

    // Full outer HTML (trimmed)
    const html = (await card.evaluate(el => el.outerHTML)).replace(/\s+/g, " ").slice(0, 600);

    // Text content
    const text = await card.evaluate(el => el.innerText.replace(/\n/g, " | "));

    // Classes on the li itself
    const cls = await card.evaluate(el => el.className);

    // Try to find the plan name/title text
    const titleEl = await card.$("div:first-child span:first-child");
    const titleText = titleEl ? await titleEl.evaluate(el => el.textContent.trim()) : "(no title span)";

    // Try to find price span
    const priceEl = await card.$("div:first-child span:last-child");
    const priceText = priceEl ? await priceEl.evaluate(el => el.textContent.trim()) : "(no price span)";

    // All span texts in first div
    const spanTexts = await card.evaluate(el => {
      const spans = el.querySelectorAll(":scope > div:first-child span");
      return [...spans].map(s => s.textContent.trim());
    });

    console.log(`\n[card ${i}]`);
    console.log(`  classes:    ${cls.slice(0, 120)}`);
    console.log(`  text:       ${text.slice(0, 120)}`);
    console.log(`  title span: ${titleText}`);
    console.log(`  price span: ${priceText}`);
    console.log(`  all spans:  ${JSON.stringify(spanTexts)}`);
    console.log(`  html:       ${html}`);
  }

  console.log("\n─".repeat(60));
  console.log("Browser staying open. Press Ctrl+C to exit.\n");

  // Keep open so you can inspect
  await new Promise(() => {});
})();
