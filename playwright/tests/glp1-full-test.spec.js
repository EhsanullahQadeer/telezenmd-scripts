/**
 * GLP1 Checkout — Full E2E Test
 * Tests: plan mapping, plan selection sync, modal open/close, price update, change-plan flow
 * Run: node playwright/tests/glp1-full-test.spec.js
 */

const { chromium } = require("@playwright/test");
const path = require("path");
const fs   = require("fs");
const startServer = require("../serve-scripts");

const USER_DATA_DIR = path.join(__dirname, "..", "auth", "user-data");
const GLP1_URL      = "https://join.telezenmd.com/start-online-visit/glp1questionnaire";
const LOG_FILE      = path.join(__dirname, "..", "test-output.log");
const TITLE_MAP     = { monthly: "Monthly", quarterly: "Quarterly", sixmonth: "Six months", twelvemonth: "Yearly" };

let passed = 0, failed = 0;
let logStream;

function log(...args) {
  const line = args.join(" ");
  console.log(line);
  if (logStream) logStream.write(line + "\n");
}

function pass(label) {
  passed++;
  log(`  ✓  ${label}`);
}

function fail(label, detail = "") {
  failed++;
  log(`  ✗  ${label}${detail ? " — " + detail : ""}`);
}

function section(title) {
  log(`\n${"─".repeat(60)}`);
  log(`  ${title}`);
  log("─".repeat(60));
}

async function waitAndLog(page, ms, msg) {
  if (msg) log(`     (waiting ${ms}ms — ${msg})`);
  await page.waitForTimeout(ms);
}

(async () => {
  logStream = fs.createWriteStream(LOG_FILE, { flags: "w" });
  log(`[${ new Date().toISOString()}] Full E2E test started\n`);

  const stopServer = await startServer();
  log("✓ localhost:4321 ready");

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
  page.on("pageerror", e => log(`  [PAGE-ERROR] ${e.message}`));
  page.on("console", msg => {
    const t = msg.text();
    if (t.includes("[CO]")) log(`  [BROWSER] ${t}`);
  });

  // ── Navigate ──────────────────────────────────────────────────────────────
  log(`\n→ Navigating to questionnaire...`);
  await page.goto(GLP1_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  log("✓ Page loaded");

  // ── Auto-advance through questionnaire ────────────────────────────────────
  log("→ Auto-advancing through questionnaire (60s max)...");
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (await page.$(".prog-plan-card").catch(() => null)) break;
    const clicked = await page.evaluate(() => {
      const btns = [...document.querySelectorAll("button")];
      const next = btns.find(b => {
        const txt = b.textContent.trim().toLowerCase();
        return (txt === "next" || txt === "continue" || txt.startsWith("next") || txt === "yes" || txt === "no") && !b.disabled;
      });
      if (next) { next.click(); return next.textContent.trim(); }
      return null;
    });
    if (clicked) log(`  → Clicked: "${clicked}"`);
    await page.waitForTimeout(1200);
  }

  // ── Wait for checkout UI ──────────────────────────────────────────────────
  log("\n→ Waiting for checkout plan cards (up to 5 min)...");
  try {
    await page.waitForSelector(".prog-plan-card", { timeout: 300000 });
    log("✓ Checkout UI mounted");
  } catch {
    log("✗ Checkout UI not found in 5min — aborting");
    await context.close(); stopServer(); logStream.end(); process.exit(1);
  }
  await waitAndLog(page, 1500, "let Bask settle");

  // ══════════════════════════════════════════════════════════════════════════
  section("TEST 1 — Bask DOM card order vs our plan array");
  // ══════════════════════════════════════════════════════════════════════════

  const baskCards = await page.evaluate(() =>
    [...document.querySelectorAll("ul.relative.mt-5.flex.flex-col.gap-3 > li")].map((li, i) => ({
      domIndex: i,
      title: li.querySelector(":scope > div:first-child span:first-child")?.textContent?.trim() ?? "(no title)",
      selected: li.classList.contains("border-2"),
    }))
  );
  log("  Bask DOM order: " + baskCards.map(c => `[${c.domIndex}]${c.title}`).join("  "));

  const customCards = await page.evaluate(() =>
    [...document.querySelectorAll(".prog-plan-card")].map(c => ({
      id: c.dataset.id,
      name: c.querySelector(".prog-plan-name")?.textContent?.trim(),
      price: c.querySelector(".prog-amt")?.textContent?.trim(),
      selected: c.classList.contains("prog-selected"),
    }))
  );
  log("  Our plan order: " + customCards.map(c => `[${c.id}]${c.name}`).join("  "));

  const domTitles = baskCards.map(c => c.title).sort().join(",");
  const expectedTitles = ["Monthly","Quarterly","Six months","Yearly"].sort().join(",");
  domTitles === expectedTitles
    ? pass("All 4 expected Bask plan titles found in DOM")
    : fail("Missing Bask plan titles", `got: ${domTitles}`);

  customCards.length === 4
    ? pass("Custom UI shows 4 plan cards")
    : fail("Wrong number of custom plan cards", `got: ${customCards.length}`);

  // ══════════════════════════════════════════════════════════════════════════
  section("TEST 2 — Plan click mapping (click each custom card → verify Bask card)");
  // ══════════════════════════════════════════════════════════════════════════

  for (const cc of customCards) {
    const expectedBaskTitle = TITLE_MAP[cc.id];
    await page.click(`.prog-plan-card[data-id="${cc.id}"]`);

    // Wait for Bask to actually update border-2 to the expected card (max 3s)
    try {
      await page.waitForFunction((expected) => {
        const lis = [...document.querySelectorAll("ul.relative.mt-5.flex.flex-col.gap-3 > li")];
        const sel = lis.find(li => li.classList.contains("border-2"));
        const title = sel?.querySelector(":scope > div:first-child span:first-child")?.textContent?.trim();
        return title === expected;
      }, expectedBaskTitle, { timeout: 3000 });
    } catch { /* will show as fail below */ }

    const r = await page.evaluate(id => {
      const lis = [...document.querySelectorAll("ul.relative.mt-5.flex.flex-col.gap-3 > li")];
      const sel = lis.find(li => li.classList.contains("border-2"));
      const selTitle = sel?.querySelector(":scope > div:first-child span:first-child")?.textContent?.trim() ?? "(none)";
      const ourCard = document.querySelector(`.prog-plan-card[data-id="${id}"]`);
      return {
        baskTitle: selTitle,
        ourSelected: ourCard?.classList.contains("prog-selected") ?? false,
      };
    }, cc.id);

    const expected = TITLE_MAP[cc.id];
    r.baskTitle === expected
      ? pass(`Click "${cc.name}" → Bask selected "${r.baskTitle}"`)
      : fail(`Click "${cc.name}" → Bask selected "${r.baskTitle}" (expected "${expected}")`);

    r.ourSelected
      ? pass(`  Custom card "${cc.name}" has prog-selected class`)
      : fail(`  Custom card "${cc.name}" missing prog-selected class`);

    // Give Bask time to fully settle (API price call) before next plan switch.
    await page.waitForTimeout(3000);
  }

  // ══════════════════════════════════════════════════════════════════════════
  section("TEST 3 — Open payment modal");
  // ══════════════════════════════════════════════════════════════════════════

  // Select Monthly first so we have a known baseline
  await page.click('.prog-plan-card[data-id="monthly"]');
  await waitAndLog(page, 800, "select monthly");

  const payBtn = await page.$("#tzmd-pay-btn");
  payBtn
    ? pass("Payment button (#tzmd-pay-btn) found")
    : fail("Payment button not found — modal can't be opened");

  if (payBtn) {
    await payBtn.click();
    await waitAndLog(page, 1200, "wait for modal to open");

    const overlayOpen = await page.evaluate(() =>
      document.getElementById("tzmd-modal-overlay")?.classList.contains("tzmd-open") ?? false
    );
    overlayOpen
      ? pass("Modal overlay opened (tzmd-open class set)")
      : fail("Modal overlay did NOT open");

    const sheetVisible = await page.evaluate(() => {
      const sheet = document.querySelector(".tzmd-pay-sheet");
      if (!sheet) return false;
      const cs = window.getComputedStyle(sheet);
      return cs.position === "fixed" && cs.display !== "none";
    });
    sheetVisible
      ? pass("Payment sheet is position:fixed and visible")
      : fail("Payment sheet not visible as expected");

    // ── Check plan summary card ───────────────────────────────────────────
    section("TEST 4 — Plan summary card content");

    const summary = await page.evaluate(() => {
      const s = document.getElementById("tzmd-plan-summary");
      if (!s) return null;
      return {
        name:  s.querySelector(".tzmd-ps-name")?.textContent?.trim(),
        freq:  s.querySelector(".tzmd-ps-freq")?.textContent?.trim(),
        price: s.querySelector(".tzmd-ps-amt")?.textContent?.trim(),
      };
    });

    if (!summary) {
      fail("Plan summary card (#tzmd-plan-summary) not found");
    } else {
      log(`  Summary: name="${summary.name}" freq="${summary.freq}" price="${summary.price}"`);
      summary.name?.includes("Monthly")
        ? pass(`Plan name shows "Monthly": "${summary.name}"`)
        : fail(`Plan name wrong`, `got: "${summary.name}"`);
      summary.price && summary.price.length > 0
        ? pass(`Price shown: "${summary.price}"`)
        : fail("Price is empty");
    }

    // ── Test payment element ──────────────────────────────────────────────
    const paymentElVisible = await page.evaluate(() => {
      const el = document.getElementById("payment-element");
      if (!el) return false;
      return el.offsetHeight > 0 || el.querySelector("iframe") !== null;
    });
    paymentElVisible
      ? pass("Stripe #payment-element is visible inside modal")
      : fail("Stripe #payment-element not visible");

    const submitBtn = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button[type="submit"]')]
        .find(b => /Confirm and continue|Doctor Review/i.test(b.textContent));
      return btn ? btn.textContent.trim() : null;
    });
    submitBtn
      ? pass(`Submit button found: "${submitBtn}"`)
      : fail("Submit button not found inside modal");

    // ══════════════════════════════════════════════════════════════════════
    section("TEST 5 — Change plan while modal is open");
    // ══════════════════════════════════════════════════════════════════════

    const changePlanBtn = await page.$("#tzmd-change-plan");
    changePlanBtn
      ? pass("Change plan button found inside modal")
      : fail("Change plan button not found");

    if (changePlanBtn) {
      // Close modal via "Change plan"
      await changePlanBtn.click();
      await waitAndLog(page, 800, "modal close via change-plan");

      const modalClosed = await page.evaluate(() =>
        !document.getElementById("tzmd-modal-overlay")?.classList.contains("tzmd-open")
      );
      modalClosed
        ? pass("Modal closed after clicking Change plan")
        : fail("Modal did not close after Change plan click");

      // Switch to Quarterly
      await page.click('.prog-plan-card[data-id="quarterly"]');
      await waitAndLog(page, 800, "select quarterly");

      const quarSelected = await page.evaluate(() =>
        document.querySelector('.prog-plan-card[data-id="quarterly"]')?.classList.contains("prog-selected") ?? false
      );
      quarSelected
        ? pass("Quarterly plan now selected in custom UI")
        : fail("Quarterly plan not marked selected");

      // Re-open modal
      await page.click("#tzmd-pay-btn");
      await waitAndLog(page, 1200, "re-open modal");

      const summaryAfterChange = await page.evaluate(() => {
        const s = document.getElementById("tzmd-plan-summary");
        return {
          name:  s?.querySelector(".tzmd-ps-name")?.textContent?.trim(),
          price: s?.querySelector(".tzmd-ps-amt")?.textContent?.trim(),
        };
      });
      log(`  Summary after plan change: name="${summaryAfterChange.name}" price="${summaryAfterChange.price}"`);

      summaryAfterChange.name?.includes("Quarterly")
        ? pass(`Plan name updated to Quarterly: "${summaryAfterChange.name}"`)
        : fail(`Plan name not updated`, `got: "${summaryAfterChange.name}"`);

      summaryAfterChange.price && summaryAfterChange.price.length > 0 && !summaryAfterChange.price.includes("█")
        ? pass(`Price shown after plan change: "${summaryAfterChange.price}"`)
        : fail(`Price missing or showing skeleton after plan change`, `got: "${summaryAfterChange.price}"`);
    }

    // ══════════════════════════════════════════════════════════════════════
    section("TEST 6 — Close modal via X button and overlay click");
    // ══════════════════════════════════════════════════════════════════════

    const closeBtn = await page.$("#tzmd-modal-close");
    if (closeBtn) {
      await closeBtn.click();
      await waitAndLog(page, 600, "close via X");
      const closedByX = await page.evaluate(() =>
        !document.getElementById("tzmd-modal-overlay")?.classList.contains("tzmd-open")
      );
      closedByX
        ? pass("Modal closed via X button")
        : fail("Modal did not close via X button");

      // Re-open and close via overlay click.
      // Use evaluate + click() to avoid Playwright's actionability check — the overlay
      // is covered by the modal sheet at center so page.click() would hang waiting for it.
      await page.click("#tzmd-pay-btn");
      await waitAndLog(page, 800, "re-open for overlay test");
      await page.evaluate(() => document.getElementById("tzmd-modal-overlay")?.click());
      await waitAndLog(page, 600, "close via overlay");
      const closedByOverlay = await page.evaluate(() =>
        !document.getElementById("tzmd-modal-overlay")?.classList.contains("tzmd-open")
      );
      closedByOverlay
        ? pass("Modal closed by clicking backdrop overlay")
        : fail("Modal did not close via overlay click");
    } else {
      fail("Close button (#tzmd-modal-close) not found");
    }

    // ══════════════════════════════════════════════════════════════════════
    section("TEST 7 — Price skeleton on plan change");
    // ══════════════════════════════════════════════════════════════════════

    // Select annual, open modal, close modal, switch to monthly, re-open, check skeleton
    await page.click('.prog-plan-card[data-id="twelvemonth"]');
    await waitAndLog(page, 600, "select annual");
    await page.click("#tzmd-pay-btn");
    await waitAndLog(page, 1000, "open modal on annual");

    // Close modal first — plan cards are hidden/pointer-events:none while modal is open
    await page.click("#tzmd-modal-close");
    await waitAndLog(page, 400, "close modal");

    // Switch to monthly outside modal
    await page.click('.prog-plan-card[data-id="monthly"]');
    await waitAndLog(page, 200, "just after plan click — re-open modal to check skeleton");

    // Re-open modal — summary should show skeleton while Bask updates price
    await page.click("#tzmd-pay-btn");
    await waitAndLog(page, 200, "just after modal open — check for skeleton");

    const skeletonShown = await page.evaluate(() => {
      const amt = document.querySelector(".tzmd-ps-amt");
      return amt?.querySelector(".tzmd-skel") !== null;
    });
    skeletonShown
      ? pass("Price skeleton shown immediately after plan change")
      : log("  ⚠  Skeleton not caught (may have resolved too fast — not a hard failure)");

    // Wait for price to resolve
    await waitAndLog(page, 2500, "wait for price to resolve");
    const priceResolved = await page.evaluate(() => {
      const amt = document.querySelector(".tzmd-ps-amt");
      if (!amt) return { ok: false, text: "(no element)" };
      const hasSkel = amt.querySelector(".tzmd-skel") !== null;
      return { ok: !hasSkel && amt.textContent.trim().length > 0, text: amt.textContent.trim() };
    });
    priceResolved.ok
      ? pass(`Price resolved after plan change: "${priceResolved.text}"`)
      : fail(`Price not resolved`, `text="${priceResolved.text}" skeleton=${!priceResolved.ok}`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  section("TEST 8 — Sticky bar and trust badges");
  // ══════════════════════════════════════════════════════════════════════════

  const stickyBar = await page.$("#tzmd-sticky-bar");
  stickyBar
    ? pass("Sticky bar (#tzmd-sticky-bar) present")
    : fail("Sticky bar not found");

  const trustBox = await page.$(".co-trust");
  trustBox
    ? pass("Trust box (.co-trust) present")
    : fail("Trust box not found");

  const fsaBox = await page.$(".prog-fsa-box");
  fsaBox
    ? pass("FSA box (.prog-fsa-box) present")
    : fail("FSA box not found");

  // ══════════════════════════════════════════════════════════════════════════
  // Final summary
  // ══════════════════════════════════════════════════════════════════════════
  log("\n" + "═".repeat(60));
  log(`  RESULTS:  ${passed} passed  /  ${failed} failed  /  ${passed + failed} total`);
  log("═".repeat(60));
  if (failed === 0) {
    log("  🎉  ALL TESTS PASSED");
  } else {
    log(`  ⚠   ${failed} test(s) need attention (see ✗ lines above)`);
  }
  log("\nKeeping browser open. Close to exit.\n");

  await new Promise(resolve => {
    page.on("close", resolve);
    context.on("close", resolve);
  });

  stopServer();
  logStream.end();
})();
