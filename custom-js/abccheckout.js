// ─── TZMD LIFECYCLE ENGINE ────────────────────────────────────────────────────
window.__TZMD__ ??= { activePage: null, cleanup: {} };

window.__TZMD__.createPage ??= function createPage(PAGE_ID) {
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

    // page specific cleanup
    if (PAGE_ID === "checkout") {
      unmountCheckoutUI();
    }

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

function hideOriginalSection() {
  const container = document.getElementById("script-container");
  const next = container?.nextElementSibling;

  if (next && !next.classList.contains("hidden")) {
    hiddenSection = next;
    next.classList.add("hidden");
    console.log("[CO] added hidden ✓");
  }
}

function restoreOriginalSection() {
  if (hiddenSection?.classList.contains("hidden")) {
    hiddenSection.classList.remove("hidden");
    console.log("[CO] removed hidden ✓");
  }
  hiddenSection = null;
}
// ─── BOOT ─────────────────────────────────────────────────────────────────────
const page = window.__TZMD__.createPage("checkout");
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
let domCards = [];
let plansObserver = null;

// Payment element move state
let paymentElOriginalParent = null;
let paymentElOriginalNext = null;

const CHECK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';
const STAR =
  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 18.4 6.1 21l1.2-6.5L2.5 9.9l6.6-.9z"/></svg>';

// ─── PURE HELPERS ─────────────────────────────────────────────────────────────
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
  const total = price * months;
  if (months === 3)
    return `Billed every 3 months ($${formatCurrency(total)} total)`;
  if (months === 6)
    return `Billed every 6 months ($${formatCurrency(total)} total)`;
  return `Billed annually ($${formatCurrency(total)} total)`;
}
function getSavings(monthlyPrice, discountedPrice) {
  const savings = (monthlyPrice - discountedPrice) * 12;
  return `Save $${formatCurrency(savings)}/year vs monthly`;
}
function getPlans(cards) {
  const monthlyPrice = getPrice(cards[3]);
  return [
    {
      id: "quarterly",
      name: "Quarterly Program",
      price: getPrice(cards[0]),
      badge: "RECOMMENDED",
      badgeStyle: "green",
      check: true,
      billed: getBilled(getPrice(cards[0]), 3),
      save: getSavings(monthlyPrice, getPrice(cards[0])),
      selected: isSelected(cards[0]),
      highlights: [
        { text: "Most Popular", check: true },
        { text: "Best Balance of<br>Savings & Flexibility", check: true },
      ],
    },
    {
      id: "sixmonth",
      name: "6 Month Program",
      price: getPrice(cards[1]),
      badge: "POPULAR UPGRADE",
      badgeStyle: "green",
      check: false,
      billed: getBilled(getPrice(cards[1]), 6),
      save: getSavings(monthlyPrice, getPrice(cards[1])),
      selected: isSelected(cards[1]),
      highlights: [{ text: "Popular Upgrade", check: false, green: true }],
    },
    {
      id: "twelvemonth",
      name: "12 Month Program",
      price: getPrice(cards[2]),
      badge: "BEST VALUE",
      badgeStyle: "green",
      check: false,
      billed: getBilled(getPrice(cards[2]), 12),
      save: getSavings(monthlyPrice, getPrice(cards[2])),
      selected: isSelected(cards[2]),
      highlights: [{ text: "Lowest Monthly Cost", check: false, green: true }],
    },
    {
      id: "monthly",
      name: "",
      price: monthlyPrice,
      badge: "Starter Monthly",
      badgeStyle: "gray",
      check: false,
      billed: "Billed monthly, cancel anytime",
      selected: isSelected(cards[3]),
      highlights: [
        { text: "Most patients upgrade<br>after their first month.", check: false },
      ],
    },
  ];
}
function planHTML(p) {
  const badge = p.badge
    ? `<span class="prog-plan-badge prog-${p.badgeStyle}">${p.check ? CHECK : ""}${p.badge}</span>`
    : "";
  const name = p.name ? `<div class="prog-plan-name">${p.name}</div>` : "";
  const save = p.save ? `<div class="prog-plan-save">${p.save}</div>` : "";
  const notes = (p.notes || [])
    .map((n) => `<div class="prog-plan-note">${n}</div>`)
    .join("");
  const hlItems = (p.highlights || [])
    .map((h) => `<div class="prog-plan-hl">${h.check ? `<svg class="prog-plan-hl-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/></svg>` : ""}<span class="prog-plan-hl-text${(h.check || h.green) ? " prog-hl-green" : ""}">${h.text}</span></div>`)
    .join("");
  const highlightsHTML = hlItems ? `<div class="prog-plan-highlights">${hlItems}</div>` : "";
  return `<div class="prog-plan-card ${p.selected ? "prog-selected" : ""}" data-id="${p.id}" role="radio" aria-checked="${p.selected}" tabindex="0">
    ${badge}<div class="prog-plan-row"><span class="prog-plan-radio"></span>
    <div class="prog-plan-content flex flex-col gap-1">${name}
    <div class="prog-plan-price"><span class="prog-amt">$${p.price}</span><span class="prog-per">/mo</span></div>
    <div class="prog-plan-billed">${p.billed}</div>${save}${notes}</div>${highlightsHTML}</div></div>`;
}

// ─── MOUNT ────────────────────────────────────────────────────────────────────
function mountCheckoutUI() {
  console.log(
    "[CO] mountCheckoutUI — isMounted:",
    isMounted,
    "activePage:",
    window.__TZMD__.activePage,
  );
  hideOriginalSection();
  if (isMounted) {
    console.log("[CO] already mounted, skip");
    return;
  }

  const container = document.getElementById("script-container");
  if (!container) {
    console.log("[CO] no script-container");
    return;
  }

  container.innerHTML = `
<style>
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
  width: 100%; max-width: 430px; background: #fff; color: var(--ink);
  border-radius: 8px; padding: 20px 18px;
}
.prog-checkout { --prog-green: #3D5C2A; --prog-green-save: #4F8A37; --prog-ink: #1C1C1A; --prog-muted: #5B6470; --prog-bd: #E7E7E4; --prog-radio-off: #AEB1B8; font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; width: 100%; background: transparent; color: var(--prog-ink); }
.prog-checkout, .prog-checkout * { box-sizing: border-box; margin: 0; padding: 0; -webkit-font-smoothing: antialiased; }
.prog-head { text-align: center; padding: 6px 0 0; }
.prog-title { font-size: 24.5px; font-weight: 700; line-height: 1.22; letter-spacing: -.2px; }
.prog-title .prog-g { color: var(--prog-green); }
.prog-review { color: var(--prog-muted); font-size: 12.5px; font-weight: 500; line-height: 1.5; margin-top: 7px; padding: 0 8px; }
.prog-stat { font-size: 13px; font-weight: 700; line-height: 1.4; margin-top: 9px; padding: 0 6px; }
.prog-select { padding: 14px 0 0; }
.prog-select h2 { font-size: 18.5px; font-weight: 700; letter-spacing: -.2px; }
.prog-select p { color: var(--ink); font-size: 12.5px; font-weight: 500; margin-top: 3px; }
.prog-plans { padding: 8px 0 0; display: flex; flex-direction: column; gap: 6px; }
.prog-plan-card { position: relative; background: #fff; border: 1px solid var(--bd); border-radius: 10px; padding: 7px 11px; cursor: pointer; transition: border-color .15s ease, background .15s ease; }
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
.prog-plan-content { flex: 1; min-width: 0; }
.prog-plan-name { font-size: 13px; font-weight: 700; color: var(--prog-ink); line-height: 1.05; }
.prog-plan-price { display: flex; align-items: flex-end; margin-top: 2px; line-height: 1; }
.prog-plan-price .prog-amt { font-size: 19px; font-weight: 700; color: var(--prog-ink); letter-spacing: -.3px; }
.prog-plan-price .prog-per { font-size: 10px; font-weight: 500; color: var(--prog-muted); margin-left: 3px; padding-bottom: 2px; }
.prog-plan-billed { font-size: 11px; font-weight: 500; color: var(--prog-muted); margin-top: 3px; line-height: 1.2; }
.prog-plan-save { font-size: 11px; font-weight: 600; color: var(--prog-green-save); margin-top: 2px; line-height: 1.2; }
.prog-plan-note { font-size: 10px; font-weight: 500; color: var(--prog-muted); margin-top: 2px; line-height: 1.2; }
.prog-plan-highlights { display: flex; flex-direction: column; gap: 5px; justify-content: center; width: 36%; flex-shrink: 0; }
.prog-plan-hl { display: flex; align-items: flex-start; gap: 4px; }
.prog-plan-hl-check { flex: none; width: 13px; height: 13px; color: var(--prog-green); margin-top: 1px; }
.prog-plan-hl-text { font-size: 10px; font-weight: 600; color: var(--prog-muted); line-height: 1.3; }
.prog-plan-hl-text.prog-hl-green { color: var(--prog-green); font-weight: 700; }
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
/* ── Payment slot ── */
.prog-payment-slot { margin: 13px 0 0; }

.prog-payment-loading { font-size: 11px; color: var(--prog-muted); text-align: center; padding: 20px 0; }
/* ── Submit button ── */
.prog-submit-btn { width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px; background: var(--ink); color: #fff; border: none; border-radius: 12px; padding: 16px 24px; margin-top: 11px; margin-bottom: 16px; font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 14px; font-weight: 600; letter-spacing: .1px; cursor: pointer; transition: background .15s ease; -webkit-font-smoothing: antialiased; }
.prog-submit-btn:hover { background: #3a3a38; }
.prog-submit-btn:active { transform: translateY(1px); }
.prog-submit-btn:disabled { opacity: .5; cursor: not-allowed; }

/* ── Testimonial ── */
.co-testi { margin: 14px 0 0; display: flex; align-items: center; gap: 14px; border: 1px solid var(--bd); border-radius: 12px; padding: 14px 16px; }
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

.co-payment-hdr { display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; }
.co-payment-hdr-l {letter-spacing: -0.2px; display: flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 500; color: #6B6C82; }
.co-payment-hdr-l svg {margin-bottom: 2px; width: 16px; height: 16px; color: #6B6C82; }
.co-payment-hdr-r {letter-spacing: -0.2px; font-size: 11px; font-weight: 500; color: #6B6C82; }

.prog-fsa-row { margin: 14px 0 0; display: grid; grid-template-columns: 1fr 1.3fr; gap: 8px; }
@media (max-width: 380px) { .prog-fsa-row { grid-template-columns: 1fr; } }
.prog-fsa-box, .prog-pay-box { background: #F7F8F6; border: 1px solid var(--bd); border-radius: 12px; padding: 12px; min-width: 0; }
.prog-fsa-box { display: flex; align-items: flex-start; gap: 12px; }
.prog-fsa-icon { flex: none; padding-top: 2px; }
.prog-fsa-icon svg { width: 26px; height: 26px; color: var(--prog-green); }
.prog-fsa-lbl { font-size: 12px; font-weight: 700; color: var(--prog-green); line-height: 1.2; }
.prog-fsa-sub { font-size: 12px; font-weight: 500; color: var(--prog-muted); margin-top: 4px; line-height: 1.5; }
.prog-pay-lbl { font-size: 12px; font-weight: 700; color: var(--prog-green); margin-bottom: 8px; }
.prog-pay-logos { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }
.prog-pay-logos span { color: #1A1A1A; }
.prog-klarna { font-size: 14px; font-weight: 800; }
.prog-affirm { font-size: 14px; font-weight: 700; }
.prog-afterpay { font-size: 13px; font-weight: 800; }
.prog-pay-sub { font-size: 12px; font-weight: 500; color: var(--prog-ink); line-height: 1.6; }
.prog-checkout .features-parent {border: 1px solid var(--bd); border-radius: 18px; margin: 0; padding: 6px 0; }
.prog-checkout .prog-inc-title { font-size: 18.5px; font-weight: 700; color: var(--prog-ink); line-height: 1.3; margin-top: 20px; margin-bottom: 8px; }
.prog-checkout .features { position: relative;   }
.prog-checkout .frow { display: grid; grid-template-columns: repeat(3, 1fr); }
.prog-checkout .fcell { display: flex; flex-direction: column; align-items: center; justify-content: flex-start; text-align: center; padding: 12px 3px 11px; gap: 8px; }
.prog-checkout .ficon { width: 40px; height: 40px; color: var(--primary-green); display: flex; align-items: center; justify-content: center; }
.prog-checkout .ficon img { width: 100%; height: 100%; object-fit: contain; }
.prog-checkout .flabel { font-size: 9.5px; line-height: 1.4; font-weight: 500; color: var(--ink); white-space: nowrap; letter-spacing: -0.1px; }
.prog-checkout .features .vdiv { position: absolute; width: 1px; background: var(--bd); }
.prog-checkout .features .hdiv { position: absolute; top: 50%; height: 1px; background: var(--bd); }
.prog-checkout .features .hdiv-1 { left: 24px; width: calc(33.33% - 42px); }
.prog-checkout .features .hdiv-2 { left: calc(33.33% + 18px); width: calc(33.33% - 36px); }
.prog-checkout .features .hdiv-3 { left: calc(66.66% + 18px); right: 24px; }
.co-urgency { display: flex; align-items: center; justify-content: center; gap: 5px; font-size: 9px; font-weight: 600; color: var(--prog-green); margin-top: 6px; line-height: 1.4; text-align: center; }
.co-urgency svg { flex: none; width: 15px; height: 15px; color: var(--prog-green); }
.co-badges { display: flex; align-items: center; justify-content: space-between; margin-top: 10px; padding-bottom: 4px; }
.co-badge { display: flex; flex-direction: row; align-items: center; gap: 3px; flex: 1; justify-content: center; padding: 0 2px; }
.co-badge svg { width: 24px; height: 24px; color: var(--prog-green); flex: none; }
.co-badge span { font-size: 8px; font-weight: 700; color: var(--prog-ink); text-align: left; line-height: 1.3; }
.co-badge-div { width: 1px; height: 36px; background: var(--bd); flex: none; }
</style>
<div class="prog-checkout relative flex w-full shrink-0 flex-grow flex-col co">
  <div class="prog-head">
    <h1 class="prog-title">${window.baskPatientData?.firstName || ''}, choose your<br><span class="prog-g">Tirzepatide</span> program</h1>
    <p class="prog-review">Reviewed and prescribed by a licensed U.S. physician<br>before treatment begins.</p>
    <p class="prog-stat">Patients lose an average of 15–20%* of body weight<br>in their first year.</p>
  </div>
  <div class="prog-inc-title text-center">Every Plan Includes:</div>
  <div class="features-parent">
    <div class="features">
    <div class="frow">
      <div class="fcell"><div class="ficon"><img src="https://res.cloudinary.com/dcl5ecseg/image/upload/v1781646704/physicianguidedcare_uwuuub.png" alt="Physician" /></div><div class="flabel">Physician-Guided<br />Care</div></div>
      <div class="fcell"><div class="ficon"><img src="https://res.cloudinary.com/dcl5ecseg/image/upload/v1781646705/loseitforlifeprogram_twkqeu.png" alt="Lose It For Life" /></div><div class="flabel">Lose It For Life®<br />Program</div></div>
      <div class="fcell"><div class="ficon"><img src="https://res.cloudinary.com/dcl5ecseg/image/upload/v1781646704/GLP-1nutritionprotocol-Picsart-BackgroundRemover_ull02n.png" alt="GLP-1 Nutrition Protocol" /></div><div class="flabel">GLP-1 Nutrition<br />Protocol™</div></div>
    </div>
    <div class="frow">
      <div class="fcell"><div class="ficon"><img src="https://res.cloudinary.com/dcl5ecseg/image/upload/v1781646704/concierge_eb3gi7.png" alt="Concierge Support" /></div><div class="flabel">Concierge<br />Support</div></div>
      <div class="fcell"><div class="ficon"><img src="https://res.cloudinary.com/dcl5ecseg/image/upload/v1781646705/ChatGPT_Image_Jun_16_2026_01_26_54_PM_jzrfop.png" alt="Free Shipping" /></div><div class="flabel">Free<br />Shipping</div></div>
      <div class="fcell"><div class="ficon"><img src="https://res.cloudinary.com/dcl5ecseg/image/upload/v1781646704/ChatGPT_Image_Jun_16_2026_01_29_42_PM_iykuqj.png" alt="Injection Supplies Included" /></div><div class="flabel">Injection Supplies<br />Included</div></div>
    </div>
    <div class="hdiv hdiv-1"></div><div class="hdiv hdiv-2"></div><div class="hdiv hdiv-3"></div>
    <div class="vdiv" style="left:33.33%;top:11%;height:31%;"></div>
    <div class="vdiv" style="left:66.66%;top:11%;height:31%;"></div>
    <div class="vdiv" style="left:33.33%;top:58%;height:31%;"></div>
    <div class="vdiv" style="left:66.66%;top:58%;height:31%;"></div>
  </div>
  </div>
  <div class="prog-select"><h2>Select your plan</h2><p>All plans include medication, supplies, program, and support.</p></div>
  <div class="prog-plans" id="prog-plans"></div>

  <!-- Trust -->
  <div class="co-trust">
    <div class="co-trust-icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/></svg>
    </div>
    <div>
      <div class="co-trust-t1">No charge unless approved by your physician.</div>
      <div class="co-trust-t2">If approved, your treatment begins.</div>
    </div>
  </div>

    <div class="prog-fsa-row">
    <div class="prog-fsa-box">
      <div class="prog-fsa-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/><path d="M6 15h3"/></svg></div>
      <div><div class="prog-fsa-lbl">FSA / HSA Eligible</div>
      <div class="prog-fsa-sub">Reimbursable with FSA or HSA funds.</div></div>
    </div>
    <div class="prog-pay-box">
      <div class="prog-pay-lbl">Flexible Payment Options</div>
      <div class="prog-pay-logos">
        <span class="prog-klarna">Klarna.</span>
        <span class="prog-affirm">affirm</span>
        <span class="prog-afterpay">afterpay</span>
      </div>
    </div>
  </div>

    <div class="co-testi">
    <div class="co-avatar">RM</div>
    <div>
      <div class="co-stars" id="stars"></div>
      <div class="co-quote">"Down 28 lbs in 3 months and my energy is back."</div>
      <div class="co-by">— Rachel M., Dallas</div>
    </div>
  </div>
  <div class="prog-payment-slot" id="tzmd-payment-slot">
      <div class="co-payment-hdr">
      <div class="co-payment-hdr-l">
        <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 512 512" height="200px" width="200px" xmlns="http://www.w3.org/2000/svg"><path d="M376 192h-24v-46.7c0-52.7-42-96.5-94.7-97.3-53.4-.7-97.3 42.8-97.3 96v48h-24c-22 0-40 18-40 40v192c0 22 18 40 40 40h240c22 0 40-18 40-40V232c0-22-18-40-40-40zM270 316.8v68.8c0 7.5-5.8 14-13.3 14.4-8 .4-14.7-6-14.7-14v-69.2c-11.5-5.6-19.1-17.8-17.9-31.7 1.4-15.5 14.1-27.9 29.6-29 18.7-1.3 34.3 13.5 34.3 31.9 0 12.7-7.3 23.6-18 28.8zM324 192H188v-48c0-18.1 7.1-35.1 20-48s29.9-20 48-20 35.1 7.1 48 20 20 29.9 20 48v48z"></path></svg>
        Secure payment information
      </div>
      <div class="co-payment-hdr-r">Your data is encrypted and secure.</div>
    </div>
    <div class="prog-payment-box" id="tzmd-payment-box">
      <div class="prog-payment-loading">Loading secure payment form…</div>
    </div>
  </div>
  <div style="margin-top: 8px;" class="sticky bottom-0 z-50 bg-white px-4 py-2 shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
  <button id="tzmd-submit-btn" class="prog-submit-btn" type="button">
    <svg width="24" height="24" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M10.75 13.05a1.5 1.5 0 1 0-1.5 0v.45a.75.75 0 0 0 1.5 0v-.45Z"/><path fill-rule="evenodd" d="M6.25 7.095v-.345a3.75 3.75 0 1 1 7.5 0v.345a3.001 3.001 0 0 1 2.25 2.905v4a3 3 0 0 1-3 3h-6a3 3 0 0 1-3-3v-4a3 3 0 0 1 2.25-2.905Zm1.5-.345a2.25 2.25 0 0 1 4.5 0v.25h-4.5v-.25Zm-2.25 3.25a1.5 1.5 0 0 1 1.5-1.5h6a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1-1.5 1.5h-6a1.5 1.5 0 0 1-1.5-1.5v-4Z"/></svg>
    Start My Treatment Plan
  </button>
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
  </div>
</div>`;

  isMounted = true;
  console.log("[CO] mountCheckoutUI — HTML injected ✓");

  const wrap = document.getElementById("prog-plans");

  function render() {
    if (!wrap?.isConnected) return;
    wrap.innerHTML = plans.map(planHTML).join("");
  }

  function initializePlans() {
    const cards = document.querySelectorAll(
      "ul.relative.mt-5.flex.flex-col.gap-3 > li",
    );
    console.log("[CO] initializePlans — cards found:", cards.length);
    if (cards.length < 4) return false;
    domCards = [...cards];
    plans = getPlans(cards);
    render();
    return true;
  }

  if (!initializePlans()) {
    plansObserver = new MutationObserver(() => {
      if (initializePlans()) {
        plansObserver.disconnect();
        plansObserver = null;
      }
    });
    plansObserver.observe(document.body, { childList: true, subtree: true });
    addObserver(plansObserver);
  }

  const indexMap = { quarterly: 0, sixmonth: 1, twelvemonth: 2, monthly: 3 };
  const idByIndex = ["quarterly", "sixmonth", "twelvemonth", "monthly"];

  function selectPlan(id) {
    if (!isMounted) return;
    console.log("[CO] selectPlan:", id, "→ domCards[" + indexMap[id] + "]");
    plans.forEach((p) => (p.selected = p.id === id));
    wrap.querySelectorAll(".prog-plan-card").forEach((c) => {
      const on = c.dataset.id === id;
      c.classList.toggle("prog-selected", on);
      c.setAttribute("aria-checked", on);
    });
    const domCard = domCards[indexMap[id]];
    if (domCard) domCard.click();
    else console.warn("[CO] domCard not found for id:", id);
  }

  const baskSelectionObserver = new MutationObserver(() => {
    const selectedIdx = domCards.findIndex((c) =>
      c.classList.contains("border-2"),
    );
    if (selectedIdx === -1) return;
    const id = idByIndex[selectedIdx];
    const currentId = plans.find((p) => p.selected)?.id;
    if (id && id !== currentId) {
      console.log("[CO] Bask selection changed → syncing custom UI to:", id);
      plans.forEach((p) => (p.selected = p.id === id));
      render();
    }
  });
  domCards.forEach((c) =>
    baskSelectionObserver.observe(c, {
      attributes: true,
      attributeFilter: ["class"],
    }),
  );
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

  document.getElementById("stars").innerHTML = STAR.repeat(5);

  // ── Move Stripe payment element into our slot ────────────────────────────
  function movePaymentIntoSlot() {
    const paymentEl = document.getElementById("payment-element");
    const slot = document.getElementById("tzmd-payment-box");
    if (!paymentEl || !slot) return false;
    if (slot.contains(paymentEl)) return true;

    paymentElOriginalParent = paymentEl.parentNode;
    paymentElOriginalNext = paymentEl.nextSibling;

    slot.innerHTML = "";
    slot.appendChild(paymentEl);
    console.log("[CO] payment element moved into tzmd-payment-slot ✓");
    return true;
  }

  if (!movePaymentIntoSlot()) {
    const paymentSlotObserver = new MutationObserver(() => {
      if (movePaymentIntoSlot()) paymentSlotObserver.disconnect();
    });
    paymentSlotObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
    addObserver(paymentSlotObserver);
  }

  // ── Submit button → triggers Bask's hidden form submit ──────────────────
  addListener(document.getElementById("tzmd-submit-btn"), "click", () => {
    console.log("[CO] tzmd-submit-btn clicked → triggering Bask submit");
    const baskBtn = [
      ...document.querySelectorAll("button[type='submit']"),
    ].find((b) => b.textContent.includes("Start My Doctor Review"));
    if (baskBtn) baskBtn.click();
    else console.warn("[CO] Bask submit button not found");
  });

  function syncSubmitButtonState() {
    const customBtn = document.getElementById("tzmd-submit-btn");
    if (!customBtn) return;

    const attachObserver = () => {
      const baskBtn = [
        ...document.querySelectorAll("button[type='submit']"),
      ].find((b) => b.textContent.includes("Start My Doctor Review"));

      if (!baskBtn) return false;

      const updateState = () => {
        const isLoading =
          baskBtn.disabled || !!baskBtn.querySelector(".animate-spin");

        customBtn.disabled = isLoading;

        customBtn.innerHTML = isLoading
          ? `
          <div class="inline-block h-4 w-4 animate-spin rounded-full border-4 border-neutral-100 border-t-neutral-300"></div>
         
        `
          : `
          <svg width="24" height="24" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M10.75 13.05a1.5 1.5 0 1 0-1.5 0v.45a.75.75 0 0 0 1.5 0v-.45Z"/><path fill-rule="evenodd" d="M6.25 7.095v-.345a3.75 3.75 0 1 1 7.5 0v.345a3.001 3.001 0 0 1 2.25 2.905v4a3 3 0 0 1-3 3h-6a3 3 0 0 1-3-3v-4a3 3 0 0 1 2.25-2.905Zm1.5-.345a2.25 2.25 0 0 1 4.5 0v.25h-4.5v-.25Zm-2.25 3.25a1.5 1.5 0 0 1 1.5-1.5h6a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1-1.5 1.5h-6a1.5 1.5 0 0 1-1.5-1.5v-4Z"/></svg>
          Start My Treatment Plan
        `;
      };

      updateState();

      const observer = new MutationObserver(updateState);

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
        if (attachObserver()) {
          waitForButton.disconnect();
        }
      });

      waitForButton.observe(document.body, {
        childList: true,
        subtree: true,
      });

      addObserver(waitForButton);
    }
  }
  syncSubmitButtonState();
}

// ─── UNMOUNT ──────────────────────────────────────────────────────────────────
function unmountCheckoutUI() {
  console.log(
    "[CO] unmountCheckoutUI — isMounted:",
    isMounted,
    "activePage:",
    window.__TZMD__.activePage,
  );
  restoreOriginalSection();
  // Restore Stripe payment element to its original DOM position BEFORE
  // clearing the container — otherwise the node is destroyed with innerHTML=""
  if (paymentElOriginalParent) {
    const paymentEl = document.getElementById("payment-element");
    if (paymentEl) {
      try {
        paymentElOriginalParent.insertBefore(paymentEl, paymentElOriginalNext);
        console.log("[CO] payment element restored ✓");
      } catch (e) {
        /* original parent may be gone */
      }
    }
    paymentElOriginalParent = null;
    paymentElOriginalNext = null;
  }

  const container = document.getElementById("script-container");
  if (!container) {
    console.log("[CO] unmount — no container");
    return;
  }

  console.log("[CO] unmount — clearing container");
  container.innerHTML = "";
  isMounted = false;
  plans = [];
  domCards = [];

  if (plansObserver) {
    plansObserver.disconnect();
    plansObserver = null;
  }
  console.log("[CO] unmount complete");
}

// ─── PAGE DETECTION ───────────────────────────────────────────────────────────
function isCheckoutPage() {
  return [...document.querySelectorAll("span")].some(
    (el) => el.textContent.trim() === "Choose Your Program",
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
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    const currentPage = window.__TZMD__?.activePage;
    console.log("[CO] debouncedSync fired — currentPage:", currentPage);
    if (currentPage !== "checkout") {
      console.log(
        "[CO] debouncedSync ABORTED — not checkout page, activePage:",
        currentPage,
      );
      return;
    }
    syncCheckoutUI();
  }, 150);
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
