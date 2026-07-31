/**
 * Test the payment modal implementation.
 * Run: node playwright/test-modal.js
 */
const { chromium } = require("@playwright/test");
const path = require("path");
const fs   = require("fs");

const USER_DATA_DIR = path.join(__dirname, "auth", "user-data");
const SNAPSHOT_FILE = path.join(__dirname, "auth", "checkout-snapshot.json");
const SS_MAIN       = path.join(__dirname, "auth", "modal-test-main.png");
const SS_OPEN       = path.join(__dirname, "auth", "modal-test-open.png");

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

  console.log("\n⏳ Waiting for plan UI (.prog-plans)...");
  try {
    await page.waitForSelector(".prog-plans", { timeout: 20_000 });
  } catch {
    console.error("❌ .prog-plans never appeared");
    await new Promise(() => {});
  }

  await page.waitForTimeout(3000);

  // ── 1. Check patient name
  const firstName = await page.evaluate(() => window.baskPatientData?.firstName);
  console.log(`\n👤 baskPatientData.firstName = "${firstName}"`);

  // ── 2. Check for trigger button
  const payBtn = await page.$("#tzmd-pay-btn");
  console.log(`\n🔘 #tzmd-pay-btn present: ${!!payBtn}`);
  if (payBtn) {
    const txt = await payBtn.textContent();
    console.log(`   text: "${txt.trim()}"`);
  }

  // ── 3. Check payment section location
  const paymentLocation = await page.evaluate(() => {
    const payEl = document.getElementById("payment-element");
    if (!payEl) return "❌ #payment-element not found";
    const inModal = !!payEl.closest("#tzmd-modal-inner");
    const inPage  = !inModal;
    return inModal ? "✅ Inside #tzmd-modal-inner (modal)" : "❌ Still in original page position";
  });
  console.log(`\n📦 Payment section location: ${paymentLocation}`);

  // ── 4. Check modal overlay exists
  const modalExists = await page.evaluate(() => !!document.getElementById("tzmd-modal-overlay"));
  console.log(`\n🪟 #tzmd-modal-overlay in DOM: ${modalExists}`);

  // ── 5. Check modal is hidden initially
  const modalHidden = await page.evaluate(() => {
    const el = document.getElementById("tzmd-modal-overlay");
    if (!el) return "N/A";
    return !el.classList.contains("tzmd-open") ? "✅ Hidden (correct)" : "❌ Visible when it shouldn't be";
  });
  console.log(`   Initial state: ${modalHidden}`);

  // ── 6. Check console logs
  const modalLog = await page.evaluate(() => {
    // Check if CO-MODAL log message was generated (stored in __TZMD__ debug)
    return window.__TZMD__?._modalCleanup ? "cleanup fn registered ✓" : "no cleanup fn (modal may not have run)";
  });
  console.log(`\n🔍 Modal cleanup fn: ${modalLog}`);

  // Screenshot of main page
  await page.screenshot({ path: SS_MAIN, fullPage: true });
  console.log(`\n📸 Main page: ${SS_MAIN}`);

  // ── 7. Click trigger button to open modal
  if (payBtn) {
    console.log("\n🖱️  Clicking trigger button...");
    await payBtn.click();
    await page.waitForTimeout(600);

    const modalOpen = await page.evaluate(() => {
      const el = document.getElementById("tzmd-modal-overlay");
      return el?.classList.contains("tzmd-open") ? "✅ Modal is OPEN" : "❌ Modal did not open";
    });
    console.log(`   ${modalOpen}`);

    // Check Stripe element visible in modal
    const stripeInModal = await page.evaluate(() => {
      const payEl = document.getElementById("payment-element");
      const modal = document.getElementById("tzmd-modal-box");
      if (!payEl || !modal) return "❌ elements missing";
      return modal.contains(payEl) ? "✅ Stripe element visible in modal" : "❌ Stripe element NOT in modal box";
    });
    console.log(`   ${stripeInModal}`);

    await page.screenshot({ path: SS_OPEN, fullPage: true });
    console.log(`\n📸 Modal open: ${SS_OPEN}`);

    // ── 8. Close modal with X button
    await page.waitForTimeout(500);
    console.log("\n🖱️  Clicking ✕ to close...");
    await page.click("#tzmd-modal-close");
    await page.waitForTimeout(400);

    const modalClosed = await page.evaluate(() => {
      const el = document.getElementById("tzmd-modal-overlay");
      return !el?.classList.contains("tzmd-open") ? "✅ Modal closed successfully" : "❌ Modal still open";
    });
    console.log(`   ${modalClosed}`);

    // ── 9. Reopen and check Stripe still works
    console.log("\n🖱️  Reopening modal...");
    await payBtn.click();
    await page.waitForTimeout(600);
    const stripeStillThere = await page.evaluate(() => {
      const payEl = document.getElementById("payment-element");
      const modal  = document.getElementById("tzmd-modal-box");
      return (payEl && modal?.contains(payEl)) ? "✅ Stripe element still in modal after reopen" : "❌ Stripe element missing after reopen";
    });
    console.log(`   ${stripeStillThere}`);
  } else {
    console.log("\n⚠️  Trigger button not found — cannot test modal open/close");
    console.log("   Possible causes:");
    console.log("   • JS not pasted into Bask admin yet");
    console.log("   • window.baskPatientData.firstName !== 'Ehsanullah'");
    console.log("   • findPaymentSection() returned null (check console for [CO-MODAL] logs)");
  }

  console.log("\n   Browser staying open. Press Ctrl+C to close.\n");
  await new Promise(() => {});
})();
