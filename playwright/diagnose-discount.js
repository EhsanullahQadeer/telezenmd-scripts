/**
 * Diagnose exactly what React does to our modal nodes when a discount is removed.
 * Run: node playwright/diagnose-discount.js
 */
const { chromium } = require("@playwright/test");
const path = require("path");
const fs   = require("fs");

const USER_DATA_DIR = path.join(__dirname, "auth", "user-data");
const SNAPSHOT_FILE = path.join(__dirname, "auth", "checkout-snapshot.json");
const SS = (name) => path.join(__dirname, "auth", `diag-${name}.png`);

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
    if (txt.includes("[DIAG]") || txt.includes("[CO]")) console.log("  [PAGE]", txt);
  });
  page.on("pageerror", err => console.error("  [ERROR]", err.message));

  await page.goto(snap.url);
  await page.waitForSelector(".prog-plans", { timeout: 20_000 });
  await page.waitForSelector("#tzmd-modal-overlay", { state: "attached", timeout: 120_000 });
  await page.waitForTimeout(1000);

  // ── Open modal ────────────────────────────────────────────────────────────────
  console.log("\n[1] Opening modal...");
  await page.click("#tzmd-pay-btn");
  await page.waitForTimeout(1000);

  // Inject diagnostic observer AFTER modal is open, watching paySection children
  await page.evaluate(() => {
    const header = document.getElementById("tzmd-modal-header");
    const inner  = document.getElementById("tzmd-modal-inner");
    if (!header || !inner) { console.log("[DIAG] WARN: header or inner not found after modal open"); return; }

    const paySection = header.parentElement;
    if (!paySection) { console.log("[DIAG] WARN: header has no parentElement"); return; }

    // Log initial state
    console.log("[DIAG] Modal open — initial state:");
    console.log("[DIAG]   header tag:", header.tagName, "id:", header.id, "inPaySection:", paySection.contains(header));
    console.log("[DIAG]   inner  tag:", inner.tagName,  "id:", inner.id,  "inPaySection:", paySection.contains(inner));
    console.log("[DIAG]   paySection direct children:", [...paySection.children].map(c => c.tagName + "#" + c.id).join(", "));

    // Watch paySection direct children for mutations
    const obs = new MutationObserver(records => {
      for (const rec of records) {
        if (rec.removedNodes.length) {
          const removed = [...rec.removedNodes].map(n => n.tagName + (n.id ? "#"+n.id : ""));
          console.log("[DIAG] REMOVED from paySection:", removed.join(", "));
        }
        if (rec.addedNodes.length) {
          const added = [...rec.addedNodes].map(n => n.tagName + (n.id ? "#"+n.id : ""));
          console.log("[DIAG] ADDED to paySection:", added.join(", "));
        }
      }
      // After any mutation, log state of our nodes
      const hInPage = document.contains(header);
      const hInPay  = paySection.contains(header);
      const iInPay  = paySection.contains(inner);
      console.log("[DIAG] After mutation → header: inDocument=" + hInPage + " inPaySection=" + hInPay + " | inner inPaySection=" + iInPay);
      console.log("[DIAG]   paySection children now:", [...paySection.children].map(c => c.tagName + "#" + c.id).join(", "));
    });
    obs.observe(paySection, { childList: true });

    // Also watch for attribute mutations on our nodes
    const attrObs = new MutationObserver(records => {
      for (const rec of records) {
        console.log("[DIAG] ATTR change on", rec.target.tagName + "#" + rec.target.id, "attr:", rec.attributeName, "now:", rec.target.getAttribute(rec.attributeName));
      }
    });
    if (header.id) attrObs.observe(header, { attributes: true });
    if (inner.id) attrObs.observe(inner, { attributes: true });

    window.__tzmdDiagObs = { obs, attrObs };
    console.log("[DIAG] Observers installed on paySection");
  });

  await page.screenshot({ path: SS("1-modal-open"), fullPage: false });
  console.log("[1] Modal open. Screenshot:", SS("1-modal-open"));

  // ── Find and apply a discount code ───────────────────────────────────────────
  console.log("\n[2] Looking for discount input...");
  const discountInput = await page.$('input[placeholder*="code" i], input[placeholder*="discount" i]');
  if (!discountInput) {
    console.log("  No discount input found. Checking if there is already an applied discount...");
    const removeBtn = await page.$('button[type="button"]');
    const removeBtnText = await page.evaluate(() => {
      return [...document.querySelectorAll('button[type="button"]')]
        .find(b => b.textContent.trim() === 'Remove')?.textContent.trim() ?? "not found";
    });
    console.log("  Remove button:", removeBtnText);
  }

  // Look for the Discounts section and open it if collapsed
  const hasDiscountSection = await page.evaluate(() => {
    const sections = [...document.querySelectorAll("*")];
    const disc = sections.find(el => el.children.length === 0 && el.textContent.trim() === "Discounts");
    if (disc) {
      // Click the parent to expand if collapsed
      const parent = disc.closest("button, [role='button'], [onclick]") ?? disc.parentElement;
      if (parent) parent.click();
      return true;
    }
    return false;
  });
  console.log("  Discounts section found:", hasDiscountSection);
  await page.waitForTimeout(500);

  // Type a code and apply
  const inp = await page.$('input[placeholder*="code" i], input[placeholder*="discount" i]');
  if (inp) {
    console.log("[2] Typing test discount code TELE50ZEN...");
    await page.evaluate(inp => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(inp, "TELE50ZEN");
      inp.dispatchEvent(new Event("input", { bubbles: true }));
      inp.dispatchEvent(new Event("change", { bubbles: true }));
    }, inp);
    await page.waitForTimeout(300);

    const applyBtn = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(b => /^apply$/i.test(b.textContent.trim()));
      if (b) { b.click(); return true; }
      return false;
    });
    console.log("  Apply clicked:", applyBtn);
    await page.waitForTimeout(4000); // wait for Bask to validate
  }

  await page.screenshot({ path: SS("2-after-apply"), fullPage: false });
  console.log("[2] After apply screenshot:", SS("2-after-apply"));

  const afterApply = await page.evaluate(() => {
    const header = document.getElementById("tzmd-modal-header");
    const inner  = document.getElementById("tzmd-modal-inner");
    const removeBtn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Remove');
    return {
      headerInDom: !!header,
      headerTag: header?.tagName,
      headerContent: header?.textContent.trim().slice(0, 60),
      innerInDom: !!inner,
      removeFound: !!removeBtn,
    };
  });
  console.log("\n[2] State after Apply:");
  console.log("  header in DOM:", afterApply.headerInDom, "tag:", afterApply.headerTag, "content:", afterApply.headerContent);
  console.log("  inner  in DOM:", afterApply.innerInDom);
  console.log("  Remove button:", afterApply.removeFound);

  if (!afterApply.removeFound) {
    console.log("\n  !! No Remove button — discount code may be invalid or needs different code");
    console.log("  Checking for any applied discount UI...");
    const discState = await page.evaluate(() => {
      return document.body.innerText.slice(0, 500);
    });
    console.log("  Page text snippet:", discState);
  }

  // ── Click Remove (opens confirmation dialog) ─────────────────────────────────
  console.log("\n[3] Clicking Remove to open confirmation...");
  const removedStep1 = await page.evaluate(() => {
    // Find the "Remove" text link (not a submit button — it's the inline "× Remove" link)
    const b = [...document.querySelectorAll('button, a, span')]
      .find(b => b.textContent.trim() === 'Remove' && !b.closest('[role="dialog"]'));
    if (!b) return false;
    b.click();
    return true;
  });
  console.log("  Step 1 (discount Remove link) clicked:", removedStep1);
  await page.waitForTimeout(1000);

  await page.screenshot({ path: SS("3a-confirm-dialog"), fullPage: false });
  console.log("[3a] Confirmation dialog screenshot:", SS("3a-confirm-dialog"));

  // ── Click the RED "Remove" button in the confirmation dialog ─────────────────
  console.log("\n[3b] Clicking the RED Remove in confirmation dialog...");
  const removedStep2 = await page.evaluate(() => {
    // The confirmation dialog has a red button with text "Remove"
    // It may be inside a [role="dialog"] or a modal overlay from Bask
    const buttons = [...document.querySelectorAll('button')];
    // Find the confirm Remove — it's typically the LAST "Remove" button, inside the dialog
    const confirmBtn = buttons.reverse().find(b => b.textContent.trim() === 'Remove');
    if (!confirmBtn) return "not found";
    confirmBtn.click();
    return "clicked: " + confirmBtn.className.slice(0, 60);
  });
  console.log("  Step 2 (confirm Remove) result:", removedStep2);

  // Wait for React reconciliation after actual discount removal
  await page.waitForTimeout(3000);
  await page.screenshot({ path: SS("3-after-remove"), fullPage: false });
  console.log("[3] After remove screenshot:", SS("3-after-remove"));

  // ── Detailed post-remove diagnosis ───────────────────────────────────────────
  const diag = await page.evaluate(() => {
    const header = document.getElementById("tzmd-modal-header");
    const inner  = document.getElementById("tzmd-modal-inner");
    const overlay = document.getElementById("tzmd-modal-overlay");

    // Find what element has #tzmd-modal-header (if any)
    const headerInPayBtn = header?.closest?.(".tzmd-pay-sheet") ?? null;

    // Find paySection by looking for what has tzmd-pay-sheet
    const paySheet = document.querySelector(".tzmd-pay-sheet");

    const payChildren = paySheet ? [...paySheet.children].map(c => ({
      tag: c.tagName,
      id: c.id || "(none)",
      cls: [...c.classList].join(" ").slice(0, 60),
      text: c.textContent.trim().slice(0, 40),
    })) : [];

    return {
      overlayOpen: overlay?.classList.contains("tzmd-open"),
      paySheetExists: !!paySheet,
      paySheetTag: paySheet?.tagName,
      headerInDom: !!header,
      headerTag: header?.tagName,
      headerParent: header?.parentElement?.id || header?.parentElement?.tagName || "(none)",
      headerContent: header?.innerHTML?.slice(0, 80) || "(null)",
      innerInDom: !!inner,
      innerTag: inner?.tagName,
      innerParent: inner?.parentElement?.id || inner?.parentElement?.tagName || "(none)",
      payChildren,
      modalCleanupExists: !!window.__TZMD__?._modalCleanup,
    };
  });

  console.log("\n[3] POST-REMOVE DIAGNOSIS:");
  console.log("  overlay open:", diag.overlayOpen);
  console.log("  paySheet exists:", diag.paySheetExists, "tag:", diag.paySheetTag);
  console.log("  #tzmd-modal-header:");
  console.log("    in DOM:", diag.headerInDom);
  console.log("    tagName:", diag.headerTag);
  console.log("    parent:", diag.headerParent);
  console.log("    content:", diag.headerContent);
  console.log("  #tzmd-modal-inner:");
  console.log("    in DOM:", diag.innerInDom);
  console.log("    tagName:", diag.innerTag);
  console.log("    parent:", diag.innerParent);
  console.log("  _modalCleanup exists:", diag.modalCleanupExists);
  console.log("\n  paySheet direct children:", diag.payChildren.length);
  diag.payChildren.forEach((c, i) => {
    console.log(`    [${i}] <${c.tag}> id="${c.id}" cls="${c.cls}" text="${c.text}"`);
  });

  console.log("\n  Browser staying open — inspect DevTools for more detail.");
  console.log("  Check: is #tzmd-modal-header present but with wrong content?");
  console.log("  Check: is it a child of paySection or somewhere else?\n");

  await new Promise(() => {}); // keep open
})();
