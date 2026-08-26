/**
 * GLP1 plan mapping + price test
 * Run: node playwright/tests/glp1-plan-inspect.spec.js
 * Output written to playwright/test-output.log (readable during run)
 */

const { chromium } = require("@playwright/test");
const path = require("path");
const fs   = require("fs");
const startServer = require("../serve-scripts");

const USER_DATA_DIR = path.join(__dirname, "..", "auth", "user-data");
const GLP1_URL      = "https://join.telezenmd.com/start-online-visit/glp1questionnaire";
const LOG_FILE      = path.join(__dirname, "..", "test-output.log");
const TITLE_MAP     = { monthly: "Monthly", quarterly: "Quarterly", sixmonth: "Six months", twelvemonth: "Yearly" };

let logStream;
function log(...args) {
  const line = args.join(" ");
  console.log(line);
  if (logStream) logStream.write(line + "\n");
}

(async () => {
  logStream = fs.createWriteStream(LOG_FILE, { flags: "w" });
  log("[" + new Date().toISOString() + "] Test started");

  // ── 1. Start localhost server ─────────────────────────────────────────────
  const stopServer = await startServer();
  log("✓ localhost:4321 ready");

  // ── 2. Launch persistent Chrome profile ──────────────────────────────────
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    channel: "chrome",
    viewport: { width: 390, height: 844 },
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });

  const page = await context.newPage();

  page.on("console", (msg) => {
    const t = msg.text();
    if (t.includes("[CO]") || t.includes("[CO-DEBUG]")) log(`  [BROWSER] ${t}`);
  });
  page.on("pageerror", (e) => log(`  [PAGE-ERROR] ${e.message}`));

  // ── 3. Navigate ───────────────────────────────────────────────────────────
  log(`\n→ Navigating to ${GLP1_URL}`);
  await page.goto(GLP1_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  log("✓ Page loaded — current URL: " + page.url());

  // ── 4. Try to auto-advance through questionnaire ──────────────────────────
  log("\n→ Attempting to auto-advance to checkout step (max 60s)...");
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    // Already at checkout?
    const hasPlanCards = await page.$(".prog-plan-card").catch(() => null);
    if (hasPlanCards) break;

    // Try clicking a visible Next/Continue button
    const advanced = await page.evaluate(() => {
      const btns = [...document.querySelectorAll("button")];
      const next = btns.find(b => {
        const txt = b.textContent.trim().toLowerCase();
        return (txt === "next" || txt === "continue" || txt.startsWith("next") || txt === "yes" || txt === "no") && !b.disabled;
      });
      if (next) { next.click(); return next.textContent.trim(); }
      return null;
    });

    if (advanced) {
      log(`  → Clicked: "${advanced}"`);
      await page.waitForTimeout(1200);
    } else {
      await page.waitForTimeout(800);
    }
  }

  // ── 5. Wait for our custom plan cards ────────────────────────────────────
  log("\n→ Waiting for .prog-plan-card (up to 5 min — navigate to checkout step in browser)...");
  try {
    await page.waitForSelector(".prog-plan-card", { timeout: 300000 });
    log("✓ Plan cards detected!");
  } catch {
    log("✗ Plan cards not found in 5min — aborting");
    await context.close();
    stopServer();
    logStream.end();
    process.exit(1);
  }

  await page.waitForTimeout(1500);

  // ── 6. Dump Bask DOM card order ───────────────────────────────────────────
  const baskCards = await page.evaluate(() =>
    [...document.querySelectorAll("ul.relative.mt-5.flex.flex-col.gap-3 > li")].map((li, i) => ({
      domIndex: i,
      title: li.querySelector(":scope > div:first-child span:first-child")?.textContent?.trim() ?? "(no title)",
      price: li.querySelector(":scope > div:first-child span:last-child")?.textContent?.trim() ?? "(no price)",
      selected: li.classList.contains("border-2"),
    }))
  );

  log("\n=== BASK DOM CARD ORDER ===");
  baskCards.forEach(c => log(`  domIdx=${c.domIndex}  "${c.title}"  ${c.price}  selected=${c.selected}`));

  // ── 7. Dump our custom plan cards ─────────────────────────────────────────
  const customCards = await page.evaluate(() =>
    [...document.querySelectorAll(".prog-plan-card")].map((c, i) => ({
      arrayIndex: i,
      id: c.dataset.id,
      name: c.querySelector(".prog-plan-name")?.textContent?.trim(),
      price: c.querySelector(".prog-amt")?.textContent?.trim(),
      selected: c.classList.contains("prog-selected"),
    }))
  );

  log("\n=== OUR CUSTOM PLAN CARDS ===");
  customCards.forEach(c => log(`  arrayIdx=${c.arrayIndex}  id=${c.id}  name="${c.name}"  price=${c.price}  selected=${c.selected}`));

  // ── 8. Click each plan and verify correct Bask card is selected ───────────
  log("\n=== CLICK-THROUGH PLAN MAPPING TEST ===");

  for (const cc of customCards) {
    await page.click(`.prog-plan-card[data-id="${cc.id}"]`);
    await page.waitForTimeout(1000);

    const result = await page.evaluate((id) => {
      const baskList = [...document.querySelectorAll("ul.relative.mt-5.flex.flex-col.gap-3 > li")];
      const selIdx   = baskList.findIndex(li => li.classList.contains("border-2"));
      const selTitle = selIdx >= 0
        ? baskList[selIdx]?.querySelector(":scope > div:first-child span:first-child")?.textContent?.trim()
        : "(none)";
      return { selIdx, selTitle };
    }, cc.id);

    const expected = TITLE_MAP[cc.id];
    const ok = result.selTitle === expected;
    log(`  ${ok ? "✓" : "✗"}  Click "${cc.name}" (id=${cc.id}) → Bask="${result.selTitle}" expected="${expected}" ${ok ? "CORRECT" : "WRONG!"}`);
  }

  log("\n=== DONE ===");
  log("Keeping browser open for manual inspection. Close it when done.\n");

  await new Promise(resolve => {
    page.on("close", resolve);
    context.on("close", resolve);
  });

  stopServer();
  logStream.end();
})();
