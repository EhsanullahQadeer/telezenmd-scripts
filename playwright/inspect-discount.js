/**
 * Inspect discount section visibility in modal after CSS !important rule.
 * Run: node playwright/inspect-discount.js
 */
const { chromium } = require("@playwright/test");
const path = require("path");
const fs   = require("fs");

const USER_DATA_DIR = path.join(__dirname, "auth", "user-data");
const SNAPSHOT_FILE = path.join(__dirname, "auth", "checkout-snapshot.json");
const SS = (name) => path.join(__dirname, "auth", `inspect-${name}.png`);

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
    if (txt.includes("[CO")) console.log(`  [PAGE] ${txt}`);
  });

  await page.goto(snap.url);
  await page.waitForSelector(".prog-plans", { timeout: 20_000 });
  await page.waitForTimeout(3000);

  // Open modal
  const payBtn = await page.$("#tzmd-pay-btn");
  if (!payBtn) { console.error("❌ #tzmd-pay-btn not found"); await new Promise(() => {}); }
  await payBtn.click();
  await page.waitForTimeout(1200);

  await page.screenshot({ path: SS("modal-open"), fullPage: true });
  console.log(`📸 ${SS("modal-open")}`);

  const info = await page.evaluate(() => {
    // 1. Check if our style tag is injected
    const ourStyle = document.getElementById("tzmd-modal-style");
    const styleText = ourStyle?.textContent ?? "";
    const rulePresent = styleText.includes("grid-template-rows: 1fr");

    // 2. Find the discount grid container
    const discountEl = document.querySelector("#tzmd-modal-inner .duration-400.grid.overflow-hidden.transition-all");

    // 3. Check all elements matching that selector anywhere in modal inner
    const allMatches = [...document.querySelectorAll("#tzmd-modal-inner .duration-400.grid.overflow-hidden.transition-all")]
      .map(el => ({
        tag: el.tagName,
        inlineStyle: el.getAttribute("style"),
        computedGridRows: window.getComputedStyle(el).gridTemplateRows,
        computedDisplay: window.getComputedStyle(el).display,
        height: el.getBoundingClientRect().height,
        text: el.textContent.trim().slice(0, 60),
      }));

    // 4. Also check WITHOUT the #tzmd-modal-inner scope (in case element is outside)
    const allMatchesAnywhere = [...document.querySelectorAll(".duration-400.grid.overflow-hidden.transition-all")]
      .map(el => ({
        inModal: document.getElementById("tzmd-modal-inner")?.contains(el),
        inlineStyle: el.getAttribute("style"),
        computedGridRows: window.getComputedStyle(el).gridTemplateRows,
        computedDisplay: window.getComputedStyle(el).display,
        height: el.getBoundingClientRect().height,
        text: el.textContent.trim().slice(0, 60),
      }));

    // 5. Check discount-related Bask structure
    const applyBtn = [...document.querySelectorAll("button[type='button']")]
      .find(b => b.textContent.trim() === "Apply");

    return {
      ourStyleInjected: !!ourStyle,
      rulePresent,
      matchesInModal: allMatches,
      matchesAnywhere: allMatchesAnywhere,
      applyBtnFound: !!applyBtn,
      applyBtnRect: applyBtn ? applyBtn.getBoundingClientRect() : null,
      applyBtnComputedDisplay: applyBtn ? window.getComputedStyle(applyBtn).display : "(none)",
    };
  });

  console.log("\n=== DISCOUNT INSPECTION ===");
  console.log("Our style injected:    ", info.ourStyleInjected);
  console.log("grid-template-rows rule present in style:", info.rulePresent);
  console.log("\nMatches inside #tzmd-modal-inner:", info.matchesInModal.length);
  info.matchesInModal.forEach((m, i) => {
    console.log(`  [${i}] tag=${m.tag} inline="${m.inlineStyle}" computed-grid-rows="${m.computedGridRows}" display="${m.computedDisplay}" h=${m.height}px text="${m.text}"`);
  });
  console.log("\nMatches anywhere on page:", info.matchesAnywhere.length);
  info.matchesAnywhere.forEach((m, i) => {
    console.log(`  [${i}] inModal=${m.inModal} inline="${m.inlineStyle}" computed-grid-rows="${m.computedGridRows}" display="${m.computedDisplay}" h=${m.height}px text="${m.text}"`);
  });
  console.log("\nApply button found:", info.applyBtnFound);
  if (info.applyBtnRect) {
    console.log("Apply button rect: top=" + Math.round(info.applyBtnRect.top) + " h=" + Math.round(info.applyBtnRect.height));
  }
  console.log("Apply button computed display:", info.applyBtnComputedDisplay);

  console.log("\n   Browser staying open. Ctrl+C to close.\n");
  await new Promise(() => {});
})();
