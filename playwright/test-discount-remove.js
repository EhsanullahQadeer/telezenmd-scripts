/**
 * Tests the specific crash scenario: apply a discount code, then click Remove.
 * Previously caused React removeChild NotFoundError + Bask 500 error page.
 * Run: node playwright/test-discount-remove.js
 */
const { chromium } = require("@playwright/test");
const path = require("path");
const fs   = require("fs");

const USER_DATA_DIR = path.join(__dirname, "auth", "user-data");
const SNAPSHOT_FILE = path.join(__dirname, "auth", "checkout-snapshot.json");
const SS = (name) => path.join(__dirname, "auth", `dr-${name}.png`);

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
  let pageErrors = [];
  let consoleErrors = [];

  page.on("console", msg => {
    const txt = msg.text();
    if (msg.type() === "error") consoleErrors.push(txt);
    if (txt.includes("[CO") || txt.includes("removeChild") || txt.includes("NotFoundError")) {
      console.log(`  [PAGE] ${txt}`);
    }
  });

  page.on("pageerror", err => {
    pageErrors.push(err.message);
    console.error(`  [PAGE ERROR] ${err.message}`);
  });

  await page.goto(snap.url);
  console.log("\n⏳ Waiting for plan UI...");
  await page.waitForSelector(".prog-plans", { timeout: 20_000 });

  // Wait for setup() to complete — overlay is only created after Stripe mounts
  console.log("⏳ Waiting for modal setup (Stripe mount)...");
  await page.waitForSelector("#tzmd-modal-overlay", { state: "attached", timeout: 120_000 });
  console.log("✅ Modal overlay ready");
  await page.waitForTimeout(500);

  // ── Open modal ──────────────────────────────────────────────────────────────
  const payBtn = await page.$("#tzmd-pay-btn");
  if (!payBtn) { console.error("❌ #tzmd-pay-btn not found"); await new Promise(() => {}); }

  console.log("\n🖱️  Opening modal...");
  await payBtn.click();
  await page.waitForTimeout(1200);

  // Verify modal is using the new CSS approach (not DOM move)
  const modalCheck = await page.evaluate(() => {
    const overlay    = document.getElementById("tzmd-modal-overlay");
    const headerEl   = document.getElementById("tzmd-modal-header");
    const modalInner = document.getElementById("tzmd-modal-inner");
    // paySection is headerEl's parent (we prepend headerEl INTO paySection in setup)
    const paySection = headerEl?.parentElement ?? null;

    const overlayContainsPay = overlay?.contains(paySection) ?? false;
    const payHasSheet        = paySection?.classList.contains("tzmd-pay-sheet") ?? false;
    const headerInPay        = paySection?.contains(headerEl) ?? false;
    const innerInPay         = paySection?.contains(modalInner) ?? false;
    const payTag             = paySection?.tagName ?? "(null)";
    const payCls             = paySection ? [...paySection.classList].join(" ").slice(0, 120) : "(null)";

    // Also confirm paySection is still where React put it (not moved inside overlay)
    const payParentIsOverlay = paySection?.parentElement === overlay;

    return { overlayContainsPay, payHasSheet, headerInPay, innerInPay,
             overlayExists: !!overlay, headerExists: !!headerEl, innerExists: !!modalInner,
             payTag, payCls, payParentIsOverlay };
  });

  console.log("\n🔍 Modal structure check (new CSS approach):");
  console.log("  overlay exists:                ", modalCheck.overlayExists);
  console.log("  headerEl exists:               ", modalCheck.headerExists);
  console.log("  paySection tag / class:        ", modalCheck.payTag, "/", modalCheck.payCls.slice(0, 80));
  console.log("  paySection has .tzmd-pay-sheet:", modalCheck.payHasSheet);
  console.log("  overlay does NOT contain paySection:", !modalCheck.overlayContainsPay);
  console.log("  paySection parent is overlay:  ", modalCheck.payParentIsOverlay, "(must be false)");
  console.log("  headerEl IS inside paySection: ", modalCheck.headerInPay);
  console.log("  modalInner IS inside paySection:", modalCheck.innerInPay);

  const structureOk = !modalCheck.overlayContainsPay && !modalCheck.payParentIsOverlay
                   && modalCheck.headerInPay && modalCheck.innerInPay;
  console.log(structureOk
    ? "  ✅ DOM structure correct (paySection NOT moved — React crash fix confirmed)"
    : "  ❌ DOM structure WRONG — paySection may have been moved");

  await page.screenshot({ path: SS("1-modal-open"), fullPage: true });
  console.log(`📸 ${SS("1-modal-open")}`);

  // ── Find discount input inside Bask's native UI ──────────────────────────────
  // The new CSS approach keeps paySection in its original DOM position.
  // Bask's discount section is directly visible inside the modal sheet.
  const discountState = await page.evaluate(() => {
    // Find the Bask "Discounts" / promo code input anywhere in the page
    const inputs = [...document.querySelectorAll("input")];
    const codeInput = inputs.find(i =>
      i.placeholder?.toLowerCase().includes("code") ||
      i.placeholder?.toLowerCase().includes("discount") ||
      i.closest("[data-tzmd-discount]") ||
      i.name?.toLowerCase().includes("discount")
    );

    // Also look for the Discounts section header text
    const discountHeader = [...document.querySelectorAll("*")].find(
      el => el.children.length === 0 && el.textContent.trim() === "Discounts"
    );

    return {
      codeInputFound: !!codeInput,
      codeInputPlaceholder: codeInput?.placeholder ?? "(none)",
      codeInputRect: codeInput ? codeInput.getBoundingClientRect() : null,
      discountHeaderFound: !!discountHeader,
      discountHeaderText: discountHeader?.textContent.trim(),
    };
  });

  console.log("\n📋 Discount UI state:");
  console.log("  Code input found:  ", discountState.codeInputFound, "placeholder:", discountState.codeInputPlaceholder);
  console.log("  Discount header:   ", discountState.discountHeaderFound, discountState.discountHeaderText);

  await page.screenshot({ path: SS("2-modal-discount-area"), fullPage: true });
  console.log(`📸 ${SS("2-modal-discount-area")}`);

  // ── Type a discount code ─────────────────────────────────────────────────────
  console.log("\n⌨️  Typing discount code: TESTCODE");
  await page.evaluate(() => {
    const inputs = [...document.querySelectorAll("input")];
    const inp = inputs.find(i =>
      i.placeholder?.toLowerCase().includes("code") ||
      i.placeholder?.toLowerCase().includes("discount") ||
      i.closest("[data-tzmd-discount]") ||
      i.name?.toLowerCase().includes("discount")
    );
    if (inp) {
      inp.focus();
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeSetter.call(inp, 'TESTCODE');
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
      console.log("[TEST] Typed into input:", inp.placeholder);
    } else {
      console.log("[TEST] No discount input found");
    }
  });
  await page.waitForTimeout(400);

  // Click Apply
  console.log("🖱️  Clicking Apply...");
  const applyBtn = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button[type="button"]')].find(b => b.textContent.trim() === 'Apply');
    if (b) b.click();
    return !!b;
  });
  console.log("  Apply clicked:", applyBtn);
  await page.waitForTimeout(3000); // wait for Bask to validate the discount

  await page.screenshot({ path: SS("3-after-apply"), fullPage: true });
  console.log(`📸 ${SS("3-after-apply")}`);

  // ── Look for Remove button ───────────────────────────────────────────────────
  const removeInfo = await page.evaluate(() => {
    const removeBtn = [...document.querySelectorAll('button[type="button"]')]
      .find(b => b.textContent.trim() === 'Remove');
    const is500 = document.body.textContent.includes("500") && document.body.textContent.includes("Error");
    return {
      removeBtnFound: !!removeBtn,
      removeBtnText:  removeBtn?.textContent.trim(),
      is500Page: is500,
      bodySnippet: document.body.textContent.trim().slice(0, 200),
    };
  });

  console.log("\n📋 After Apply:");
  console.log("  Remove button found:", removeInfo.removeBtnFound);
  console.log("  500 error page:", removeInfo.is500Page);
  if (!removeInfo.removeBtnFound) {
    console.log("  Body snippet:", removeInfo.bodySnippet);
    console.log("\n⚠️  No Remove button found — discount code may be invalid or Apply failed.");
    console.log("    This test needs a valid discount code to proceed with the Remove step.");
    console.log("    Check screenshot 3-after-apply.png for current state.");
    console.log("\n   Browser staying open. Ctrl+C to close.\n");
    await new Promise(() => {});
  }

  // ── Click Remove ─────────────────────────────────────────────────────────────
  console.log("\n🖱️  Clicking Remove...");
  pageErrors = []; // reset error capture
  consoleErrors = [];

  await page.evaluate(() => {
    const removeBtn = [...document.querySelectorAll('button[type="button"]')]
      .find(b => b.textContent.trim() === 'Remove');
    if (removeBtn) removeBtn.click();
  });
  await page.waitForTimeout(3000); // wait for React reconciliation + any error page

  await page.screenshot({ path: SS("4-after-remove"), fullPage: true });
  console.log(`📸 ${SS("4-after-remove")}`);

  // ── Verify no crash ───────────────────────────────────────────────────────────
  const afterRemove = await page.evaluate(() => {
    const is500   = document.body.textContent.includes("500") &&
                    (document.body.textContent.includes("Internal Server Error") ||
                     document.body.textContent.includes("Bask Error") ||
                     document.title.includes("500"));
    const modalStillOpen = document.getElementById("tzmd-modal-overlay")?.classList.contains("tzmd-open");
    const paySheetActive = document.querySelector(".tzmd-pay-sheet") !== null;
    const removeChildErr = (window.__TZMD__?._lastError ?? "").includes("removeChild");

    return { is500, modalStillOpen, paySheetActive };
  });

  const removeChildErrors = pageErrors.filter(e => e.includes("removeChild") || e.includes("NotFoundError"));
  const reactErrors       = pageErrors.filter(e => e.includes("React") || e.includes("reconcil"));

  console.log("\n📋 After Remove:");
  console.log("  500 error page:       ", afterRemove.is500);
  console.log("  Modal overlay open:   ", afterRemove.modalStillOpen);
  console.log("  paySection has sheet: ", afterRemove.paySheetActive);
  console.log("  removeChild errors:   ", removeChildErrors.length, removeChildErrors);
  console.log("  React errors:         ", reactErrors.length, reactErrors);
  console.log("  All page errors:      ", pageErrors.length, pageErrors.slice(0, 3));

  const passed = !afterRemove.is500 && removeChildErrors.length === 0;
  console.log("\n" + (passed
    ? "✅ PASS — Discount Remove did NOT cause a React crash or 500 error"
    : "❌ FAIL — Crash or error page detected after clicking Remove"));

  console.log("\n   Browser staying open. Ctrl+C to close.\n");
  // Keep browser open so you can inspect the result
  await new Promise(r => setTimeout(r, 30_000));
})();
