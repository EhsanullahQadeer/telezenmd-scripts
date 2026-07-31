/**
 * Step 1: Inspect current checkout structure before any modal implementation.
 * Run: node playwright/inspect-checkout.js
 *
 * Reports:
 *  - Full page structure (sections, selectors)
 *  - Which elements are in iframes (Stripe)
 *  - How/when Stripe Payment Element initializes
 *  - Stable selectors for plan, payment, submit sections
 *  - Whether payment section can be moved safely
 */
const { chromium } = require("@playwright/test");
const path = require("path");
const fs   = require("fs");

const USER_DATA_DIR = path.join(__dirname, "auth", "user-data");
const SNAPSHOT_FILE = path.join(__dirname, "auth", "checkout-snapshot.json");
const OUT_FILE      = path.join(__dirname, "auth", "inspect-report.txt");
const SCREENSHOT    = path.join(__dirname, "auth", "inspect-screenshot.png");

function log(lines, msg) { lines.push(msg); console.log(msg); }

(async () => {
  const snap = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, "utf8"));
  const lines = [];

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

  // Track Stripe iframe appearances
  const stripeIframes = [];
  page.on("frameattached", frame => {
    const url = frame.url();
    if (url.includes("stripe") || url.includes("js.stripe.com")) {
      stripeIframes.push({ url, time: Date.now() });
    }
  });

  log(lines, "\n⏳ Navigating to checkout...");
  await page.goto(snap.url);

  log(lines, "⏳ Waiting for plan UI (.prog-plans)...");
  try {
    await page.waitForSelector(".prog-plans", { timeout: 20_000 });
  } catch {
    log(lines, "❌ .prog-plans never appeared");
    await page.screenshot({ path: SCREENSHOT, fullPage: true });
    await new Promise(() => {});
  }

  log(lines, "⏳ Waiting for Stripe payment element (up to 20s)...");
  try {
    await page.waitForSelector(".__PrivateStripeElement, [data-testid='card-form'], iframe[name^='__privateStripeFrame']", { timeout: 20_000 });
  } catch {
    log(lines, "⚠️  Stripe element selector not found within 20s — may be in iframe or different selector");
  }

  await page.waitForTimeout(3000);

  // ── 1. BASK PATIENT DATA ──────────────────────────────────────────────────
  log(lines, "\n" + "═".repeat(60));
  log(lines, "1. BASK PATIENT DATA");
  log(lines, "═".repeat(60));
  const patientData = await page.evaluate(() => {
    const d = window.baskPatientData;
    if (!d) return "❌ window.baskPatientData not found";
    return JSON.stringify({ firstName: d.firstName, lastName: d.lastName, email: d.email }, null, 2);
  });
  log(lines, patientData);

  // ── 2. TOP-LEVEL DOM STRUCTURE ────────────────────────────────────────────
  log(lines, "\n" + "═".repeat(60));
  log(lines, "2. TOP-LEVEL CHECKOUT SECTIONS");
  log(lines, "═".repeat(60));
  const structure = await page.evaluate(() => {
    const results = [];
    const selectors = [
      // Bask / page structure
      "form", "main", "[class*='checkout']", "[class*='Checkout']",
      "[class*='payment']", "[class*='Payment']",
      "[class*='subscription']", "[class*='submit']",
      // Our custom UI
      ".prog-plans", ".prog-plan-card",
      // Bask plan cards
      "ul > li[class*='border']", "ul > li[class*='plan']",
      // Totals
      "[class*='total']", "[class*='Total']",
      // Discount
      "[class*='discount']", "[class*='Discount']", "[class*='coupon']",
      // Payment heading
      "h2", "h3",
      // Stripe
      ".__PrivateStripeElement", "[class*='StripeElement']",
      "iframe[name^='__privateStripeFrame']", "iframe[src*='stripe']",
      // Submit button
      "button[type='submit']", "button[class*='submit']",
      "[class*='submit'] button",
    ];
    const seen = new Set();
    selectors.forEach(sel => {
      try {
        const els = document.querySelectorAll(sel);
        els.forEach(el => {
          if (seen.has(el)) return;
          seen.add(el);
          const tag = el.tagName.toLowerCase();
          const id = el.id ? `#${el.id}` : "";
          const cls = Array.from(el.classList).slice(0, 4).join(" ");
          const text = el.textContent?.trim().slice(0, 80).replace(/\n/g, " ") ?? "";
          const isIframe = tag === "iframe";
          const iframeSrc = isIframe ? (el.name || el.src || "").slice(0, 60) : "";
          results.push(`  [${sel}] <${tag}${id}> .${cls}\n      text: "${text}"${isIframe ? `\n      iframe: ${iframeSrc}` : ""}`);
        });
      } catch(_) {}
    });
    return results.join("\n");
  });
  log(lines, structure || "  (none found)");

  // ── 3. PAYMENT SECTION DEEP DIVE ─────────────────────────────────────────
  log(lines, "\n" + "═".repeat(60));
  log(lines, "3. PAYMENT SECTION — STRUCTURE & SELECTORS");
  log(lines, "═".repeat(60));
  const paymentSection = await page.evaluate(() => {
    // Try to find the payment container
    const candidates = [
      document.querySelector("form"),
      document.querySelector("[class*='payment']"),
      document.querySelector("[class*='Payment']"),
    ].filter(Boolean);

    return candidates.map(el => {
      const tag = el.tagName.toLowerCase();
      const id = el.id ? `#${el.id}` : "";
      const cls = Array.from(el.classList).join(" ");
      const children = Array.from(el.children).map(c => {
        const ct = c.tagName.toLowerCase();
        const cc = Array.from(c.classList).join(" ");
        const txt = c.textContent?.trim().slice(0, 60).replace(/\n/g, " ") ?? "";
        return `    <${ct}> .${cc} — "${txt}"`;
      }).join("\n");
      return `<${tag}${id}> .${cls}\nChildren:\n${children}`;
    }).join("\n\n---\n\n");
  });
  log(lines, paymentSection || "  (no payment section found)");

  // ── 4. ALL IFRAMES ────────────────────────────────────────────────────────
  log(lines, "\n" + "═".repeat(60));
  log(lines, "4. ALL IFRAMES IN PAGE");
  log(lines, "═".repeat(60));
  const iframes = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("iframe")).map(f => ({
      name: f.name,
      src:  f.src?.slice(0, 100),
      cls:  Array.from(f.classList).join(" "),
      id:   f.id,
      allow: f.allow,
      parentTag: f.parentElement?.tagName,
      parentCls: Array.from(f.parentElement?.classList ?? []).join(" "),
    }));
  });
  if (iframes.length === 0) {
    log(lines, "  No iframes found in main frame");
  } else {
    iframes.forEach((f, i) => {
      log(lines, `  [${i}] name="${f.name}" id="${f.id}"`);
      log(lines, `       src:    ${f.src || "(none)"}`);
      log(lines, `       class:  ${f.cls || "(none)"}`);
      log(lines, `       allow:  ${f.allow || "(none)"}`);
      log(lines, `       parent: <${f.parentTag}> .${f.parentCls}`);
    });
  }

  // ── 5. STRIPE IFRAME TIMELINE ─────────────────────────────────────────────
  log(lines, "\n" + "═".repeat(60));
  log(lines, "5. STRIPE IFRAME ATTACHMENT TIMELINE");
  log(lines, "═".repeat(60));
  if (stripeIframes.length === 0) {
    log(lines, "  No Stripe iframes detected via frameattached event");
  } else {
    stripeIframes.forEach((f, i) => log(lines, `  [${i}] ${f.url}`));
  }

  // Also check all frames
  const allFrames = page.frames();
  log(lines, `\n  Total frames attached: ${allFrames.length}`);
  allFrames.forEach((f, i) => {
    log(lines, `  [${i}] ${f.url().slice(0, 100) || "(blank)"}`);
  });

  // ── 6. SUBMIT BUTTON ─────────────────────────────────────────────────────
  log(lines, "\n" + "═".repeat(60));
  log(lines, "6. SUBMIT BUTTON");
  log(lines, "═".repeat(60));
  const submitBtn = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    return btns.map(b => {
      const cls = Array.from(b.classList).join(" ");
      const txt = b.textContent?.trim().replace(/\n/g, " ") ?? "";
      const type = b.type;
      const parent = b.parentElement?.tagName + "." + Array.from(b.parentElement?.classList ?? []).join(".");
      return `  <button type="${type}"> .${cls}\n    text: "${txt}"\n    parent: ${parent}`;
    }).join("\n");
  });
  log(lines, submitBtn || "  (none found)");

  // ── 7. DISCOUNT SECTION ───────────────────────────────────────────────────
  log(lines, "\n" + "═".repeat(60));
  log(lines, "7. DISCOUNT / COUPON SECTION");
  log(lines, "═".repeat(60));
  const discountSection = await page.evaluate(() => {
    const el = document.querySelector("[class*='discount'], [class*='Discount'], [class*='coupon'], input[placeholder*='ode']");
    if (!el) return "  Not found";
    const parent = el.closest("[class]");
    return `  el: <${el.tagName}> .${Array.from(el.classList).join(" ")}\n  parent: <${parent?.tagName}> .${Array.from(parent?.classList ?? []).join(" ")}`;
  });
  log(lines, discountSection);

  // ── 8. TOTAL LINE ─────────────────────────────────────────────────────────
  log(lines, "\n" + "═".repeat(60));
  log(lines, "8. TOTAL LINE");
  log(lines, "═".repeat(60));
  const totalLine = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll("*"));
    const matches = all.filter(el => el.children.length === 0 && /total/i.test(el.textContent ?? ""));
    return matches.slice(0, 5).map(el => {
      const cls = Array.from(el.classList).join(" ");
      return `  <${el.tagName}> .${cls} — "${el.textContent?.trim().slice(0, 80)}"`;
    }).join("\n");
  });
  log(lines, totalLine || "  Not found");

  // ── 9. SUBSCRIPTION / SECURITY TEXT ──────────────────────────────────────
  log(lines, "\n" + "═".repeat(60));
  log(lines, "9. SUBSCRIPTION / SECURITY TEXT (below button)");
  log(lines, "═".repeat(60));
  const subText = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll("p, small, span, div"));
    return all.filter(el => {
      const txt = el.textContent ?? "";
      return /subscription|renew|secure|SSL|charge|approved/i.test(txt) && el.children.length < 3;
    }).slice(0, 6).map(el => {
      const cls = Array.from(el.classList).join(" ");
      const txt = el.textContent?.trim().slice(0, 100).replace(/\n/g, " ") ?? "";
      return `  <${el.tagName}> .${cls}\n    "${txt}"`;
    }).join("\n");
  });
  log(lines, subText || "  Not found");

  // ── 10. CAN WE MOVE THE PAYMENT SECTION? ─────────────────────────────────
  log(lines, "\n" + "═".repeat(60));
  log(lines, "10. MOVABILITY ASSESSMENT");
  log(lines, "═".repeat(60));
  const movability = await page.evaluate(() => {
    const form = document.querySelector("form");
    const stripeEl = document.querySelector(".__PrivateStripeElement, [class*='StripeElement'], iframe[name^='__privateStripeFrame']");
    const results = [];
    results.push(`  form present: ${!!form}`);
    results.push(`  form id: ${form?.id || "(none)"}`);
    results.push(`  form class: ${Array.from(form?.classList ?? []).join(" ") || "(none)"}`);
    results.push(`  Stripe element in DOM: ${!!stripeEl}`);
    results.push(`  Stripe el tag: ${stripeEl?.tagName || "N/A"}`);
    results.push(`  Stripe el class: ${Array.from(stripeEl?.classList ?? []).join(" ") || "N/A"}`);
    results.push(`  Stripe el parent: <${stripeEl?.parentElement?.tagName}> .${Array.from(stripeEl?.parentElement?.classList ?? []).join(" ")}`);

    // Check if Stripe is attached via window
    const hasStripe = typeof window.Stripe !== "undefined";
    results.push(`  window.Stripe defined: ${hasStripe}`);

    // Check for any Stripe instance on window
    const stripeKeys = Object.keys(window).filter(k => k.toLowerCase().includes("stripe"));
    results.push(`  Stripe-related window keys: ${stripeKeys.join(", ") || "(none)"}`);

    return results.join("\n");
  });
  log(lines, movability);

  // ── SCREENSHOT ────────────────────────────────────────────────────────────
  await page.screenshot({ path: SCREENSHOT, fullPage: true });
  log(lines, `\n📸 Screenshot: ${SCREENSHOT}`);

  // ── SAVE REPORT ───────────────────────────────────────────────────────────
  fs.writeFileSync(OUT_FILE, lines.join("\n"), "utf8");
  log(lines, `📄 Full report saved: ${OUT_FILE}`);
  log(lines, "\n   Browser staying open. Press Ctrl+C to close.\n");

  await new Promise(() => {});
})();
