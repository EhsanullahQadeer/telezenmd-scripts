const { test, expect } = require("@playwright/test");
const path = require("path");
const fs   = require("fs");

const SNAPSHOT_FILE = path.join(__dirname, "../auth/checkout-snapshot.json");

// Load the snapshot saved by save-checkout-session.js
function loadSnapshot() {
  if (!fs.existsSync(SNAPSHOT_FILE)) {
    throw new Error(
      "No checkout snapshot found.\n" +
      "Run:  node playwright/save-checkout-session.js\n" +
      "Navigate to the plan-selection screen, then re-run the tests."
    );
  }
  return JSON.parse(fs.readFileSync(SNAPSHOT_FILE, "utf8"));
}

test.beforeEach(async ({ page }) => {
  const snap = loadSnapshot();

  // Restore webdriver flag removal + full localStorage/sessionStorage before each page load
  await page.addInitScript((state) => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    try {
      Object.entries(state.localStorage).forEach(([k, v]) => localStorage.setItem(k, v));
      Object.entries(state.sessionStorage).forEach(([k, v]) => sessionStorage.setItem(k, v));
    } catch (_) {}
  }, { localStorage: snap.localStorage, sessionStorage: snap.sessionStorage });

  // Navigate directly to the saved checkout URL
  await page.goto(snap.url);
});

test.describe("TirzepatideCheckout — price mapping", () => {

  test("plans render with correct prices from Bask cards", async ({ page }) => {
    // Wait for our custom plan cards to appear
    await page.waitForSelector(".prog-plans", { timeout: 20_000 });

    const cards = await page.$$(".prog-plan-card");
    console.log(`[plans] found ${cards.length} plan cards`);
    expect(cards.length).toBe(4);

    // Log and verify each plan
    for (const card of cards) {
      const id     = await card.getAttribute("data-id");
      const price  = await card.$eval(".prog-amt",          el => el.textContent).catch(() => "–");
      const billed = await card.$eval(".prog-plan-billed",  el => el.textContent).catch(() => "–");
      const badge  = await card.$eval(".prog-plan-badge",   el => el.textContent.trim()).catch(() => "–");
      console.log(`  [${id}]  price=${price}  badge=${badge}  billed=${billed}`);

      // Price must look like $199 or $199.00 — not $0 or NaN
      expect(price).toMatch(/^\$[\d,]+(\.\d{2})?$/);
      expect(price).not.toBe("$0");
      expect(price).not.toContain("NaN");
    }

    // Value block sanity check
    const valueBlock = page.locator(".co-value-block");
    if (await valueBlock.count()) {
      const text = await valueBlock.innerText();
      console.log("[value-block]", text.replace(/\n/g, " | "));
    }
  });

  test("selecting a plan updates Bask hidden card", async ({ page }) => {
    await page.waitForSelector(".prog-plan-card", { timeout: 20_000 });

    // Click the 6-month plan
    const sixMonth = page.locator('.prog-plan-card[data-id="sixmonth"]');
    await sixMonth.click();

    // Our custom card should be marked selected
    await expect(sixMonth).toHaveClass(/prog-selected/);
    console.log("[sixmonth] custom card selected ✓");

    // Bask's hidden card list — one should have border-2 (selected)
    const baskList = page.locator("ul.relative.mt-5.flex.flex-col.gap-3 > li");
    const count    = await baskList.count();
    console.log(`[bask-cards] found ${count} Bask hidden cards`);

    let selectedCount = 0;
    for (let i = 0; i < count; i++) {
      const cls = await baskList.nth(i).getAttribute("class") ?? "";
      if (cls.includes("border-2")) {
        selectedCount++;
        const text = await baskList.nth(i).innerText().catch(() => "");
        console.log(`  [bask-selected #${i}]`, text.slice(0, 60));
      }
    }
    expect(selectedCount).toBe(1);
  });

});
