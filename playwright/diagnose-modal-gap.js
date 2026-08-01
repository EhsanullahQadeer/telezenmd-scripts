/**
 * Monitors modal visibility every 100ms during discount removal.
 * Catches the exact frame where the modal disappears and what's in DOM at that point.
 * Run: node playwright/diagnose-modal-gap.js
 */
const { chromium } = require("@playwright/test");
const path = require("path");
const fs   = require("fs");

const USER_DATA_DIR = path.join(__dirname, "auth", "user-data");
const SNAPSHOT_FILE = path.join(__dirname, "auth", "checkout-snapshot.json");
const SS = (name) => path.join(__dirname, "auth", `gap-${name}.png`);

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
  page.on("console", msg => {
    const txt = msg.text();
    if (txt.includes("[MON]") || txt.includes("[DIAG]")) console.log("  [PAGE]", txt);
  });
  page.on("pageerror", err => console.error("  [ERROR]", err.message));

  await page.goto(snap.url);
  await page.waitForSelector(".prog-plans", { timeout: 20_000 });
  await page.waitForSelector("#tzmd-modal-overlay", { state: "attached", timeout: 120_000 });
  await page.waitForTimeout(1000);

  // Open modal
  console.log("\n[1] Opening modal...");
  await page.click("#tzmd-pay-btn");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: SS("1-open"), fullPage: false });

  // Apply discount
  console.log("[2] Applying discount...");
  await page.evaluate(() => {
    const disc = [...document.querySelectorAll("*")]
      .find(el => el.children.length === 0 && el.textContent.trim() === "Discounts");
    if (disc) (disc.closest("button,[role='button']") ?? disc.parentElement)?.click();
  });
  await page.waitForTimeout(500);
  const inp = await page.$('input[placeholder*="code" i], input[placeholder*="discount" i]');
  if (inp) {
    await page.evaluate(inp => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(inp, "TELE50ZEN");
      inp.dispatchEvent(new Event("input", { bubbles: true }));
      inp.dispatchEvent(new Event("change", { bubbles: true }));
    }, inp);
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find(b => /^apply$/i.test(b.textContent.trim()));
      if (b) b.click();
    });
    await page.waitForTimeout(4000);
  }

  // Start polling BEFORE clicking Remove — captures the full transition
  console.log("[3] Starting 100ms modal-state monitor...");
  await page.evaluate(() => {
    window.__monLog = [];
    window.__monRunning = true;
    let frame = 0;
    function check() {
      if (!window.__monRunning) return;
      const overlay  = document.getElementById("tzmd-modal-overlay");
      const shell    = document.getElementById("tzmd-loading-shell");
      const paySheet = document.querySelector(".tzmd-pay-sheet");
      const header   = document.getElementById("tzmd-modal-header");
      const toast    = document.querySelector('[role="status"],[role="alert"],[aria-live],.toast,.notification');
      const entry = {
        t: frame++,
        overlayOpen:   overlay?.classList.contains("tzmd-open") ?? false,
        shellOpen:     shell?.classList.contains("tzmd-ls-open") ?? false,
        paySheetTag:   paySheet?.tagName ?? null,
        headerInDom:   !!header,
        headerInPay:   paySheet ? paySheet.contains(header) : false,
        toastVisible:  !!toast,
        toastText:     toast?.textContent?.trim().slice(0,60) ?? null,
      };
      // Only log changes
      const prev = window.__monLog[window.__monLog.length - 1];
      const changed = !prev ||
        prev.overlayOpen !== entry.overlayOpen ||
        prev.shellOpen   !== entry.shellOpen   ||
        prev.paySheetTag !== entry.paySheetTag  ||
        prev.headerInDom !== entry.headerInDom  ||
        prev.headerInPay !== entry.headerInPay  ||
        prev.toastVisible !== entry.toastVisible;
      if (changed) {
        window.__monLog.push(entry);
        console.log("[MON] t=" + entry.t*100 + "ms overlay=" + entry.overlayOpen +
          " shell=" + entry.shellOpen + " paySheet=" + entry.paySheetTag +
          " headerInDom=" + entry.headerInDom + " headerInPay=" + entry.headerInPay +
          " toast=" + entry.toastVisible + (entry.toastText ? ' "'+entry.toastText+'"' : ""));
      }
      setTimeout(check, 100);
    }
    check();
  });

  // Click Remove (step 1)
  console.log("[4] Clicking Remove link...");
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button, a, span")]
      .find(b => b.textContent.trim() === "Remove" && !b.closest('[role="dialog"]'));
    if (b) b.click();
  });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: SS("4a-confirm"), fullPage: false });

  // Click red Confirm Remove
  console.log("[5] Clicking RED Confirm Remove...");
  await page.evaluate(() => {
    const buttons = [...document.querySelectorAll("button")];
    const btn = buttons.reverse().find(b => b.textContent.trim() === "Remove");
    if (btn) btn.click();
  });

  // Let it play out for 5 seconds
  await page.waitForTimeout(5000);

  // Stop monitor
  const log = await page.evaluate(() => {
    window.__monRunning = false;
    return window.__monLog;
  });

  await page.screenshot({ path: SS("5-after-5s"), fullPage: false });
  console.log("\n[6] Full state log (" + log.length + " change events):");
  log.forEach(e => {
    console.log("  t=" + (e.t*100) + "ms overlay=" + e.overlayOpen +
      " shell=" + e.shellOpen + " paySheet=" + e.paySheetTag +
      " headerInDom=" + e.headerInDom + " headerInPay=" + e.headerInPay +
      " toast=" + e.toastVisible + (e.toastText ? ' "'+e.toastText+'"' : ""));
  });

  console.log("\n  Browser staying open for manual inspection.");
  await new Promise(() => {});
})();
