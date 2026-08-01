// ─── TZMD LIFECYCLE ENGINE ────────────────────────────────────────────────────
window.__TZMD__ ??= { activePage: null, cleanup: {} };

window.__TZMD__.createPage ??= function createPage(PAGE_ID, onDestroy) {
  const registry = window.__TZMD__;
  if (registry.activePage === PAGE_ID) {
    console.log(`[TZMD] ${PAGE_ID} already initialized — skipping`);
    return null;
  }
  const previousPage = registry.activePage;
  if (previousPage && registry.cleanup[previousPage]) {
    console.log(`[TZMD] destroying previous page: ${previousPage}`);
    registry.cleanup[previousPage]();
  }
  registry.activePage = PAGE_ID;
  let destroyed = false;
  const disposables = { observers: [], timers: [], listeners: [] };
  function addObserver(o) {
    disposables.observers.push(o);
  }
  function addTimer(t) {
    disposables.timers.push(t);
  }
  function addListener(el, ev, fn, opts) {
    el.addEventListener(ev, fn, opts);
    disposables.listeners.push({
      element: el,
      event: ev,
      handler: fn,
      options: opts,
    });
  }
  function destroy() {
    if (destroyed) return;
    destroyed = true;

    console.log(`[TZMD] ${PAGE_ID} destroy`);

    if (typeof onDestroy === "function") onDestroy();

    delete registry.cleanup[PAGE_ID];

    if (registry.activePage === PAGE_ID) {
      registry.activePage = null;
    }

    disposables.observers.forEach((o) => o.disconnect());
    disposables.timers.forEach((t) => clearTimeout(t));
    disposables.listeners.forEach(({ element, event, handler, options }) =>
      element.removeEventListener(event, handler, options),
    );

    disposables.observers = [];
    disposables.timers = [];
    disposables.listeners = [];
  }
  registry.cleanup[PAGE_ID] = destroy;
  return { addObserver, addTimer, addListener, destroy };
};

// ─── RESTORE HIDDEN SECTION ───────────────────────────────────────────────────
console.log("[CO] script start — activePage:", window.__TZMD__.activePage);

// ─── SECTION VISIBILITY ───────────────────────────────────────────────────────
let hiddenSection = null;
let sectionHideObserver = null;
let _scrollLocked = true;   // true while modal is closed; blocks QC scroll entirely

// Selectors for the specific children of <section.relative> to hide.
// The section also contains the total/discount/payment rows below — those stay visible.
const BASK_HIDE_SELECTORS = [];

function applyBaskHides(section) {
  // If Bask hides the whole section (parent), undo that — we only hide specific children
  if (section.classList.contains("hidden")) {
    section.classList.remove("hidden");
    console.log("[CO-DEBUG] stripped hidden from section.relative itself");
  }
  BASK_HIDE_SELECTORS.forEach((sel) => {
    const el = section.querySelector(sel);
    if (el && !el.classList.contains("hidden")) {
      el.classList.add("hidden");
      console.log("[CO-DEBUG] hiding selector el:", sel, el);
    }
  });
  // Hide the "Choose Your Program" parent div (observer re-applies on React re-render)
  const planUl = section.querySelector("ul.relative.mt-5.flex.flex-col.gap-3");
  if (planUl?.parentElement && planUl.parentElement !== section) {
    if (!planUl.parentElement.classList.contains("hidden")) {
      planUl.parentElement.classList.add("hidden");
      console.log("[CO-DEBUG] hiding Choose Your Program parent");
    }
  }
  // Remove intro text, $0 black card, What Happens Next wrapper, and all HRs from DOM (observer re-removes on React re-render)
  section.querySelectorAll(".mb-5.flex.flex-col.items-start.gap-3").forEach((el) => {
    if (el.textContent.includes("Most programs give you a prescription")) {
      console.log("[CO-DEBUG] removing intro text from DOM");
      el.remove();
    }
  });
  section.querySelectorAll(".mb-5.flex.w-full.flex-col.items-center.justify-start.gap-8 .flex.flex-col.items-center.justify-center.rounded-3xl").forEach((el) => {
    console.log("[CO-DEBUG] removing $0 black card from DOM");
    el.remove();
  });
  section.querySelectorAll(".mb-5.flex.w-full.flex-col.items-center.justify-start.gap-8 > div.w-full").forEach((el) => {
    if (el.querySelector(".mt-4.flex.flex-col.gap-5")) {
      console.log("[CO-DEBUG] removing What Happens Next wrapper from DOM");
      el.remove();
    }
  });
  section.querySelectorAll("hr.\\!m-0").forEach((hr) => {
    console.log("[CO-DEBUG] removing hr from DOM");
    hr.remove();
  });
  // Remove promo code nudge — scoped to section first, fallback to document
  const promoRoot = section.querySelector("span.\\!underline") ? section : document;
  promoRoot.querySelectorAll("span").forEach((el) => {
    if (el.textContent.trim() === "APPLY CODE TELE50ZEN TO SAVE") {
      console.log("[CO-DEBUG] removing promo code span from DOM");
      el.remove();
    }
  });
}

function lockQC(qc) {
  // Intercept scrollTop setter on the element instance
  let desc = null;
  let proto = Object.getPrototypeOf(qc);
  while (proto) {
    desc = Object.getOwnPropertyDescriptor(proto, 'scrollTop');
    if (desc) break;
    proto = Object.getPrototypeOf(proto);
  }
  if (desc && desc.set) {
    const origSet = desc.set;
    const origGet = desc.get;
    Object.defineProperty(qc, 'scrollTop', {
      get() { return origGet.call(this); },
      set(v) { if (!_scrollLocked) origSet.call(this, v); },
      configurable: true,
    });
  }
  // Also intercept scrollTo() in case Stripe uses that instead
  const origScrollTo = qc.scrollTo;
  if (typeof origScrollTo === 'function') {
    qc.scrollTo = function(...args) { if (!_scrollLocked) origScrollTo.apply(this, args); };
  }
}

function unlockQC() {
  const qc = document.getElementById('questionnaire-container');
  if (!qc) return;
  try { delete qc.scrollTop; } catch(e) {}
  try { delete qc.scrollTo; } catch(e) {}
}

function hideOriginalSection() {
  if (hiddenSection) return;
  const container = document.getElementById("script-container");
  const next = container?.nextElementSibling;
  if (!next) return;

  function attach(section) {
    hiddenSection = section;
    // Hide immediately so page-load content never flashes before applyBaskHides runs.
    section.style.setProperty('visibility', 'hidden', 'important');
    section.setAttribute('inert', '');

    // Prevent Bask/Stripe from auto-scrolling to elements inside the hidden section.
    // inert blocks focus-triggered scroll; this catches programmatic scrollIntoView calls.
    const _origSIV = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function(opt) {
      if (hiddenSection && hiddenSection.contains(this)) return;
      _origSIV.call(this, opt);
    };

    // Block #questionnaire-container from scrolling while the modal is closed.
    // Stripe init sets scrollTop on that container during iframe mounting — intercepting
    // the setter prevents the scroll from ever happening (no poll correction, no jerk).
    _scrollLocked = true;
    const qcNow = document.getElementById('questionnaire-container');
    if (qcNow) {
      lockQC(qcNow);
    } else {
      const qcWatcher = new MutationObserver(() => {
        const qc = document.getElementById('questionnaire-container');
        if (qc) { qcWatcher.disconnect(); lockQC(qc); }
      });
      qcWatcher.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => qcWatcher.disconnect(), 10000);
    }
    applyBaskHides(section);
    console.log("[CO] bask section children hidden ✓");

    sectionHideObserver = new MutationObserver(() => applyBaskHides(section));
    sectionHideObserver.observe(section, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class"],
    });
  }

  const section = next.querySelector("section.relative");
  if (section) {
    attach(section);
  } else {
    const waitObserver = new MutationObserver(() => {
      const s = next.querySelector("section.relative");
      if (s) {
        waitObserver.disconnect();
        sectionHideObserver = null;
        attach(s);
      }
    });
    waitObserver.observe(next, { childList: true, subtree: true });
    sectionHideObserver = waitObserver;
  }
}

function restoreOriginalSection() {
  if (sectionHideObserver) {
    sectionHideObserver.disconnect();
    sectionHideObserver = null;
  }
  if (hiddenSection) {
    console.log("[CO] removed hidden ✓");
  }
  hiddenSection = null;
}
// ─── BOOT ─────────────────────────────────────────────────────────────────────
const page = window.__TZMD__.createPage("checkout", () => unmountCheckoutUI());
if (!page) {
  console.log("[CO] already active or bailing");
  return;
}
const { addObserver, addTimer, addListener, destroy } = page;
console.log(
  "[CO] createPage success — activePage:",
  window.__TZMD__.activePage,
);

// ─── STATE ────────────────────────────────────────────────────────────────────
let isMounted = false;
let plans = [];
let plansObserver = null;


const CHECK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';
const STAR =
  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 18.4 6.1 21l1.2-6.5L2.5 9.9l6.6-.9z"/></svg>';

// ─── PURE HELPERS ─────────────────────────────────────────────────────────────
// Read the plan name from the first span in the card header row.
// Used for strict name-based mapping — never relies on DOM order.
function getCardTitle(card) {
  return card?.querySelector(":scope > div:first-child span:first-child")?.textContent?.trim() ?? "";
}

// Find a Bask card by its exact title text ("Monthly", "Quarterly", "Six months", "Yearly").
function findCardByTitle(cardArr, title) {
  return cardArr.find(c => getCardTitle(c) === title) ?? null;
}

function getPrice(card) {
  const text =
    card?.querySelector(":scope > div:first-child span:last-child")
      ?.textContent || "";
  return parseFloat(text.replace(/[^0-9.]/g, ""));
}
function formatCurrency(amount) {
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
function isSelected(card) {
  return card?.classList.contains("border-2");
}
function getBilled(price, months) {
  const total = Math.round(price * months);
  if (months === 3)
    return `Billed every 3 months ($${formatCurrency(total)} total)`;
  if (months === 6)
    return `Billed every 6 months ($${formatCurrency(total)} total)`;
  return `Billed annually ($${formatCurrency(total)} total)`;
}
function getSavings(monthlyPrice, discountedPrice) {
  const savings = Math.round((monthlyPrice - discountedPrice) * 12);
  return `Save $${formatCurrency(savings)}/year`;
}
function getPlans(cardArr) {
  // Strict name-based lookup — never relies on DOM order or array index.
  // Bask card titles confirmed via Playwright inspection: "Monthly", "Quarterly", "Six months", "Yearly"
  const monthlyCard   = findCardByTitle(cardArr, "Monthly");
  const quarterlyCard = findCardByTitle(cardArr, "Quarterly");
  const sixMonthCard  = findCardByTitle(cardArr, "Six months");
  const yearlyCard    = findCardByTitle(cardArr, "Yearly");

  const monthlyPrice = getPrice(monthlyCard);

  // Display order: Monthly → Quarterly → 6 Month → Annual
  return [
    {
      id: "monthly",     baskCard: monthlyCard,   name: "Monthly",
      price: monthlyPrice, badge: null,
      billed: "Billed monthly, cancel anytime",
      selected: isSelected(monthlyCard),
    },
    {
      id: "quarterly",   baskCard: quarterlyCard, name: "Quarterly",
      price: getPrice(quarterlyCard), badge: "RECOMMENDED", badgeStyle: "green",
      billed: getBilled(getPrice(quarterlyCard), 3),
      save: getSavings(monthlyPrice, getPrice(quarterlyCard)),
      selected: isSelected(quarterlyCard),
    },
    {
      id: "sixmonth",    baskCard: sixMonthCard,  name: "6 Month",
      price: getPrice(sixMonthCard), badge: null,
      billed: getBilled(getPrice(sixMonthCard), 6),
      save: getSavings(monthlyPrice, getPrice(sixMonthCard)),
      selected: isSelected(sixMonthCard),
    },
    {
      id: "twelvemonth", baskCard: yearlyCard,    name: "Annual",
      price: getPrice(yearlyCard), badge: "BEST VALUE", badgeStyle: "green",
      billed: getBilled(getPrice(yearlyCard), 12),
      save: getSavings(monthlyPrice, getPrice(yearlyCard)),
      selected: isSelected(yearlyCard),
    },
  ];
}
function planHTML(p) {
  const badge = p.badge ? `<span class="prog-plan-badge prog-${p.badgeStyle}">${p.badge}</span>` : "";
  const save  = p.save  ? `<div class="prog-plan-save">${p.save}</div>` : "";
  return `<div class="prog-plan-card ${p.selected ? "prog-selected" : ""}" data-id="${p.id}" role="radio" aria-checked="${p.selected}" tabindex="0">
    ${badge}<div class="prog-plan-row"><span class="prog-plan-radio"></span>
    <div class="prog-plan-left"><div class="prog-plan-name">${p.name}</div>
    <div class="prog-plan-price"><span class="prog-amt">$${p.price}</span><span class="prog-per">/mo</span></div></div>
    <div class="prog-plan-right"><div class="prog-plan-billed">${p.billed}</div>${save}</div>
    </div></div>`;
}

// ─── COMPAT GUARD ─────────────────────────────────────────────────────────────
// Central error reporter. All compatibility failures funnel here.
// In the future, hook this into an alerting or monitoring system.
function logBrokenCompatibility(source, { problem, expected, actual, fallback } = {}) {
  const parts = [
    `[CO] ⚠️  BASK COMPATIBILITY FAILURE`,
    `     Location : ${source}`,
    `     Problem  : ${problem ?? '(no detail)'}`,
  ];
  if (expected !== undefined) parts.push(`     Expected : ${expected}`);
  if (actual   !== undefined) parts.push(`     Actual   : ${actual}`);
  parts.push(`     Fallback : ${fallback ?? 'Customization aborted — Bask native checkout is fully usable'}`);
  parts.push(`     Action   : A Bask update may have changed the expected DOM. Review TirzepatideCheckout.js.`);
  console.error(parts.join('\n'));
}

// Synchronous pre-flight: verifies required Bask structure exists before any DOM mutation.
function runPreFlight() {
  const container = document.getElementById("script-container");
  if (!container) {
    return { ok: false, source: 'runPreFlight', problem: '#script-container element not found', expected: 'element with id="script-container"', actual: 'null' };
  }
  const next = container.nextElementSibling;
  if (!next) {
    return { ok: false, source: 'runPreFlight', problem: 'No sibling element found after #script-container', expected: 'Bask checkout section as nextElementSibling', actual: 'null' };
  }
  if (!next.querySelector("section.relative")) {
    return { ok: false, source: 'runPreFlight', problem: 'section.relative not found inside Bask container', expected: 'section.relative inside nextElementSibling of #script-container', actual: `nextElementSibling tag=${next.tagName} class="${next.className}"` };
  }
  const totalLabel = [...document.querySelectorAll("span.font-brand-header")].find(
    el => el.textContent.trim() === "Total (If approved):"
  );
  if (!totalLabel) {
    return { ok: false, source: 'runPreFlight', problem: 'Bask "Total (If approved):" label not found', expected: 'span.font-brand-header with text "Total (If approved):"', actual: 'not found' };
  }
  return { ok: true };
}

// ─── MOUNT ────────────────────────────────────────────────────────────────────
function mountCheckoutUI() {
  console.log(
    "[CO] mountCheckoutUI — isMounted:",
    isMounted,
    "activePage:",
    window.__TZMD__.activePage,
  );
  if (isMounted) {
    console.log("[CO] already mounted, skip");
    return;
  }
  const pf = runPreFlight();
  if (!pf.ok) { logBrokenCompatibility(pf.source, pf); return; }
  hideOriginalSection();

  const container = document.getElementById("script-container");
  if (!container) {
    // Unreachable after a passing runPreFlight, but guards against races.
    logBrokenCompatibility("mountCheckoutUI", { problem: "#script-container disappeared after pre-flight", expected: "element present", actual: "null" });
    return;
  }

  container.innerHTML = `
<style>
nav{
gap:20px !important;
}
.questionnaire-animation{
padding-top:0 !important;
}
#script-container {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-grow: 1;
}
  .co {
  --g: #1F4220;          /* dark forest green */
  --g2: #2F5A2A;         /* slightly lighter green text */
  --gs: #2F5A2A;         /* savings green */
  --ink: #1A1A18;
  --muted: #6B7280;
  --bd: #EAEAE7;
  --sel-bg: #F4F8F1;
  --blue: #3B5BDB;       /* the blue subtext under select / billed */
  width: 100%; background: #fff; color: var(--ink);
  border-radius: 8px; padding: 20px 18px;
}
.prog-checkout { --prog-green: #3D5C2A; --prog-green-save: #4F8A37; --prog-ink: #1C1C1A; --prog-muted: #5B6470; --prog-bd: #E7E7E4; --prog-radio-off: #AEB1B8; font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; width: 100%; background: transparent; color: var(--prog-ink); }
.prog-checkout, .prog-checkout * { box-sizing: border-box; margin: 0; padding: 0; -webkit-font-smoothing: antialiased; }
.prog-head { text-align: center;  }
.prog-title { font-size: 26px; font-weight: 700; line-height: 1.22; letter-spacing: -.2px; }
.prog-title .prog-g { color: var(--prog-green); }
.prog-review { color: var(--prog-muted); font-size: 12.5px; font-weight: 500; line-height: 1.5; margin-top: 7px; padding: 0 8px; }
.prog-stat { font-size: 12px; font-weight: 700; line-height: 1.4; margin-top: 9px; padding: 0 6px; }
.prog-select { padding: 4px 0 0; }
.prog-select h2 {text-align: center; font-size: 23px; font-weight: 700; letter-spacing: -.2px; }
.prog-select p { color: var(--ink); font-size: 12.5px; font-weight: 500; margin-top: 3px; }
.prog-plans { padding: 16px 0 0; display: flex; flex-direction: column; gap: 8px; }
.prog-plan-card { position: relative; background: #fff; border: 1px solid #C2C3BF; border-radius: 10px; padding: 7px 11px; cursor: pointer; transition: border-color .15s ease, background .15s ease; }
.prog-plan-card.prog-selected { border-color: var(--prog-green); background: #FBFCF8; }
.prog-plan-badge { display: inline-flex; align-items: center; gap: 4px; margin-left: 20px; margin-bottom: 4px; font-size: 9px; font-weight: 700; letter-spacing: .3px; line-height: 1; padding: 4px 8px; border-radius: 5px; white-space: nowrap; }
.prog-plan-badge.prog-green { background: var(--prog-green); color: #fff; }
.prog-plan-badge.prog-gray { background: #EDEDEA; color: #4A4D52; font-weight: 600; }
.prog-plan-badge svg { width: 10px; height: 10px; }
.prog-plan-row { display: flex; gap: 7px; align-items: flex-start; }
.prog-plan-radio { position: relative; flex: none; width: 15px; height: 15px; margin-top: 1px; border-radius: 50%; border: 1.5px solid var(--prog-radio-off); transition: border-color .15s ease; }
.prog-plan-radio::after { content: ''; position: absolute; top: 50%; left: 50%; width: 7px; height: 7px; border-radius: 50%; background: transparent; transform: translate(-50%, -50%); transition: background .15s ease; }
.prog-plan-card.prog-selected .prog-plan-radio { border-color: var(--prog-green); }
.prog-plan-card.prog-selected .prog-plan-radio::after { background: var(--prog-green); }
.prog-plan-left { flex: 1; min-width: 0; }
.prog-plan-right { flex: none; text-align: right; min-width: 110px; }
.prog-plan-name { font-size: 13px; font-weight: 700; color: var(--prog-ink); line-height: 1.05; }
.prog-plan-price { display: flex; align-items: flex-end; margin-top: 2px; line-height: 1; }
.prog-plan-price .prog-amt { font-size: 19px; font-weight: 700; color: var(--prog-ink); letter-spacing: -.3px; }
.prog-plan-price .prog-per { font-size: 10px; font-weight: 500; color: var(--prog-muted); margin-left: 3px; padding-bottom: 2px; }
.prog-plan-billed { font-size: 11px; font-weight: 500; color: var(--prog-muted); line-height: 1.3; }
.prog-plan-save { font-size: 11px; font-weight: 600; color: var(--prog-green-save); margin-top: 2px; line-height: 1.2; }
.prog-trust { margin: 11px 0 0; display: flex; align-items: center; gap: 9px; background: #EEF2EC; border: 1px solid #E0E8D8; border-radius: 10px; padding: 9px 12px; }
.prog-trust svg { width: 19px; height: 19px; color: var(--prog-green); flex: none; }
.prog-trust .prog-t1 { font-size: 9.5px; font-weight: 700; color: var(--prog-green); line-height: 1.3; }
.prog-trust .prog-t2 { font-size: 8.5px; font-weight: 500; color: var(--prog-ink); margin-top: 1px; }
.prog-testi { margin: 13px 0 0; display: flex; align-items: center; gap: 12px; }
.prog-avatar { flex: none; width: 40px; height: 40px; border-radius: 50%; background: #DEDFE6; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600; color: #3A3F4A; letter-spacing: .5px; }
.prog-testi .prog-stars { display: flex; gap: 1.5px; color: var(--prog-green); }
.prog-testi .prog-stars svg { width: 10px; height: 10px; }
.prog-testi .prog-quote { font-size: 9.5px; font-style: italic; font-weight: 600; color: var(--prog-ink); margin-top: 4px; line-height: 1.35; }
.prog-testi .prog-by { font-size: 8.5px; font-weight: 500; color: var(--prog-muted); margin-top: 4px; }
/* ── Submit button ── */
.prog-submit-btn { width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px; background: var(--ink); color: #fff; border: none; border-radius: 12px; padding: 16px 24px; margin-top: 11px; margin-bottom: 16px; font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 14px; font-weight: 600; letter-spacing: .1px; cursor: pointer; transition: background .15s ease; -webkit-font-smoothing: antialiased; }
.prog-submit-btn:hover { background: #3a3a38; }
.prog-submit-btn:active { transform: translateY(1px); }
.prog-submit-btn:disabled { opacity: .5; cursor: not-allowed; }

/* ── Testimonial ── */
.co-testi { margin: 14px 0 0; margin-bottom: 20px; display: flex; align-items: center; gap: 14px; border: 1px solid var(--bd); border-radius: 12px; padding: 14px 16px; }
.co-avatar { flex: none; width: 52px; height: 52px; border-radius: 50%; background: #E3E4E8; display: flex; align-items: center; justify-content: center; font-size: 15px; font-weight: 600; color: #4A4F5A; }
.co-stars { display: flex; gap: 2px; color: var(--g); }
.co-stars svg { width: 15px; height: 15px; }
.co-quote { font-size: 13px; font-style: italic; font-weight: 600; color: var(--ink); margin-top: 5px; line-height: 1.4; }
.co-by { font-size: 11px; font-weight: 400; color: var(--muted); margin-top: 4px; }

/* ── Trust ── */
.co-trust { margin: 14px 0 0; display: flex; align-items: center; gap: 12px; background: #EEF3EA; border-radius: 12px; padding: 14px 16px;    border: 1px solid var(--bd); }
.co-trust-icon svg { width: 40px; height: 40px; color: var(--g); flex: none; }
.co-trust-t1 { font-size: 13px; font-weight: 600; color: var(--g); line-height: 1.3; }
.co-trust-t2 { font-size: 12px; font-weight: 400; color: var(--ink); margin-top: 2px; }


.prog-fsa-row { margin: 14px 0 0; display: grid; grid-template-columns: 1fr; gap: 8px; }
@media (min-width: 480px) { .prog-fsa-row { grid-template-columns: 1fr 1.3fr; } }
.prog-fsa-box, .prog-pay-box { background: #F7F8F6; border: 1px solid var(--bd); border-radius: 12px; padding: 12px; min-width: 0; }
.prog-fsa-box { display: flex; align-items: flex-start; gap: 12px; }
.prog-fsa-icon { flex: none; padding-top: 2px; }
.prog-fsa-icon svg { width: 26px; height: 26px; color: var(--prog-green); }
.prog-fsa-lbl { font-size: 12px; font-weight: 700; color: var(--prog-green); line-height: 1.2; }
.prog-fsa-sub { font-size: 12px; font-weight: 500; color: var(--prog-muted); margin-top: 4px; line-height: 1.5; }
.prog-pay-lbl { font-size: 12px; font-weight: 700; color: var(--prog-green); margin-bottom: 8px; }
.prog-pay-logos { display: flex; align-items: flex-end; gap: 10px; margin-bottom: 8px; flex-wrap: nowrap; }
.prog-pay-logos svg { display: block; color: #1A1A18; }
.prog-klarna { height: 11px; width: auto; overflow: visible; }
.prog-affirm { height: 20px; width: auto; overflow: visible; }
.prog-afterpay { height: 15px; width: auto; overflow: visible; margin-bottom: -2px; }
.prog-pay-sub { font-size: 12px; font-weight: 500; color: var(--prog-ink); line-height: 1.6; }
.co-banner-img { display: block; width: 70%; max-width:270px; border-radius: 12px;
margin-right: auto;
margin-bottom: 6px;
margin-left: auto;}
.co-value-heading {margin-top:10px; font-size: 17px; font-weight: 800; color: var(--prog-ink); line-height: 1.15; letter-spacing: -0.3px; margin-bottom: 4px; text-align: center; }
.co-value-block { text-align: center;}
.co-val-row { display: flex; align-items: center; gap: 6px; justify-content: center; }
.co-val-price { font-size: 30px; font-weight: 900; color: var(--prog-green); line-height: 1; letter-spacing: -1px; }
.co-val-pgm { font-size: 13px; font-weight: 600; color: var(--prog-muted); }
.co-val-included { font-size: 11.5px; font-weight: 700; color: var(--prog-green); margin-top: 3px; margin-bottom: 2px; }
.co-value-body { font-size: 11px; font-weight: 400; color: var(--prog-ink); }
.co-value-body strong { color: var(--prog-green); font-weight: 700; }
.co-urgency { display: flex; align-items: center; justify-content: center; gap: 5px; font-size: 9px; font-weight: 600; color: var(--prog-green); margin-top: 6px; line-height: 1.4; text-align: center; }
.co-urgency svg { flex: none; width: 15px; height: 15px; color: var(--prog-green); }
.co-badges { display: flex; align-items: center; justify-content: space-between; margin-top: 10px; padding-bottom: 4px; }
.co-badge { display: flex; flex-direction: row; align-items: center; gap: 3px; flex: 1; justify-content: center; padding: 0 2px; }
.co-badge svg { width: 24px; height: 24px; color: var(--prog-green); flex: none; }
.co-badge span { font-size: 8px; font-weight: 700; color: var(--prog-ink); text-align: left; line-height: 1.3; }
.co-badge-div { width: 1px; height: 36px; background: #EAEAE7; flex: none; }
#tzmd-sticky-bar {order:99999999999; z-index: 9999;}
</style>
<div class="prog-checkout relative flex w-full shrink-0 flex-grow flex-col co">
  <div class="prog-head">
    <h1 class="prog-title">${window.baskPatientData?.firstName || ''}, choose your<br><span class="prog-g">Tirzepatide</span> plan</h1>
  </div>
  <div class="prog-plans" id="prog-plans"></div>

  <!-- Trust -->
  <div class="co-trust">
    <div class="co-trust-icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/></svg>
    </div>
    <div>
      <div class="co-trust-t1">No charge unless approved by a physician.</div>
      <div class="co-trust-t2">If approved, your treatment begins.</div>
    </div>
  </div>
  <div id="tzmd-pay-btn-wrap"></div>

    <div class="prog-fsa-row">
    <div class="prog-fsa-box">
      <div class="prog-fsa-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/><path d="M6 15h3"/></svg></div>
      <div><div class="prog-fsa-lbl">FSA / HSA Eligible</div>
      <div class="prog-fsa-sub">Reimbursable with FSA or HSA funds.</div></div>
    </div>
    <div class="prog-pay-box">
      <div class="prog-pay-lbl">Flexible Payment Options</div>
      <div class="prog-pay-logos">
        <svg class="prog-klarna" viewBox="-2 -2 95 26" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M82.2782 17.9579C80.1693 17.9579 78.5256 16.23 78.5256 14.1318C78.5256 12.0337 80.1693 10.3057 82.2782 10.3057C84.3871 10.3057 86.0308 12.0337 86.0308 14.1318C86.0308 16.23 84.3871 17.9579 82.2782 17.9579ZM81.2238 22C83.0225 22 85.3176 21.3212 86.5891 18.6676L86.7131 18.7293C86.1549 20.1795 86.1549 21.0435 86.1549 21.2595V21.5989H90.6828V6.6648H86.1549V7.00421C86.1549 7.2202 86.1549 8.08415 86.7131 9.53436L86.5891 9.59607C85.3176 6.9425 83.0225 6.26367 81.2238 6.26367C76.9129 6.26367 73.8736 9.65778 73.8736 14.1318C73.8736 18.6059 76.9129 22 81.2238 22ZM65.9963 6.26367C63.9494 6.26367 62.3367 6.97335 61.0341 9.59607L60.9101 9.53436C61.4683 8.08415 61.4683 7.2202 61.4683 7.00421V6.6648H56.9404V21.5989H61.5924V13.7307C61.5924 11.6634 62.8019 10.3675 64.7557 10.3675C66.7096 10.3675 67.671 11.4783 67.671 13.6999V21.5989H72.323V12.0954C72.323 8.70126 69.6558 6.26367 65.9963 6.26367ZM50.2105 9.59607L50.0864 9.53436C50.6447 8.08415 50.6447 7.2202 50.6447 7.00421V6.6648H46.1168V21.5989H50.7687L50.7998 14.4095C50.7998 12.3114 51.9162 11.0463 53.746 11.0463C54.2422 11.0463 54.6454 11.108 55.1106 11.2314V6.6648C53.0637 6.23282 51.2339 7.00421 50.2105 9.59607ZM35.4172 17.9579C33.3083 17.9579 31.6646 16.23 31.6646 14.1318C31.6646 12.0337 33.3083 10.3057 35.4172 10.3057C37.5261 10.3057 39.1698 12.0337 39.1698 14.1318C39.1698 16.23 37.5261 17.9579 35.4172 17.9579ZM34.3627 22C36.1615 22 38.4565 21.3212 39.728 18.6676L39.8521 18.7293C39.2938 20.1795 39.2938 21.0435 39.2938 21.2595V21.5989H43.8218V6.6648H39.2938V7.00421C39.2938 7.2202 39.2938 8.08415 39.8521 9.53436L39.728 9.59607C38.4565 6.9425 36.1615 6.26367 34.3627 6.26367C30.0519 6.26367 27.0126 9.65778 27.0126 14.1318C27.0126 18.6059 30.0519 22 34.3627 22ZM20.5308 21.5989H25.1828V0H20.5308V21.5989ZM17.1193 0H12.3743C12.3743 3.85694 9.98628 7.31276 6.35772 9.78121L4.93111 10.7686V0H0V21.5989H4.93111V10.892L13.0876 21.5989H19.1042L11.2578 11.3548C14.8243 8.79383 17.1503 4.81346 17.1193 0Z" fill="currentColor"/></svg>
        <svg class="prog-affirm" viewBox="0 3 72 30" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M49.928 4.5c-8.575 0-16.262 5.948-18.425 13.635h3.128c1.816-5.717 7.996-10.738 15.297-10.738 8.922 0 16.609 6.798 16.609 17.343 0 2.357-.309 4.52-.888 6.412h3.013l.038-.116c.502-1.93.734-4.055.734-6.296 0-11.742-8.575-20.24-19.506-20.24Z" fill="currentColor"/><path d="M29.495 20.027h-2.897v-1.12c0-1.468.85-1.893 1.584-1.893.81 0 1.429.348 1.429.348l.966-2.24s-1.005-.657-2.82-.657c-2.047 0-4.365 1.159-4.365 4.75v.812h-4.79v-1.12c0-1.468.85-1.893 1.584-1.893.425 0 .966.078 1.43.348l.965-2.24c-.58-.348-1.545-.657-2.82-.657-2.047 0-4.365 1.159-4.365 4.75v.812h-1.854V22.5h1.854v8.652h3.168V22.5h4.867v8.652h3.167V22.5h2.897v-2.472ZM37.22 20.027v11.124h3.168v-5.369c0-2.549 1.545-3.283 2.627-3.283.425 0 1.004.116 1.352.386l.58-2.935a4.04 4.04 0 0 0-1.43-.27c-1.622 0-2.665.733-3.36 2.201v-1.854H37.22Z" fill="currentColor"/><path fill-rule="evenodd" clip-rule="evenodd" d="M7.362 19.718c-1.815 0-3.94.85-5.098 1.777l1.042 2.202c.928-.85 2.395-1.546 3.747-1.546 1.275 0 1.97.425 1.97 1.275 0 .58-.463.85-1.352.966-3.283.425-5.871 1.313-5.871 3.863 0 2.008 1.43 3.244 3.67 3.244 1.583 0 3.012-.888 3.708-2.047v1.7h2.974V23.89c0-2.974-2.086-4.172-4.79-4.172Zm-1.12 9.425c-.85 0-1.236-.425-1.236-1.082 0-1.274 1.39-1.7 3.979-1.97 0 1.7-1.16 3.052-2.743 3.052Z" fill="currentColor"/><path d="M56.148 21.688c.657-.966 1.893-1.97 3.592-1.97 2.047 0 3.708 1.236 3.67 3.747v7.686h-3.168V24.47c0-1.468-.888-2.086-1.738-2.086-1.043 0-2.086.966-2.086 3.052v5.716h-3.167v-6.643c0-1.545-.811-2.125-1.738-2.125-1.005 0-2.086 1.005-2.086 3.052v5.716H46.26V20.027h3.051v1.7c.54-1.082 1.7-2.009 3.4-2.009 1.544 0 2.819.734 3.437 1.97ZM31.388 20.027h3.168v11.124h-3.168V20.027Z" fill="currentColor"/></svg>
        <svg class="prog-afterpay" viewBox="-2 -2 125 28" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9.95859 11.7444C9.95859 9.5873 8.43108 8.07125 6.55474 8.07125C4.6784 8.07125 3.15087 9.61286 3.15087 11.7444C3.15087 13.8503 4.6784 15.4175 6.55474 15.4175C8.43299 15.4155 9.95859 13.9015 9.95859 11.7444ZM9.98543 18.1645V16.4951C9.05972 17.6513 7.68169 18.369 6.03151 18.369C2.60273 18.369 0 15.5433 0 11.7444C0 7.969 2.70239 5.0942 6.10817 5.0942C7.71044 5.0942 9.06163 5.81389 9.98735 6.94257V5.32427H13.0654V18.1645H9.98543Z" fill="currentColor"/><path d="M28.0167 15.3133C26.9396 15.3133 26.6406 14.9023 26.6406 13.8248V8.12434H28.6185V5.32427H26.6406V2.19189H23.4859V5.32427H19.4227V4.54363C19.4227 3.46411 19.8233 3.05314 20.9253 3.05314H21.6172V0.561789H20.0993C17.4965 0.561789 16.2699 1.43484 16.2699 4.10513V5.3223H14.5182V8.12237H16.2699V18.1625H19.4246V8.12237H23.4878V14.4147C23.4878 17.0338 24.4633 18.1645 27.0162 18.1645H28.6434V15.3133H28.0167Z" fill="currentColor"/><path d="M39.3303 10.5882C39.1061 8.91874 37.7779 7.91787 36.2273 7.91787C34.6749 7.91787 33.3985 8.89318 33.0746 10.5882H39.3303ZM33.0477 12.5919C33.2739 14.4914 34.6002 15.5709 36.2772 15.5709C37.6035 15.5709 38.6307 14.9279 39.2306 13.9015H42.4601C41.7088 16.6229 39.3303 18.369 36.2024 18.369C32.4229 18.369 29.7704 15.6476 29.7704 11.7699C29.7704 7.89231 32.5743 5.09224 36.2791 5.09224C40.0088 5.09224 42.7112 7.91787 42.7112 11.7699C42.7112 12.0531 42.6862 12.3343 42.6364 12.5919H33.0477Z" fill="currentColor"/><path d="M62.7683 11.7444C62.7683 9.66399 61.2408 8.07125 59.3644 8.07125C57.4881 8.07125 55.9606 9.61286 55.9606 11.7444C55.9606 13.8503 57.4881 15.4175 59.3644 15.4175C61.2408 15.4155 62.7683 13.8248 62.7683 11.7444ZM52.8557 5.32427H55.9337V6.99369C56.8594 5.81192 58.2355 5.0942 59.8876 5.0942C63.2666 5.0942 65.9192 7.9454 65.9192 11.7188C65.9192 15.4942 63.2168 18.371 59.8129 18.371C58.2356 18.371 56.9342 17.728 56.0334 16.6504V23.448H52.8557V5.32427Z" fill="currentColor"/><path d="M77.0143 11.7444C77.0143 9.5873 75.4887 8.07125 73.6104 8.07125C71.7341 8.07125 70.2066 9.61286 70.2066 11.7444C70.2066 13.8503 71.7341 15.4175 73.6104 15.4175C75.4887 15.4155 77.0143 13.9015 77.0143 11.7444ZM77.0411 18.1645V16.4951C76.1154 17.6513 74.7374 18.369 73.0872 18.369C69.6584 18.369 67.0557 15.5433 67.0557 11.7444C67.0557 7.969 69.7581 5.0942 73.1619 5.0942C74.7642 5.0942 76.1154 5.81389 77.0411 6.94257V5.32427H80.1191V18.1645H77.0411Z" fill="currentColor"/><path d="M47.3072 6.58273C47.3072 6.58273 48.091 5.0942 50.0096 5.0942C50.8299 5.0942 51.3608 5.38326 51.3608 5.38326V8.65918C51.3608 8.65918 50.2031 7.92574 49.1394 8.07322C48.0757 8.22069 47.403 9.22353 47.4068 10.5646V18.1665H44.2291V5.32624H47.3072V6.58273Z" fill="currentColor"/><path d="M94.4955 5.32426L86.7237 23.4067H83.4464L86.4976 16.4164L81.3381 5.32426H85.0525L88.0711 12.7354L91.1683 5.32426H94.4955Z" fill="currentColor"/><path d="M119.304 5.03325L111.599 0.471336C109.338 -0.867743 106.511 0.805615 106.511 3.48574V3.95373C106.511 4.37649 106.731 4.76779 107.087 4.97819L108.542 5.83945C108.97 6.09311 109.502 5.77653 109.502 5.27118V4.1071C109.502 3.52507 110.116 3.16129 110.606 3.45231L117.28 7.40466C117.771 7.69568 117.771 8.42323 117.28 8.71228L110.606 12.6646C110.116 12.9556 109.502 12.5919 109.502 12.0098V11.3904C109.502 8.71031 106.675 7.03499 104.412 8.37603L96.7072 12.9379C94.4457 14.277 94.4457 17.6277 96.7072 18.9668L104.412 23.5287C106.673 24.8677 109.502 23.1944 109.502 20.5143V20.0463C109.502 19.6235 109.282 19.2342 108.925 19.0218L107.471 18.1586C107.043 17.9049 106.511 18.2215 106.511 18.7269V19.8909C106.511 20.473 105.897 20.8367 105.407 20.5457L98.7331 16.5934C98.2424 16.3024 98.2424 15.5748 98.7331 15.2838L105.407 11.3314C105.897 11.0404 106.511 11.4042 106.511 11.9862V12.6056C106.511 15.2858 109.338 16.9611 111.599 15.62L119.304 11.0581C121.565 9.72298 121.565 6.37233 119.304 5.03325Z" fill="currentColor"/></svg>
      </div>
    </div>
  </div>

</div>`;

  isMounted = true;
  console.log("[CO] mountCheckoutUI — HTML injected ✓");

  const wrap = document.getElementById("prog-plans");

  function render() {
    if (!wrap?.isConnected) return;
    wrap.innerHTML = plans.map(planHTML).join("");
  }

  // Cleans up all mount-level DOM changes and resets state so Bask's native checkout is restored.
  function abortMount() {
    if (plansObserver) { plansObserver.disconnect(); plansObserver = null; }
    container.innerHTML = '';
    restoreOriginalSection();
    isMounted = false;
    plans = [];
  }

  function initializePlans() {
    const cardsList = document.querySelectorAll(
      "ul.relative.mt-5.flex.flex-col.gap-3 > li",
    );
    console.log("[CO] initializePlans — cards found:", cardsList.length);
    if (cardsList.length < 4) return false; // not ready yet — observer will retry
    const cardArr = [...cardsList];
    const foundTitles = cardArr.map(getCardTitle);
    console.log("[CO] card titles:", foundTitles);
    const required = ["Monthly", "Quarterly", "Six months", "Yearly"];
    const missing  = required.filter(n => !foundTitles.includes(n));
    if (missing.length) {
      logBrokenCompatibility("initializePlans", {
        problem: "Required Bask plan card titles are missing or changed",
        expected: required.join(", "),
        actual: foundTitles.join(", ") || "(none found)"
      });
      return 'abort';
    }
    const draftPlans = getPlans(cardArr);
    const badPrices = draftPlans.filter(p => !Number.isFinite(p.price) || p.price <= 0);
    if (badPrices.length) {
      logBrokenCompatibility("initializePlans", {
        problem: `Could not parse plan prices — Bask may have changed its price span markup`,
        expected: "Positive finite price for all plans",
        actual: badPrices.map(p => `${p.name}: ${p.price}`).join(", ")
      });
      return 'abort';
    }
    plans = draftPlans;
    render();
    return true;
  }

  const _planResult = initializePlans();
  if (_planResult === 'abort') {
    abortMount();
    return;
  }
  if (_planResult === false) {
    plansObserver = new MutationObserver(() => {
      const r = initializePlans();
      if (r === 'abort') {
        abortMount(); // abortMount handles plansObserver disconnect
      } else if (r === true) {
        plansObserver.disconnect();
        plansObserver = null;
      }
    });
    plansObserver.observe(document.body, { childList: true, subtree: true });
    addObserver(plansObserver);
  }

  function selectPlan(id) {
    if (!isMounted) return;
    const plan = plans.find((p) => p.id === id);
    if (!plan?.baskCard) { console.warn("[CO] no baskCard for plan:", id); return; }
    console.log("[CO] selectPlan:", id, "→ clicking Bask card:", getCardTitle(plan.baskCard));
    plans.forEach((p) => (p.selected = p.id === id));
    wrap.querySelectorAll(".prog-plan-card").forEach((c) => {
      const on = c.dataset.id === id;
      c.classList.toggle("prog-selected", on);
      c.setAttribute("aria-checked", on);
    });
    plan.baskCard.click();
  }

  // Watch each Bask card directly via its stored reference — no index arithmetic.
  const baskSelectionObserver = new MutationObserver(() => {
    const selectedPlan = plans.find((p) => p.baskCard?.classList.contains("border-2"));
    if (!selectedPlan) return;
    const currentId = plans.find((p) => p.selected)?.id;
    if (selectedPlan.id !== currentId) {
      console.log("[CO] Bask selection changed → syncing custom UI to:", selectedPlan.id);
      plans.forEach((p) => (p.selected = p.id === selectedPlan.id));
      render();
    }
  });
  plans.forEach((p) => {
    if (p.baskCard) baskSelectionObserver.observe(p.baskCard, { attributes: true, attributeFilter: ["class"] });
  });
  addObserver(baskSelectionObserver);

  addListener(wrap, "click", (e) => {
    const c = e.target.closest(".prog-plan-card");
    if (c) selectPlan(c.dataset.id);
  });
  addListener(wrap, "keydown", (e) => {
    if (e.key === " " || e.key === "Enter") {
      const c = e.target.closest(".prog-plan-card");
      if (c) {
        e.preventDefault();
        selectPlan(c.dataset.id);
      }
    }
  });


  function customizeBaskButton() {
    const LOCK_SVG = `<svg data-tzmd-lock="1" width="18" height="18" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M10.75 13.05a1.5 1.5 0 1 0-1.5 0v.45a.75.75 0 0 0 1.5 0v-.45Z"/><path fill-rule="evenodd" d="M6.25 7.095v-.345a3.75 3.75 0 1 1 7.5 0v.345a3.001 3.001 0 0 1 2.25 2.905v4a3 3 0 0 1-3 3h-6a3 3 0 0 1-3-3v-4a3 3 0 0 1 2.25-2.905Zm1.5-.345a2.25 2.25 0 0 1 4.5 0v.25h-4.5v-.25Zm-2.25 3.25a1.5 1.5 0 0 1 1.5-1.5h6a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1-1.5 1.5h-6a1.5 1.5 0 0 1-1.5-1.5v-4Z"/></svg>`;
    const OUR_HTML = `<div class="flex w-full items-center justify-center"><span class="flex items-center gap-1">${LOCK_SVG} Continue to Doctor Review</span></div>`;

    const applyToButton = (btn) => {
      if (btn.querySelector('[data-tzmd-lock="1"]') && btn.textContent.includes("Continue to Doctor Review")) return;
      btn.innerHTML = OUR_HTML;
    };

    const attachObserver = () => {
      const baskBtn = [...document.querySelectorAll("button[type='submit']")].find(
        (b) => b.textContent.includes("Start My Doctor Review") || b.textContent.includes("Start My Treatment Plan")
      );
      if (!baskBtn) return false;

      applyToButton(baskBtn);

      const observer = new MutationObserver(() => applyToButton(baskBtn));
      observer.observe(baskBtn, {
        attributes: true,
        childList: true,
        subtree: true,
        attributeFilter: ["disabled", "class"],
      });
      addObserver(observer);
      return true;
    };

    if (!attachObserver()) {
      const waitForButton = new MutationObserver(() => {
        if (attachObserver()) waitForButton.disconnect();
      });
      waitForButton.observe(document.body, { childList: true, subtree: true });
      addObserver(waitForButton);
    }
  }
  customizeBaskButton();

  function injectStickyBar() {
    const STICKY_ID = "tzmd-sticky-bar";
    const STICKY_HTML = `<div id="${STICKY_ID}" class="prog-checkout" style="margin-top: 8px;" class="bg-white px-4 py-2 shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
  <div class="co-urgency">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
    Physician slots are limited — applications reviewed in the order received.
  </div>
  <div class="co-badges">
    <div class="co-badge">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/></svg>
      <span>Licensed<br>U.S. Physicians</span>
    </div>
    <div class="co-badge-div"></div>
    <div class="co-badge">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/><line x1="12" y1="15" x2="12" y2="17"/></svg>
      <span>HIPAA<br>Compliant</span>
    </div>
    <div class="co-badge-div"></div>
    <div class="co-badge">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/></svg>
      <span>No Commitment<br>Until Approval</span>
    </div>
    <div class="co-badge-div"></div>
    <div class="co-badge">
      <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><g id="Delivery_Truck"><g><path d="M21.47,11.185l-1.03-1.43a2.5,2.5,0,0,0-2.03-1.05H14.03V6.565a2.5,2.5,0,0,0-2.5-2.5H4.56a2.507,2.507,0,0,0-2.5,2.5v9.94a1.5,1.5,0,0,0,1.5,1.5H4.78a2.242,2.242,0,0,0,4.44,0h5.56a2.242,2.242,0,0,0,4.44,0h1.22a1.5,1.5,0,0,0,1.5-1.5v-3.87A2.508,2.508,0,0,0,21.47,11.185ZM7,18.935a1.25,1.25,0,1,1,1.25-1.25A1.25,1.25,0,0,1,7,18.935Zm6.03-1.93H9.15a2.257,2.257,0,0,0-4.3,0H3.56a.5.5,0,0,1-.5-.5V6.565a1.5,1.5,0,0,1,1.5-1.5h6.97a1.5,1.5,0,0,1,1.5,1.5ZM17,18.935a1.25,1.25,0,1,1,1.25-1.25A1.25,1.25,0,0,1,17,18.935Zm3.94-2.43a.5.5,0,0,1-.5.5H19.15a2.257,2.257,0,0,0-4.3,0h-.82v-7.3h4.38a1.516,1.516,0,0,1,1.22.63l1.03,1.43a1.527,1.527,0,0,1,.28.87Z"></path><path d="M18.029,12.205h-2a.5.5,0,0,1,0-1h2a.5.5,0,0,1,0,1Z"></path></g></g></svg>
      <span>Fast &amp; Discreet<br>Shipping</span>
    </div>
  </div>
</div>`;

    const inject = () => {
      if (document.getElementById(STICKY_ID)) return;
      // Inject into our plan picker (inside #script-container), NOT into paySection.
      // paySection is now the CSS modal sheet — placing content there would show
      // the sticky bar inside the modal, which is wrong.
      const target = document.querySelector("#script-container .prog-checkout");
      if (!target) return;
      const tmp = document.createElement("div");
      tmp.innerHTML = STICKY_HTML;
      target.appendChild(tmp.firstElementChild);
    };

    inject();

    const observer = new MutationObserver(() => {
      if (!document.getElementById(STICKY_ID)) inject();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    addObserver(observer);
  }
  injectStickyBar();

  function initPaymentModal() {

    // Find the Bask payment container — smallest ancestor of #payment-element
    // that also contains the submit button. Stops before document.body.
    // Returns null if #payment-element has no height, which means Bask is showing
    // a review/summary step (not the payment form) and we should wait.
    function findPaymentSection() {
      const payEl = document.getElementById("payment-element");
      const submitBtn = [...document.querySelectorAll('button[type="submit"]')]
        .find(b => /Treatment Plan|Doctor Review/i.test(b.textContent));
      if (!payEl || !submitBtn) return null;
      if (payEl.offsetHeight === 0) return null; // payment form not visible yet
      let el = payEl.parentElement;
      while (el && el !== document.body) {
        if (el.contains(submitBtn)) return el;
        el = el.parentElement;
      }
      return null;
    }

    function setup(paySection) {
      if (!paySection.isConnected) {
        logBrokenCompatibility("setup", { problem: "paySection is not connected to the live document", expected: "paySection.isConnected === true", actual: "false" });
        unmountCheckoutUI(); return;
      }
      if (!paySection.parentElement) {
        logBrokenCompatibility("setup", { problem: "paySection.parentElement is null — cannot anchor placeholder", expected: "non-null parentElement", actual: "null" });
        unmountCheckoutUI(); return;
      }
      if (!paySection.contains(document.getElementById("payment-element"))) {
        logBrokenCompatibility("setup", { problem: "#payment-element is not a descendant of paySection", expected: "#payment-element inside paySection", actual: "not found" });
        unmountCheckoutUI(); return;
      }
      const _setupSubmitBtn = [...paySection.querySelectorAll('button[type="submit"]')].find(b => /Treatment Plan|Doctor Review/i.test(b.textContent));
      if (!_setupSubmitBtn) {
        logBrokenCompatibility("setup", { problem: "Submit button not found inside paySection", expected: 'button[type="submit"] matching /Treatment Plan|Doctor Review/i', actual: "not found" });
        unmountCheckoutUI(); return;
      }
      // Accumulate undo steps as DOM mutations happen; executed in reverse on any error.
      const _undo = [];
      const _onErr = (err) => {
        logBrokenCompatibility("setup", { problem: (err && err.message) || String(err), fallback: "Rolling back all modal DOM changes — Bask native checkout will be restored" });
        for (let i = _undo.length - 1; i >= 0; i--) {
          try { _undo[i](); } catch (e) { console.error("[CO] rollback error at step", i, ":", e); }
        }
        unmountCheckoutUI();
      };
      try {

      // Mutable box so all closures (openModal, closeModal, hideBaskTotal, etc.)
      // always operate on the CURRENT live SECTION even after Bask replaces it.
      const payRef = { current: paySection };

      // Inject modal CSS.
      // IMPORTANT: paySection is NOT moved in the DOM — React owns it and moving it
      // causes reconciliation crashes (removeChild on wrong parent) when Bask updates
      // its state (e.g. removing a discount). Instead we use CSS to make paySection
      // appear as a modal sheet via .tzmd-pay-sheet, keeping the React tree intact.
      const style = document.createElement("style");
      style.id = "tzmd-modal-style";
      style.textContent = `
        #tzmd-modal-overlay {
          display: none; position: fixed; inset: 0; z-index: 99998;
          background: rgba(0,0,0,0.55);
        }
        #tzmd-modal-overlay.tzmd-open { display: block; }
        .tzmd-pay-sheet {
          position: fixed !important;
          bottom: 0 !important; left: 0 !important; right: 0 !important;
          z-index: 99999 !important;
          background: #fff !important;
          max-height: 90vh !important;
          overflow-x: hidden !important;
          overflow-y: auto !important; -webkit-overflow-scrolling: touch !important;
          border-radius: 20px 20px 0 0 !important;
          box-shadow: 0 -4px 32px rgba(0,0,0,0.18) !important;
          padding: 0 !important;
          box-sizing: border-box !important;
          width: 100% !important;
        }
        @media (min-width: 601px) {
          .tzmd-pay-sheet {
            border-radius: 16px !important;
            bottom: auto !important; left: 50% !important; right: auto !important;
            top: 50% !important;
            transform: translate(-50%, -50%) !important;
            width: 92% !important; max-width: 520px !important;
          }
        }
        /* Hide our plan-picker UI behind the overlay when modal is open */
        body.tzmd-modal-open #script-container {
          visibility: hidden !important;
          pointer-events: none !important;
        }
        #tzmd-modal-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 16px 12px; position: sticky; top: 0; background: #fff;
          z-index: 2; border-bottom: 1px solid #EAEAE7;
        }
        #tzmd-modal-title {
          font-family: 'Poppins', sans-serif; font-size: 17px; font-weight: 700;
          color: #1A1A18;
        }
        #tzmd-modal-close {
          background: none; border: none; font-size: 22px; line-height: 1;
          cursor: pointer; color: #888; padding: 4px 8px;
        }
        #tzmd-modal-close:hover { color: #1A1A18; }
        #tzmd-modal-inner { padding: 16px 16px 4px; }
        body.tzmd-modal-open { overflow: hidden !important; }
        #tzmd-pay-btn {
          width: 100%; display: flex; align-items: center; justify-content: center;
          gap: 16px; background: #1A1A18; color: #fff; border: none;
          border-radius: 14px; padding: 20px 28px; margin: 14px 0 18px;
          font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          font-size: 16px; font-weight: 700; letter-spacing: .1px; line-height: 1;
          cursor: pointer; transition: background .15s ease, transform .1s ease, box-shadow .15s ease;
          -webkit-font-smoothing: antialiased;
          box-shadow: 0 4px 14px rgba(0,0,0,0.22);
        }
        #tzmd-pay-btn svg { flex: none; opacity: 0.88; }
        #tzmd-pay-btn:hover { background: #3a3a38; box-shadow: 0 6px 18px rgba(0,0,0,0.28); }
        #tzmd-pay-btn:focus-visible { outline: 2px solid rgba(255,255,255,0.45); outline-offset: 3px; }
        #tzmd-pay-btn:active { transform: translateY(1px); box-shadow: 0 2px 8px rgba(0,0,0,0.16); }
        #tzmd-pay-btn:disabled { opacity: .5; cursor: not-allowed; box-shadow: none; }
        #tzmd-plan-summary { background: #FBFCF8; border: 1px solid #3D5C2A; border-radius: 12px; padding: 10px 12px; margin-bottom: 14px; }
        .tzmd-ps-hdr { font-size: 10px; font-weight: 600; color: #6B7280; letter-spacing: .5px; text-transform: uppercase; margin-bottom: 6px; }
        .tzmd-ps-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
        .tzmd-ps-name { font-family: 'Poppins', sans-serif; font-size: 14px; font-weight: 700; color: #1A1A18; line-height: 1.25; }
        .tzmd-ps-freq { font-size: 12px; font-weight: 400; color: #6B7280; margin-top: 3px; line-height: 1.4; }
        .tzmd-ps-right { text-align: right; flex-shrink: 0; }
        .tzmd-ps-amt { font-family: 'Poppins', sans-serif; font-size: 18px; font-weight: 700; color: #1A1A18; white-space: nowrap; line-height: 1.15; }
        .tzmd-ps-amt-orig { font-size: 13px; font-weight: 500; color: #9CA3AF; text-decoration: line-through; margin-right: 2px; }
        .tzmd-ps-lbl { display: inline-block; margin-top: 5px; background: #EEF3EA; color: #2F5A2A; font-size: 10.5px; font-weight: 500; line-height: 1.3; padding: 3px 8px; border-radius: 6px; white-space: nowrap; }
        .tzmd-ps-change { margin-top: 6px; }
        @media (max-width: 400px) {
          .tzmd-ps-row { flex-direction: column; gap: 6px; }
          .tzmd-ps-right { text-align: left; }
        }
        #tzmd-change-plan { background: none; border: none; padding: 0; font-size: 12px; font-weight: 500; color: #3D5C2A; cursor: pointer; text-decoration: underline; font-family: 'Poppins', sans-serif; }
        #tzmd-change-plan:hover { opacity: .75; }
        .tzmd-modal-trust { display: flex; align-items: center; gap: 12px; background: #EEF3EA; border: 1px solid #D4E8C8; border-radius: 12px; padding: 11px 14px; margin-bottom: 14px; }
        .tzmd-modal-trust svg { width: 28px; height: 28px; color: #1F4220; flex: none; }
        .tzmd-modal-trust-t1 { font-family: 'Poppins', sans-serif; font-size: 13px; font-weight: 600; color: #1F4220; line-height: 1.3; }
        .tzmd-modal-trust-t2 { font-family: 'Poppins', sans-serif; font-size: 11.5px; font-weight: 400; color: #2C3020; margin-top: 3px; line-height: 1.45; }
        @keyframes tzmd-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.38; } }
        #tzmd-loading-shell {
          display: none; position: fixed;
          bottom: 0; left: 0; right: 0; z-index: 99999;
          background: #fff; max-height: 90vh; overflow: hidden;
          border-radius: 20px 20px 0 0;
          box-shadow: 0 -4px 32px rgba(0,0,0,0.18);
          box-sizing: border-box; width: 100%;
        }
        @media (min-width: 601px) {
          #tzmd-loading-shell {
            border-radius: 16px; bottom: auto; left: 50%; right: auto;
            top: 50%; transform: translate(-50%, -50%);
            width: 92%; max-width: 520px;
          }
        }
        #tzmd-loading-shell.tzmd-ls-open { display: block; }
        .tzmd-skel { background: #EDEDEB; border-radius: 8px; animation: tzmd-pulse 1.4s ease-in-out infinite; }
      `;
      document.head.appendChild(style);
      _undo.push(() => style.remove());

      // Full-screen backdrop overlay (paySection is NOT moved into this — see comment above)
      const overlay = document.createElement("div");
      overlay.id = "tzmd-modal-overlay";
      document.body.appendChild(overlay);
      _undo.push(() => overlay.remove());

      // Loading skeleton — shown while Bask remounts the payment section after discount removal.
      // Keeps the overlay visible so the user never sees the page flash underneath.
      const loadingShell = document.createElement("div");
      loadingShell.id = "tzmd-loading-shell";
      loadingShell.innerHTML = `
        <div style="display:flex;align-items:center;padding:14px 16px 12px;border-bottom:1px solid #EAEAE7;">
          <span style="font-family:'Poppins',sans-serif;font-size:17px;font-weight:700;color:#1A1A18;">Complete Your Order</span>
        </div>
        <div style="padding:20px 16px;display:flex;flex-direction:column;gap:12px;">
          <div class="tzmd-skel" style="height:14px;width:55%"></div>
          <div class="tzmd-skel" style="height:14px;width:90%"></div>
          <div class="tzmd-skel" style="height:14px;width:70%;margin-top:4px"></div>
          <div class="tzmd-skel" style="height:20px;width:100%;margin-top:8px"></div>
          <div class="tzmd-skel" style="height:52px;width:100%;border-radius:12px;margin-top:4px"></div>
        </div>`;
      document.body.appendChild(loadingShell);
      _undo.push(() => loadingShell.remove());

      // Inject our header directly into paySection (before Bask's React-managed children).
      // React ignores DOM nodes it did not create, so these are safe to prepend.
      // Use <header> (not <div>) so React's type-matching detects a mismatch
      // and removes (rather than reuses) this node during reconciliation — which
      // fires our childList MutationObserver so we can immediately re-inject it.
      const headerEl = document.createElement("header");
      headerEl.id = "tzmd-modal-header";
      headerEl.innerHTML = `<span id="tzmd-modal-title">Complete Your Order</span><button id="tzmd-modal-close" aria-label="Close payment form">✕</button>`;
      paySection.insertBefore(headerEl, paySection.firstChild);
      _undo.push(() => headerEl.remove());

      // Wrapper with padding that holds our plan summary + trust card
      // Use <aside> for same reason — distinct type prevents React from reusing the node.
      const modalInner = document.createElement("aside");
      modalInner.id = "tzmd-modal-inner";
      paySection.insertBefore(modalInner, headerEl.nextSibling);
      _undo.push(() => modalInner.remove());

      // Explicitly override the parent section's visibility:hidden so paySection
      // can show through once it gets position:fixed via .tzmd-pay-sheet.
      paySection.style.setProperty('visibility', 'visible', 'important');
      _undo.push(() => paySection.style.removeProperty('visibility'));

      // Hide paySection until the modal is opened — it should never be visible inline.
      paySection.style.setProperty('display', 'none', 'important');
      _undo.push(() => paySection.style.removeProperty('display'));

      // Apply horizontal padding to Bask's native children inside the sheet.
      // CSS child-combinator rules are unreliable when Bask uses Tailwind's
      // !important mode — inline style assignment beats all external rules.
      // Skip the full-width submit button wrapper (it uses negative margins intentionally).
      const _paddedBaskChildren = [];
      for (const child of paySection.children) {
        if (child === headerEl || child === modalInner) continue;
        child.style.paddingLeft = '16px';
        child.style.paddingRight = '16px';
        child.style.boxSizing = 'border-box';
        _paddedBaskChildren.push(child);
      }
      _undo.push(() => {
        _paddedBaskChildren.forEach(c => {
          c.style.paddingLeft = '';
          c.style.paddingRight = '';
          c.style.boxSizing = '';
        });
      });

      // Plan summary card
      function getPlanDisplayInfo(sel) {
        const m = sel.billed.match(/^(.+?)\s*\(\$([\d,.]+)\s*total\)/);
        return m ? { freq: m[1].trim(), totalAmt: '$' + m[2] } : { freq: sel.billed, totalAmt: '$' + sel.price.toFixed(2) };
      }
      const summaryEl = document.createElement('div');
      summaryEl.id = 'tzmd-plan-summary';
      summaryEl.innerHTML = `
        <div class="tzmd-ps-hdr">Selected treatment plan</div>
        <div class="tzmd-ps-row">
          <div style="min-width:0"><div class="tzmd-ps-name"></div><div class="tzmd-ps-freq"></div><div class="tzmd-ps-change"><button id="tzmd-change-plan">Change plan</button></div></div>
          <div class="tzmd-ps-right"><div class="tzmd-ps-amt"></div><div class="tzmd-ps-lbl">Total if approved by a physician</div></div>
        </div>
      `;
      modalInner.appendChild(summaryEl);

      let baskDiscountedTotal = null;
      let baskOriginalTotal = null;

      function renderPlanSummary() {
        const sel = plans.find(p => p.selected) || plans[0];
        if (!sel) return;
        const { freq, totalAmt } = getPlanDisplayInfo(sel);
        summaryEl.querySelector('.tzmd-ps-name').textContent = 'Tirzepatide — ' + sel.name + ' plan';
        summaryEl.querySelector('.tzmd-ps-freq').textContent = freq;
        const amtEl = summaryEl.querySelector('.tzmd-ps-amt');
        if (baskDiscountedTotal && baskOriginalTotal) {
          amtEl.innerHTML = `<span class="tzmd-ps-amt-orig">${baskOriginalTotal}</span> ${baskDiscountedTotal}`;
        } else {
          amtEl.textContent = baskDiscountedTotal || totalAmt;
        }
      }
      renderPlanSummary();

      // Green reassurance card
      const trustEl = document.createElement('div');
      trustEl.className = 'tzmd-modal-trust';
      trustEl.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/></svg>
        <div>
          <div class="tzmd-modal-trust-t1">No charge unless approved by a physician.</div>
          <div class="tzmd-modal-trust-t2">You'll only be charged after the prescription is approved.</div>
        </div>
      `;
      modalInner.appendChild(trustEl);

      // Hide Bask's standalone "Total (If approved):" row — our summary replaces it.
      // Queries paySection directly since paySection was NOT moved into modalInner.
      function hideBaskTotal() {
        const ps = payRef.current;
        for (const el of ps.querySelectorAll('span.font-brand-header, span')) {
          if (!el.children.length && el.textContent.trim() === 'Total (If approved):') {
            let row = el;
            for (let i = 0; i < 2 && row.parentElement && row.parentElement !== ps; i++) row = row.parentElement;
            if (row !== el) {
              const priceEls = [...row.querySelectorAll('span')].filter(s =>
                !s.children.length && /^\$[\d,]+\.\d{2}$/.test(s.textContent.trim())
              );
              if (priceEls.length) {
                const latest = priceEls[priceEls.length - 1].textContent.trim();
                const original = priceEls.length > 1 ? priceEls[0].textContent.trim() : null;
                if (latest !== baskDiscountedTotal || original !== baskOriginalTotal) {
                  baskDiscountedTotal = latest;
                  baskOriginalTotal = original;
                  renderPlanSummary();
                }
              }
              row.style.setProperty('display', 'none', 'important');
            }
            return;
          }
        }
      }
      hideBaskTotal();
      const totalHideObs = new MutationObserver(hideBaskTotal);
      totalHideObs.observe(paySection, { childList: true, subtree: true });
      addObserver(totalHideObs);

      // Hide Bask's "Card Details" label
      function hideCardDetails() {
        const ps = payRef.current;
        for (const el of ps.querySelectorAll('p, h2, h3, h4, span, div')) {
          if (el.childElementCount === 0 && el.textContent.trim() === 'Card Details' && !el.dataset.tzmdCdHidden) {
            el.dataset.tzmdCdHidden = '1';
            el.style.setProperty('display', 'none', 'important');
          }
        }
      }
      hideCardDetails();
      const cardDetailsObs = new MutationObserver(hideCardDetails);
      cardDetailsObs.observe(paySection, { childList: true, subtree: true });
      addObserver(cardDetailsObs);

      // Raise Bask's native dialogs (e.g. "Remove discount?") above our modal.
      const baskDialogObs = new MutationObserver((mutations) => {
        for (const m of mutations) {
          for (const node of m.addedNodes) {
            if (node.nodeType !== 1) continue;
            if (node.id === 'tzmd-modal-overlay') continue;
            const cs = window.getComputedStyle(node);
            if (cs.position === 'fixed') {
              node.style.setProperty('z-index', '999999', 'important');
            }
            node.querySelectorAll('[role="dialog"]').forEach(d => {
              d.style.setProperty('z-index', '999999', 'important');
              if (d.parentElement && d.parentElement !== document.body) {
                d.parentElement.style.setProperty('z-index', '999999', 'important');
              }
            });
          }
        }
      });
      baskDialogObs.observe(document.body, { childList: true });
      addObserver(baskDialogObs);

      // Inject trigger button
      const btnWrap = document.getElementById("tzmd-pay-btn-wrap");
      if (btnWrap) {
        const CARD = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>`;
        btnWrap.innerHTML = `<button id="tzmd-pay-btn">${CARD}Add Payment Method &amp; Continue</button>`;
      }

      function openModal() {
        renderPlanSummary();
        // Re-suppress Bask content before the section becomes visible to avoid a paint flash.
        hideBaskTotal();
        hideCardDetails();
        applyBaskHides(payRef.current);
        if (hiddenSection) hiddenSection.removeAttribute('inert');
        _scrollLocked = false;
        payRef.current.style.removeProperty('display');
        overlay.classList.add("tzmd-open");
        payRef.current.classList.add("tzmd-pay-sheet");
        document.body.classList.add("tzmd-modal-open");
      }

      function closeModal() {
        overlay.classList.remove("tzmd-open");
        payRef.current.classList.remove("tzmd-pay-sheet");
        payRef.current.style.setProperty('display', 'none', 'important');
        document.body.classList.remove("tzmd-modal-open");
        if (hiddenSection) hiddenSection.setAttribute('inert', '');
        _scrollLocked = true;
      }

      const payBtn = document.getElementById("tzmd-pay-btn");
      if (payBtn) addListener(payBtn, "click", openModal);

      const closeBtn = document.getElementById("tzmd-modal-close");
      const changePlanBtn = document.getElementById("tzmd-change-plan");
      if (closeBtn) addListener(closeBtn, "click", closeModal);
      addListener(overlay, "click", closeModal);
      if (changePlanBtn) addListener(changePlanBtn, "click", closeModal);
      addListener(document, "keydown", (e) => { if (e.key === "Escape") closeModal(); });

      // Store cleanup so unmount can remove our injected elements and restore classes
      window.__TZMD__._modalCleanup = () => {
        headerEl.remove();
        modalInner.remove(); // also removes summaryEl + trustEl inside it
        overlay.remove();
        loadingShell.remove();
        style.remove();
        payRef.current.classList.remove("tzmd-pay-sheet");
        payRef.current.style.removeProperty('display');
        document.body.classList.remove("tzmd-modal-open");
        if (hiddenSection) {
          hiddenSection.style.removeProperty('visibility');
          hiddenSection.removeAttribute('inert');
        }
        _scrollLocked = false;
        unlockQC();
        delete window.__TZMD__._modalCleanup;
      };
      console.log("[CO-MODAL] modal wired ✓ (paySection stays in original DOM position)");

      // Re-inject our header/inner if React removes them during a re-render (e.g. discount removal).
      // _modalCleanup deletes itself, so checking for it avoids re-injecting after intentional cleanup.
      const reinjectionObs = new MutationObserver(() => {
        if (!window.__TZMD__._modalCleanup) return; // cleanup already ran — don't re-inject
        const ps = payRef.current;
        if (!ps.contains(headerEl)) {
          ps.insertBefore(headerEl, ps.firstChild);
          ps.insertBefore(modalInner, headerEl.nextSibling);
          hideBaskTotal();
          hideCardDetails();
          applyBaskHides(ps);
        }
        // Reapply side-padding to any new/replaced Bask children (e.g. after discount apply).
        // Bask replaces children in-place when applying a discount, so the new children
        // arrive without our padding styles.
        for (const child of ps.children) {
          if (child !== headerEl && child !== modalInner) {
            child.style.paddingLeft = '16px';
            child.style.paddingRight = '16px';
            child.style.boxSizing = 'border-box';
          }
        }
      });
      reinjectionObs.observe(paySection, { childList: true });
      addObserver(reinjectionObs);

      // Bask sometimes replaces the SECTION element entirely (not just its children)
      // after significant re-renders like actual discount removal confirmation.
      // reinjectionObs only watches children — this observer watches the parent so
      // we detect when paySection is removed and re-graft onto the new SECTION.
      function applyToNewPaySection(newPay) {
        // Guard: after Bask's discount-removal remount, findPaymentSection() may walk up
        // too far and return the outer section.relative (hiddenSection) instead of the
        // focused payment-form wrapper. Injecting into the outer section would make the
        // entire Bask checkout (review content, promo copy, etc.) appear inside our modal.
        // Reject any element that IS or is a direct child of the outer section.
        if (newPay === hiddenSection || newPay.parentElement === hiddenSection) {
          // Wrong element — Bask is mid-remount (e.g. after discount removal). Keep the backdrop
          // open and show a loading skeleton so the user never sees the page underneath.
          loadingShell.classList.add("tzmd-ls-open");
          if (hiddenSection) hiddenSection.setAttribute('inert', '');
          const waitForPayStep = new MutationObserver(() => {
            if (!window.__TZMD__._modalCleanup) { waitForPayStep.disconnect(); return; }
            // Outer section gone → SPA moved on, close modal
            if (hiddenSection && !hiddenSection.isConnected) {
              waitForPayStep.disconnect();
              loadingShell.classList.remove("tzmd-ls-open");
              if (window.__TZMD__._modalCleanup) window.__TZMD__._modalCleanup();
              return;
            }
            const ps = findPaymentSection();
            if (ps && ps !== hiddenSection && ps.parentElement !== hiddenSection) {
              waitForPayStep.disconnect();
              loadingShell.classList.remove("tzmd-ls-open");
              applyToNewPaySection(ps);
            }
          });
          waitForPayStep.observe(document.body, { childList: true, subtree: true });
          return;
        }

        payRef.current = newPay;
        newPay.style.setProperty('visibility', 'visible', 'important');
        if (hiddenSection) hiddenSection.removeAttribute('inert');
        newPay.classList.add("tzmd-pay-sheet");
        newPay.style.removeProperty('display');
        newPay.insertBefore(headerEl, newPay.firstChild);
        newPay.insertBefore(modalInner, headerEl.nextSibling);

        // Re-apply side-padding to Bask's direct children (same padding applied in initial setup).
        for (const child of newPay.children) {
          if (child !== headerEl && child !== modalInner) {
            child.style.paddingLeft = "16px";
            child.style.paddingRight = "16px";
            child.style.boxSizing = "border-box";
          }
        }

        // Reset cached Bask totals — the discount was removed so both values are stale.
        // renderPlanSummary will fall back to the plan's base price; totalHideObs will
        // update it again once Bask renders the new total row in the fresh SECTION.
        baskDiscountedTotal = null;
        baskOriginalTotal = null;
        renderPlanSummary();
        totalHideObs.disconnect();
        totalHideObs.observe(newPay, { childList: true, subtree: true });
        cardDetailsObs.disconnect();
        cardDetailsObs.observe(newPay, { childList: true, subtree: true });
        reinjectionObs.disconnect();
        reinjectionObs.observe(newPay, { childList: true });
        hideBaskTotal();
        hideCardDetails();
        applyBaskHides(newPay);
        payReplaceObs.disconnect();
        if (newPay.parentElement) payReplaceObs.observe(newPay.parentElement, { childList: true });
      }
      const payReplaceObs = new MutationObserver(() => {
        if (!window.__TZMD__._modalCleanup) return;
        if (payRef.current.isConnected) return; // SECTION still in DOM, nothing to do
        const newPay = findPaymentSection();
        if (newPay) {
          applyToNewPaySection(newPay);
        } else {
          // If the outer Bask section itself is gone, the SPA navigated to the next step
          // (e.g. after payment submission). Close the modal instead of showing a skeleton.
          if (hiddenSection && !hiddenSection.isConnected) {
            if (window.__TZMD__._modalCleanup) window.__TZMD__._modalCleanup();
            return;
          }
          // #payment-element not ready yet (Stripe remounting) — show skeleton immediately
          // so the overlay has a white panel instead of just a gray void.
          loadingShell.classList.add("tzmd-ls-open");
          const waitForReplace = new MutationObserver(() => {
            if (!window.__TZMD__._modalCleanup) { waitForReplace.disconnect(); return; }
            // Outer section gone → SPA moved on, close modal
            if (hiddenSection && !hiddenSection.isConnected) {
              waitForReplace.disconnect();
              loadingShell.classList.remove("tzmd-ls-open");
              if (window.__TZMD__._modalCleanup) window.__TZMD__._modalCleanup();
              return;
            }
            const ps = findPaymentSection();
            if (ps) {
              waitForReplace.disconnect();
              loadingShell.classList.remove("tzmd-ls-open");
              applyToNewPaySection(ps);
            }
          });
          waitForReplace.observe(document.body, { childList: true, subtree: true });
        }
      });
      if (paySection.parentElement) {
        payReplaceObs.observe(paySection.parentElement, { childList: true });
        addObserver(payReplaceObs);
      }

      } catch (err) { _onErr(err); } // rolls back all DOM changes on any setup failure
    } // end setup()

    // Try immediately; if Stripe hasn't mounted #payment-element yet, wait for it.
    const paySection = findPaymentSection();
    if (paySection) {
      setup(paySection);
    } else {
      console.warn("[CO-MODAL] payment section not ready — waiting for Stripe mount");
      const waitObs = new MutationObserver(() => {
        const ps = findPaymentSection();
        if (ps) { waitObs.disconnect(); setup(ps); }
      });
      waitObs.observe(document.body, { childList: true, subtree: true });
      addObserver(waitObs);
    }
  }
  initPaymentModal();

}

// ─── UNMOUNT ──────────────────────────────────────────────────────────────────
function unmountCheckoutUI() {
  console.log(
    "[CO] unmountCheckoutUI — isMounted:",
    isMounted,
    "activePage:",
    window.__TZMD__.activePage,
  );
  if (window.__TZMD__._modalCleanup) window.__TZMD__._modalCleanup();
  restoreOriginalSection();
  document.getElementById("tzmd-sticky-bar")?.remove();

  const container = document.getElementById("script-container");
  if (!container) {
    console.log("[CO] unmount — no container");
    return;
  }

  console.log("[CO] unmount — clearing container");
  container.innerHTML = "";
  isMounted = false;
  plans = [];

  if (plansObserver) {
    plansObserver.disconnect();
    plansObserver = null;
  }
  console.log("[CO] unmount complete");
}

// ─── PAGE DETECTION ───────────────────────────────────────────────────────────
function isCheckoutPage() {
  return !![...document.querySelectorAll("span.font-brand-header")].find(
    (el) => el.textContent.trim() === "Total (If approved):"
  );
}

function syncCheckoutUI() {
  const checkout = isCheckoutPage();
  console.log(
    "[CO] syncCheckoutUI — isCheckoutPage:",
    checkout,
    "activePage:",
    window.__TZMD__.activePage,
    "isMounted:",
    isMounted,
  );
  if (checkout) mountCheckoutUI();
  else unmountCheckoutUI();
}

// ─── BOOT ─────────────────────────────────────────────────────────────────────
let syncTimer = null;

function debouncedSync() {
  // Unmount immediately — don't wait for debounce
  if (isMounted && !isCheckoutPage()) {
    // Don't unmount while the modal is open — Bask's React briefly removes
    // DOM nodes during discount re-renders, causing isCheckoutPage() to
    // return false for a split second even though the user is still on checkout.
    if (document.getElementById("tzmd-modal-overlay")?.classList.contains("tzmd-open")) return;
    unmountCheckoutUI();
    return;
  }
  // Hide immediately to prevent flash — full mount is debounced below (gated users only)
  if (isCheckoutPage()) hideOriginalSection();
  // Debounce mount only, to avoid thrashing during React's initial render
  // clearTimeout(syncTimer);
  // syncTimer = setTimeout(() => {
    const currentPage = window.__TZMD__?.activePage;
    if (currentPage !== "checkout") return;
    syncCheckoutUI();
  // }, 150);
}

console.log("[CO] running initial syncCheckoutUI");
syncCheckoutUI();

const pageObserver = new MutationObserver(debouncedSync);
pageObserver.observe(document.body, { childList: true, subtree: true });
addObserver(pageObserver);

console.log(
  "[CO] script fully initialized ✓ activePage:",
  window.__TZMD__.activePage,
);
