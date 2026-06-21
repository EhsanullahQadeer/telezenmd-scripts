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
.prog-plan-radio::x { content: ''; position: absolute; top: 50%; left: 50%; width: 7px; height: 7px; border-radius: 50%; background: transparent; transform: translate(-50%, -50%); transition: background .15s ease; }
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
.prog-pay-logos { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; flex-wrap: nowrap; }
.prog-pay-logos svg { display: block; color: #1A1A18; }
.prog-klarna { height: 11px; width: auto; overflow: visible; }
.prog-affirm { height: 10px; width: auto; overflow: visible; }
.prog-afterpay { height: 15px; width: auto; overflow: visible; }
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
        <svg class="prog-klarna" viewBox="-2 -2 95 26" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M82.2782 17.9579C80.1693 17.9579 78.5256 16.23 78.5256 14.1318C78.5256 12.0337 80.1693 10.3057 82.2782 10.3057C84.3871 10.3057 86.0308 12.0337 86.0308 14.1318C86.0308 16.23 84.3871 17.9579 82.2782 17.9579ZM81.2238 22C83.0225 22 85.3176 21.3212 86.5891 18.6676L86.7131 18.7293C86.1549 20.1795 86.1549 21.0435 86.1549 21.2595V21.5989H90.6828V6.6648H86.1549V7.00421C86.1549 7.2202 86.1549 8.08415 86.7131 9.53436L86.5891 9.59607C85.3176 6.9425 83.0225 6.26367 81.2238 6.26367C76.9129 6.26367 73.8736 9.65778 73.8736 14.1318C73.8736 18.6059 76.9129 22 81.2238 22ZM65.9963 6.26367C63.9494 6.26367 62.3367 6.97335 61.0341 9.59607L60.9101 9.53436C61.4683 8.08415 61.4683 7.2202 61.4683 7.00421V6.6648H56.9404V21.5989H61.5924V13.7307C61.5924 11.6634 62.8019 10.3675 64.7557 10.3675C66.7096 10.3675 67.671 11.4783 67.671 13.6999V21.5989H72.323V12.0954C72.323 8.70126 69.6558 6.26367 65.9963 6.26367ZM50.2105 9.59607L50.0864 9.53436C50.6447 8.08415 50.6447 7.2202 50.6447 7.00421V6.6648H46.1168V21.5989H50.7687L50.7998 14.4095C50.7998 12.3114 51.9162 11.0463 53.746 11.0463C54.2422 11.0463 54.6454 11.108 55.1106 11.2314V6.6648C53.0637 6.23282 51.2339 7.00421 50.2105 9.59607ZM35.4172 17.9579C33.3083 17.9579 31.6646 16.23 31.6646 14.1318C31.6646 12.0337 33.3083 10.3057 35.4172 10.3057C37.5261 10.3057 39.1698 12.0337 39.1698 14.1318C39.1698 16.23 37.5261 17.9579 35.4172 17.9579ZM34.3627 22C36.1615 22 38.4565 21.3212 39.728 18.6676L39.8521 18.7293C39.2938 20.1795 39.2938 21.0435 39.2938 21.2595V21.5989H43.8218V6.6648H39.2938V7.00421C39.2938 7.2202 39.2938 8.08415 39.8521 9.53436L39.728 9.59607C38.4565 6.9425 36.1615 6.26367 34.3627 6.26367C30.0519 6.26367 27.0126 9.65778 27.0126 14.1318C27.0126 18.6059 30.0519 22 34.3627 22ZM20.5308 21.5989H25.1828V0H20.5308V21.5989ZM17.1193 0H12.3743C12.3743 3.85694 9.98628 7.31276 6.35772 9.78121L4.93111 10.7686V0H0V21.5989H4.93111V10.892L13.0876 21.5989H19.1042L11.2578 11.3548C14.8243 8.79383 17.1503 4.81346 17.1193 0Z" fill="currentColor"/></svg>
        <svg class="prog-affirm" viewBox="0 16.5 72 15.5" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M29.495 20.027h-2.897v-1.12c0-1.468.85-1.893 1.584-1.893.81 0 1.429.348 1.429.348l.966-2.24s-1.005-.657-2.82-.657c-2.047 0-4.365 1.159-4.365 4.75v.812h-4.79v-1.12c0-1.468.85-1.893 1.584-1.893.425 0 .966.078 1.43.348l.965-2.24c-.58-.348-1.545-.657-2.82-.657-2.047 0-4.365 1.159-4.365 4.75v.812h-1.854V22.5h1.854v8.652h3.168V22.5h4.867v8.652h3.167V22.5h2.897v-2.472ZM37.22 20.027v11.124h3.168v-5.369c0-2.549 1.545-3.283 2.627-3.283.425 0 1.004.116 1.352.386l.58-2.935a4.04 4.04 0 0 0-1.43-.27c-1.622 0-2.665.733-3.36 2.201v-1.854H37.22Z" fill="currentColor"/><path fill-rule="evenodd" clip-rule="evenodd" d="M7.362 19.718c-1.815 0-3.94.85-5.098 1.777l1.042 2.202c.928-.85 2.395-1.546 3.747-1.546 1.275 0 1.97.425 1.97 1.275 0 .58-.463.85-1.352.966-3.283.425-5.871 1.313-5.871 3.863 0 2.008 1.43 3.244 3.67 3.244 1.583 0 3.012-.888 3.708-2.047v1.7h2.974V23.89c0-2.974-2.086-4.172-4.79-4.172Zm-1.12 9.425c-.85 0-1.236-.425-1.236-1.082 0-1.274 1.39-1.7 3.979-1.97 0 1.7-1.16 3.052-2.743 3.052Z" fill="currentColor"/><path d="M56.148 21.688c.657-.966 1.893-1.97 3.592-1.97 2.047 0 3.708 1.236 3.67 3.747v7.686h-3.168V24.47c0-1.468-.888-2.086-1.738-2.086-1.043 0-2.086.966-2.086 3.052v5.716h-3.167v-6.643c0-1.545-.811-2.125-1.738-2.125-1.005 0-2.086 1.005-2.086 3.052v5.716H46.26V20.027h3.051v1.7c.54-1.082 1.7-2.009 3.4-2.009 1.544 0 2.819.734 3.437 1.97ZM31.388 20.027h3.168v11.124h-3.168V20.027Z" fill="currentColor"/></svg>
        <svg class="prog-afterpay" viewBox="-2 -2 125 28" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9.95859 11.7444C9.95859 9.5873 8.43108 8.07125 6.55474 8.07125C4.6784 8.07125 3.15087 9.61286 3.15087 11.7444C3.15087 13.8503 4.6784 15.4175 6.55474 15.4175C8.43299 15.4155 9.95859 13.9015 9.95859 11.7444ZM9.98543 18.1645V16.4951C9.05972 17.6513 7.68169 18.369 6.03151 18.369C2.60273 18.369 0 15.5433 0 11.7444C0 7.969 2.70239 5.0942 6.10817 5.0942C7.71044 5.0942 9.06163 5.81389 9.98735 6.94257V5.32427H13.0654V18.1645H9.98543Z" fill="currentColor"/><path d="M28.0167 15.3133C26.9396 15.3133 26.6406 14.9023 26.6406 13.8248V8.12434H28.6185V5.32427H26.6406V2.19189H23.4859V5.32427H19.4227V4.54363C19.4227 3.46411 19.8233 3.05314 20.9253 3.05314H21.6172V0.561789H20.0993C17.4965 0.561789 16.2699 1.43484 16.2699 4.10513V5.3223H14.5182V8.12237H16.2699V18.1625H19.4246V8.12237H23.4878V14.4147C23.4878 17.0338 24.4633 18.1645 27.0162 18.1645H28.6434V15.3133H28.0167Z" fill="currentColor"/><path d="M39.3303 10.5882C39.1061 8.91874 37.7779 7.91787 36.2273 7.91787C34.6749 7.91787 33.3985 8.89318 33.0746 10.5882H39.3303ZM33.0477 12.5919C33.2739 14.4914 34.6002 15.5709 36.2772 15.5709C37.6035 15.5709 38.6307 14.9279 39.2306 13.9015H42.4601C41.7088 16.6229 39.3303 18.369 36.2024 18.369C32.4229 18.369 29.7704 15.6476 29.7704 11.7699C29.7704 7.89231 32.5743 5.09224 36.2791 5.09224C40.0088 5.09224 42.7112 7.91787 42.7112 11.7699C42.7112 12.0531 42.6862 12.3343 42.6364 12.5919H33.0477Z" fill="currentColor"/><path d="M62.7683 11.7444C62.7683 9.66399 61.2408 8.07125 59.3644 8.07125C57.4881 8.07125 55.9606 9.61286 55.9606 11.7444C55.9606 13.8503 57.4881 15.4175 59.3644 15.4175C61.2408 15.4155 62.7683 13.8248 62.7683 11.7444ZM52.8557 5.32427H55.9337V6.99369C56.8594 5.81192 58.2355 5.0942 59.8876 5.0942C63.2666 5.0942 65.9192 7.9454 65.9192 11.7188C65.9192 15.4942 63.2168 18.371 59.8129 18.371C58.2356 18.371 56.9342 17.728 56.0334 16.6504V23.448H52.8557V5.32427Z" fill="currentColor"/><path d="M77.0143 11.7444C77.0143 9.5873 75.4887 8.07125 73.6104 8.07125C71.7341 8.07125 70.2066 9.61286 70.2066 11.7444C70.2066 13.8503 71.7341 15.4175 73.6104 15.4175C75.4887 15.4155 77.0143 13.9015 77.0143 11.7444ZM77.0411 18.1645V16.4951C76.1154 17.6513 74.7374 18.369 73.0872 18.369C69.6584 18.369 67.0557 15.5433 67.0557 11.7444C67.0557 7.969 69.7581 5.0942 73.1619 5.0942C74.7642 5.0942 76.1154 5.81389 77.0411 6.94257V5.32427H80.1191V18.1645H77.0411Z" fill="currentColor"/><path d="M47.3072 6.58273C47.3072 6.58273 48.091 5.0942 50.0096 5.0942C50.8299 5.0942 51.3608 5.38326 51.3608 5.38326V8.65918C51.3608 8.65918 50.2031 7.92574 49.1394 8.07322C48.0757 8.22069 47.403 9.22353 47.4068 10.5646V18.1665H44.2291V5.32624H47.3072V6.58273Z" fill="currentColor"/><path d="M94.4955 5.32426L86.7237 23.4067H83.4464L86.4976 16.4164L81.3381 5.32426H85.0525L88.0711 12.7354L91.1683 5.32426H94.4955Z" fill="currentColor"/><path d="M119.304 5.03325L111.599 0.471336C109.338 -0.867743 106.511 0.805615 106.511 3.48574V3.95373C106.511 4.37649 106.731 4.76779 107.087 4.97819L108.542 5.83945C108.97 6.09311 109.502 5.77653 109.502 5.27118V4.1071C109.502 3.52507 110.116 3.16129 110.606 3.45231L117.28 7.40466C117.771 7.69568 117.771 8.42323 117.28 8.71228L110.606 12.6646C110.116 12.9556 109.502 12.5919 109.502 12.0098V11.3904C109.502 8.71031 106.675 7.03499 104.412 8.37603L96.7072 12.9379C94.4457 14.277 94.4457 17.6277 96.7072 18.9668L104.412 23.5287C106.673 24.8677 109.502 23.1944 109.502 20.5143V20.0463C109.502 19.6235 109.282 19.2342 108.925 19.0218L107.471 18.1586C107.043 17.9049 106.511 18.2215 106.511 18.7269V19.8909C106.511 20.473 105.897 20.8367 105.407 20.5457L98.7331 16.5934C98.2424 16.3024 98.2424 15.5748 98.7331 15.2838L105.407 11.3314C105.897 11.0404 106.511 11.4042 106.511 11.9862V12.6056C106.511 15.2858 109.338 16.9611 111.599 15.62L119.304 11.0581C121.565 9.72298 121.565 6.37233 119.304 5.03325Z" fill="currentColor"/></svg>
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
