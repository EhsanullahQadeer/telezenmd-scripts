/**
 * Diagnostic test for discount toggle open/close behavior.
 * Run: node playwright/test-discount.js
 */
const { chromium } = require("@playwright/test");
const path = require("path");
const fs   = require("fs");

const USER_DATA_DIR = path.join(__dirname, "auth", "user-data");
const SNAPSHOT_FILE = path.join(__dirname, "auth", "checkout-snapshot.json");
const SS = (name) => path.join(__dirname, "auth", `discount-${name}.png`);

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

  // Capture console logs from the page
  page.on("console", msg => {
    const txt = msg.text();
    if (txt.includes("[CO") || txt.includes("discount") || txt.includes("Apply")) {
      console.log(`  [PAGE] ${txt}`);
    }
  });

  await page.goto(snap.url);
  console.log("\n⏳ Waiting for plan UI...");
  await page.waitForSelector(".prog-plans", { timeout: 20_000 });
  await page.waitForTimeout(3000);

  // ── Open modal ────────────────────────────────────────────────────────────
  const payBtn = await page.$("#tzmd-pay-btn");
  if (!payBtn) { console.error("❌ #tzmd-pay-btn not found"); await new Promise(() => {}); }

  console.log("\n🖱️  Opening modal...");
  await payBtn.click();
  await page.waitForTimeout(800);

  await page.screenshot({ path: SS("1-modal-open"), fullPage: true });
  console.log(`📸 Modal open: ${SS("1-modal-open")}`);

  // ── Inspect discount toggle state ─────────────────────────────────────────
  const state1 = await page.evaluate(() => {
    const toggle = document.querySelector(".tzmd-discount-toggle");
    const paySection = document.querySelector("#tzmd-modal-inner > *:last-child");

    // Find target element (the one with data-tzmd-discount="1")
    const discountTarget = document.querySelector("[data-tzmd-discount='1']");

    // Find the Apply button inside paySection
    const applyBtn = [...document.querySelectorAll("button[type='button']")]
      .find(b => b.textContent.trim() === "Apply");

    return {
      toggleFound:       !!toggle,
      toggleClass:       toggle?.className ?? "(none)",
      toggleHTML:        toggle?.outerHTML?.slice(0, 200) ?? "(missing)",
      discountTargetFound: !!discountTarget,
      discountTargetDisplay: discountTarget ? window.getComputedStyle(discountTarget).display : "(no target)",
      discountTargetInlineDisplay: discountTarget?.style.display ?? "(no target)",
      applyBtnFound:     !!applyBtn,
      applyBtnParent:    applyBtn?.parentElement?.tagName + " display=" + (applyBtn?.parentElement?.style.display ?? "") + " computed=" + (applyBtn?.parentElement ? window.getComputedStyle(applyBtn.parentElement).display : ""),
    };
  });

  console.log("\n📋 Initial state (modal just opened):");
  console.log("  toggle found:          ", state1.toggleFound);
  console.log("  toggle class:          ", state1.toggleClass);
  console.log("  discountTarget found:  ", state1.discountTargetFound);
  console.log("  discountTarget inline display:", state1.discountTargetInlineDisplay);
  console.log("  discountTarget computed display:", state1.discountTargetDisplay);
  console.log("  Apply btn found:       ", state1.applyBtnFound);
  console.log("  Apply btn parent:      ", state1.applyBtnParent);

  // ── Click toggle to OPEN discount ─────────────────────────────────────────
  const toggle = await page.$(".tzmd-discount-toggle");
  if (!toggle) { console.error("❌ .tzmd-discount-toggle not found in DOM"); await new Promise(() => {}); }

  console.log("\n🖱️  Clicking toggle to OPEN discount...");
  await toggle.click();
  await page.waitForTimeout(400);

  await page.screenshot({ path: SS("2-discount-open"), fullPage: true });
  console.log(`📸 After toggle click: ${SS("2-discount-open")}`);

  await page.waitForTimeout(800); // extra wait for 400ms CSS transition to fully complete
  const state2 = await page.evaluate(() => {
    const toggle = document.querySelector(".tzmd-discount-toggle");
    const discountTarget = document.querySelector("[data-tzmd-discount='1']");
    const applyBtn = [...document.querySelectorAll("button[type='button']")]
      .find(b => b.textContent.trim() === "Apply");
    const rect = applyBtn?.getBoundingClientRect();
    return {
      toggleClass:                   toggle?.className ?? "(none)",
      discountTargetInlineDisplay:   discountTarget?.style.display ?? "(no target)",
      discountTargetComputedDisplay: discountTarget ? window.getComputedStyle(discountTarget).display : "(no target)",
      discountTargetInlineGridRows:  discountTarget?.style.gridTemplateRows ?? "(no target)",
      discountTargetComputedGridRows: discountTarget ? window.getComputedStyle(discountTarget).gridTemplateRows : "(no target)",
      applyBtnComputedDisplay:       applyBtn ? window.getComputedStyle(applyBtn).display : "(no btn)",
      applyBtnHeight:                rect ? Math.round(rect.height) : "(no btn)",
      applyBtnTop:                   rect ? Math.round(rect.top) : "(no btn)",
    };
  });

  console.log("\n📋 After OPEN click:");
  console.log("  toggle class:          ", state2.toggleClass);
  console.log("  discountTarget inline display:", state2.discountTargetInlineDisplay);
  console.log("  discountTarget computed display:", state2.discountTargetComputedDisplay);
  console.log("  Apply btn visible:     ", state2.applyBtnVisible);

  const openWorked = state2.discountTargetComputedDisplay !== "none" && state2.discountTargetComputedDisplay !== "";
  console.log(openWorked ? "  ✅ Discount section IS visible" : "  ❌ Discount section is STILL HIDDEN");

  // ── Click toggle to CLOSE discount ────────────────────────────────────────
  console.log("\n🖱️  Clicking toggle to CLOSE discount...");
  await toggle.click();
  await page.waitForTimeout(400);

  await page.screenshot({ path: SS("3-discount-closed"), fullPage: true });
  console.log(`📸 After close click: ${SS("3-discount-closed")}`);

  const state3 = await page.evaluate(() => {
    const toggle = document.querySelector(".tzmd-discount-toggle");
    const discountTarget = document.querySelector("[data-tzmd-discount='1']");
    return {
      toggleClass:       toggle?.className ?? "(none)",
      discountTargetInlineDisplay: discountTarget?.style.display ?? "(no target)",
      discountTargetComputedDisplay: discountTarget ? window.getComputedStyle(discountTarget).display : "(no target)",
    };
  });

  console.log("\n📋 After CLOSE click:");
  console.log("  toggle class:          ", state3.toggleClass);
  console.log("  discountTarget inline display:", state3.discountTargetInlineDisplay);
  console.log("  discountTarget computed display:", state3.discountTargetComputedDisplay);

  const closeWorked = state3.discountTargetComputedDisplay === "none";
  console.log(closeWorked ? "  ✅ Discount section IS hidden" : "  ❌ Discount section is STILL VISIBLE");

  // ── Deep DOM inspection of paySection ─────────────────────────────────────
  console.log("\n🔬 Deep inspection — discount area inside paySection:");
  const deepInspect = await page.evaluate(() => {
    const paySection = document.querySelector("#tzmd-modal-inner > *:last-child");
    if (!paySection) return "paySection not found";

    // Walk paySection children and log those related to discount
    const results = [];
    const all = paySection.querySelectorAll("*");
    for (const el of all) {
      const txt = el.textContent?.trim().slice(0, 60) ?? "";
      if (txt.includes("Apply") || txt.includes("discount") || txt.includes("code") || el.dataset.tzmdDiscount) {
        const tag = el.tagName;
        const inlineDisplay = el.style.display;
        const computedDisplay = window.getComputedStyle(el).display;
        const cls = Array.from(el.classList).join(" ").slice(0, 80);
        const data = el.dataset.tzmdDiscount ? ` [data-tzmd-discount="${el.dataset.tzmdDiscount}"]` : "";
        results.push(`  <${tag}>${data} cls="${cls}" inline="${inlineDisplay}" computed="${computedDisplay}" text="${txt}"`);
      }
    }
    return results.join("\n") || "  (nothing found matching Apply/discount/code)";
  });
  console.log(deepInspect);

  // ── Check if toggle is wired to the right element ─────────────────────────
  console.log("\n🔬 Checking toggle event listener target:");
  const toggleTarget = await page.evaluate(() => {
    // Re-run the logic from setupDiscountToggle to see what it would find
    const paySection = document.querySelector("#tzmd-modal-inner > *:last-child");
    if (!paySection) return "paySection not found";

    const applyBtn = [...paySection.querySelectorAll('button[type="button"]')]
      .find(b => b.textContent.trim() === 'Apply');
    if (!applyBtn) return "Apply button NOT FOUND inside paySection";

    let target = applyBtn.parentElement;
    const up = target?.parentElement;
    if (up && up !== paySection
        && !up.contains(document.getElementById('payment-element'))
        && !up.querySelector('button[type="submit"]')) {
      target = up;
    }

    return {
      applyBtnFound: true,
      applyBtnParentTag: applyBtn.parentElement?.tagName,
      applyBtnParentCls: Array.from(applyBtn.parentElement?.classList ?? []).join(" ").slice(0, 100),
      targetTag: target?.tagName,
      targetCls: Array.from(target?.classList ?? []).join(" ").slice(0, 100),
      targetHasDataAttr: !!target?.dataset.tzmdDiscount,
      targetDisplay: target?.style.display,
      targetComputedDisplay: target ? window.getComputedStyle(target).display : "n/a",
    };
  });
  console.log(typeof toggleTarget === "string" ? toggleTarget : JSON.stringify(toggleTarget, null, 2));

  console.log("\n   Browser staying open. Press Ctrl+C to close.\n");
  await new Promise(() => {});
})();
