/**
 * Inspect paySection's direct children to understand DOM structure for padding fix.
 * Run: node playwright/inspect-paysection.js
 */
const { chromium } = require("@playwright/test");
const path = require("path");
const fs   = require("fs");

const USER_DATA_DIR = path.join(__dirname, "auth", "user-data");
const SNAPSHOT_FILE = path.join(__dirname, "auth", "checkout-snapshot.json");

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
    if (msg.text().includes("[CO")) console.log("  [PAGE]", msg.text());
  });

  await page.goto(snap.url);
  await page.waitForSelector(".prog-plans", { timeout: 20_000 });
  await page.waitForSelector("#tzmd-modal-overlay", { state: "attached", timeout: 120_000 });
  await page.waitForTimeout(500);

  // Open modal
  await page.click("#tzmd-pay-btn");
  await page.waitForTimeout(1000);

  // Inspect paySection's direct children
  const structure = await page.evaluate(() => {
    const header   = document.getElementById("tzmd-modal-header");
    const inner    = document.getElementById("tzmd-modal-inner");
    const paySection = header?.parentElement;

    if (!paySection) return { error: "paySection not found via headerEl.parentElement" };

    const children = [...paySection.children].map((el, i) => {
      const rect = el.getBoundingClientRect();
      const cs   = window.getComputedStyle(el);
      return {
        index: i,
        id:   el.id || "(none)",
        tag:  el.tagName,
        cls:  [...el.classList].join(" ").slice(0, 120),
        paddingLeft:  cs.paddingLeft,
        paddingRight: cs.paddingRight,
        width:        Math.round(rect.width),
        left:         Math.round(rect.left),
        childCount:   el.children.length,
        firstChildTag: el.firstElementChild?.tagName ?? "(none)",
        firstChildCls: [...(el.firstElementChild?.classList ?? [])].join(" ").slice(0, 80),
        textSnippet:  el.textContent.trim().slice(0, 60),
      };
    });

    return {
      payTag: paySection.tagName,
      payCls: [...paySection.classList].join(" ").slice(0, 120),
      payPaddingLeft: window.getComputedStyle(paySection).paddingLeft,
      payWidth: Math.round(paySection.getBoundingClientRect().width),
      childCount: paySection.children.length,
      children,
    };
  });

  console.log("\n=== paySection structure ===");
  console.log("tag:", structure.payTag, "cls:", structure.payCls);
  console.log("paddingLeft:", structure.payPaddingLeft, "width:", structure.payWidth);
  console.log("total children:", structure.childCount);
  structure.children?.forEach(c => {
    console.log(`\n  [${c.index}] <${c.tag}> id="${c.id}" cls="${c.cls.slice(0,80)}"`);
    console.log(`       paddingLeft=${c.paddingLeft} paddingRight=${c.paddingRight} width=${c.width} left=${c.left}`);
    console.log(`       children=${c.childCount} firstChild=<${c.firstChildTag}> firstChildCls="${c.firstChildCls}"`);
    console.log(`       text="${c.textSnippet}"`);
  });

  console.log("\n   Browser staying open. Ctrl+C to close.\n");
  await new Promise(() => {});
})();
