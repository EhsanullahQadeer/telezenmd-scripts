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
  function addObserver(o) { disposables.observers.push(o); }
  function addTimer(t)    { disposables.timers.push(t); }
  function addListener(el, ev, fn, opts) {
    el.addEventListener(ev, fn, opts);
    disposables.listeners.push({ element: el, event: ev, handler: fn, options: opts });
  }
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    console.log(`[TZMD] ${PAGE_ID} destroy`);
    delete registry.cleanup[PAGE_ID];
    if (registry.activePage === PAGE_ID) registry.activePage = null;
    disposables.observers.forEach(o => o.disconnect());
    disposables.timers.forEach(t => clearTimeout(t));
    disposables.listeners.forEach(({ element, event, handler, options }) =>
      element.removeEventListener(event, handler, options)
    );
    disposables.observers = [];
    disposables.timers    = [];
    disposables.listeners = [];
  }
  registry.cleanup[PAGE_ID] = destroy;
  return { addObserver, addTimer, addListener, destroy };
};

// ─── RESTORE HIDDEN SECTION ───────────────────────────────────────────────────
console.log("[CO] script start — activePage:", window.__TZMD__.activePage);
(function restoreHiddenSection() {
  const container = document.getElementById("script-container");
  const next = container?.nextElementSibling;
  console.log("[CO] restoreHiddenSection — next has hidden:", next?.classList.contains("hidden"));
  if (next?.classList.contains("hidden")) {
    next.classList.remove("hidden");
    console.log("[CO] removed hidden from next sibling ✓");
  }
})();

// ─── BOOT ─────────────────────────────────────────────────────────────────────
const page = window.__TZMD__.createPage("checkout");
if (!page) { console.log("[CO] already active or bailing"); return; }
const { addObserver, addTimer, addListener, destroy } = page;
console.log("[CO] createPage success — activePage:", window.__TZMD__.activePage);

// ─── STATE ────────────────────────────────────────────────────────────────────
let isMounted     = false;
let plans         = [];
let domCards      = [];
let plansObserver = null;

const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';
const STAR  = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 18.4 6.1 21l1.2-6.5L2.5 9.9l6.6-.9z"/></svg>';

// ─── PURE HELPERS ─────────────────────────────────────────────────────────────
function getPrice(card) {
  const text = card?.querySelector(":scope > div:first-child span:last-child")?.textContent || "";
  return parseFloat(text.replace(/[^0-9.]/g, ""));
}
function formatCurrency(amount) {
  return amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function isSelected(card) { return card?.classList.contains("border-2"); }
function getBilled(price, months) {
  const total = price * months;
  if (months === 3) return `Billed every 3 months ($${formatCurrency(total)} total)`;
  if (months === 6) return `Billed every 6 months ($${formatCurrency(total)} total)`;
  return `Billed annually ($${formatCurrency(total)} total)`;
}
function getSavings(monthlyPrice, discountedPrice) {
  const savings = (monthlyPrice - discountedPrice) * 12;
  return `Save $${formatCurrency(savings)}/year vs monthly`;
}
function getPlans(cards) {
  const monthlyPrice = getPrice(cards[0]);
  return [
    { id: "quarterly", name: "Quarterly Program", price: getPrice(cards[1]), badge: "RECOMMENDED", badgeStyle: "green", check: true, billed: getBilled(getPrice(cards[1]), 3), save: getSavings(monthlyPrice, getPrice(cards[1])), selected: isSelected(cards[1]) },
    { id: "sixmonth", name: "6 Month Program", price: getPrice(cards[2]), badge: "POPULAR UPGRADE", badgeStyle: "green", check: true, billed: getBilled(getPrice(cards[2]), 6), save: getSavings(monthlyPrice, getPrice(cards[2])), selected: isSelected(cards[2]) },
    { id: "twelvemonth", name: "12 Month Program", price: getPrice(cards[3]), badge: "BEST VALUE", badgeStyle: "green", check: true, billed: getBilled(getPrice(cards[3]), 12), save: getSavings(monthlyPrice, getPrice(cards[3])), selected: isSelected(cards[3]) },
    { id: "monthly", name: "", price: monthlyPrice, badge: "Starter Monthly", badgeStyle: "gray", check: false, billed: "Billed monthly, cancel anytime", notes: ["Most patients upgrade after their first month.", "Medication pricing may vary month to month."], selected: isSelected(cards[0]) },
  ];
}
function planHTML(p) {
  const badge = p.badge ? `<span class="prog-plan-badge prog-${p.badgeStyle}">${p.check ? CHECK : ""}${p.badge}</span>` : "";
  const name  = p.name ? `<div class="prog-plan-name">${p.name}</div>` : "";
  const save  = p.save ? `<div class="prog-plan-save">${p.save}</div>` : "";
  const notes = (p.notes || []).map(n => `<div class="prog-plan-note">${n}</div>`).join("");
  return `<div class="prog-plan-card ${p.selected ? "prog-selected" : ""}" data-id="${p.id}" role="radio" aria-checked="${p.selected}" tabindex="0">
    ${badge}<div class="prog-plan-row"><span class="prog-plan-radio"></span>
    <div class="prog-plan-content">${name}
    <div class="prog-plan-price"><span class="prog-amt">$${p.price}</span><span class="prog-per">/mo</span></div>
    <div class="prog-plan-billed">${p.billed}</div>${save}${notes}</div></div></div>`;
}

// ─── MOUNT ────────────────────────────────────────────────────────────────────
function mountCheckoutUI() {
  console.log("[CO] mountCheckoutUI — isMounted:", isMounted, "activePage:", window.__TZMD__.activePage);
  if (isMounted) { console.log("[CO] already mounted, skip"); return; }

  const container = document.getElementById("script-container");
  if (!container) { console.log("[CO] no script-container"); return; }

  container.innerHTML = `
<style>
#script-container { width: 100%; }
.prog-checkout { --prog-green: #3D5C2A; --prog-green-save: #4F8A37; --prog-ink: #1C1C1A; --prog-muted: #5B6470; --prog-border: #E7E7E4; --prog-radio-off: #AEB1B8; font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; width: 100%; background: transparent; color: var(--prog-ink); }
.prog-checkout, .prog-checkout * { box-sizing: border-box; margin: 0; padding: 0; -webkit-font-smoothing: antialiased; }
.prog-head { text-align: center; padding: 6px 16px 0; }
.prog-title { font-size: 14.5px; font-weight: 700; line-height: 1.22; letter-spacing: -.2px; }
.prog-title .prog-g { color: var(--prog-green); }
.prog-review { color: var(--prog-muted); font-size: 8.5px; font-weight: 500; line-height: 1.5; margin-top: 7px; padding: 0 8px; }
.prog-stat { font-size: 10px; font-weight: 700; line-height: 1.4; margin-top: 9px; padding: 0 6px; }
.prog-select { padding: 14px 16px 0; }
.prog-select h2 { font-size: 11.5px; font-weight: 700; letter-spacing: -.2px; }
.prog-select p { color: var(--prog-muted); font-size: 8.5px; font-weight: 500; margin-top: 3px; }
.prog-plans { padding: 8px 16px 0; display: flex; flex-direction: column; gap: 6px; }
.prog-plan-card { position: relative; background: #fff; border: 2px solid var(--prog-border); border-radius: 10px; padding: 7px 11px; cursor: pointer; transition: border-color .15s ease, background .15s ease; }
.prog-plan-card.prog-selected { border-color: var(--prog-green); background: #FBFCF8; }
.prog-plan-badge { display: inline-flex; align-items: center; gap: 3px; margin-left: 20px; margin-bottom: 3px; font-size: 6.5px; font-weight: 700; letter-spacing: .3px; line-height: 1; padding: 3px 6px; border-radius: 999px; white-space: nowrap; }
.prog-plan-badge.prog-green { background: var(--prog-green); color: #fff; }
.prog-plan-badge.prog-gray { background: #EDEDEA; color: #4A4D52; font-weight: 600; }
.prog-plan-badge svg { width: 7px; height: 7px; }
.prog-plan-row { display: flex; gap: 7px; align-items: flex-start; }
.prog-plan-radio { position: relative; flex: none; width: 15px; height: 15px; margin-top: 1px; border-radius: 50%; border: 1.5px solid var(--prog-radio-off); transition: border-color .15s ease; }
.prog-plan-radio::after { content: ''; position: absolute; top: 50%; left: 50%; width: 7px; height: 7px; border-radius: 50%; background: transparent; transform: translate(-50%, -50%); transition: background .15s ease; }
.prog-plan-card.prog-selected .prog-plan-radio { border-color: var(--prog-green); }
.prog-plan-card.prog-selected .prog-plan-radio::after { background: var(--prog-green); }
.prog-plan-content { flex: 1; min-width: 0; }
.prog-plan-name { font-size: 11px; font-weight: 700; color: var(--prog-ink); line-height: 1.05; }
.prog-plan-price { display: flex; align-items: flex-end; margin-top: 1px; line-height: 1; }
.prog-plan-price .prog-amt { font-size: 15px; font-weight: 700; color: var(--prog-ink); letter-spacing: -.3px; }
.prog-plan-price .prog-per { font-size: 8px; font-weight: 500; color: var(--prog-muted); margin-left: 3px; padding-bottom: 2px; }
.prog-plan-billed { font-size: 9px; font-weight: 500; color: var(--prog-muted); margin-top: 3px; line-height: 1.2; }
.prog-plan-save { font-size: 9px; font-weight: 600; color: var(--prog-green-save); margin-top: 2px; line-height: 1.2; }
.prog-plan-note { font-size: 9px; font-weight: 500; color: var(--prog-muted); margin-top: 2px; line-height: 1.2; }
.prog-trust { margin: 11px 16px 0; display: flex; align-items: center; gap: 9px; background: #EEF2EC; border: 1px solid #E0E8D8; border-radius: 10px; padding: 9px 12px; }
.prog-trust svg { width: 19px; height: 19px; color: var(--prog-green); flex: none; }
.prog-trust .prog-t1 { font-size: 9.5px; font-weight: 700; color: var(--prog-green); line-height: 1.3; }
.prog-trust .prog-t2 { font-size: 8.5px; font-weight: 500; color: var(--prog-ink); margin-top: 1px; }
.prog-testi { margin: 13px 16px 16px; display: flex; align-items: center; gap: 12px; }
.prog-avatar { flex: none; width: 40px; height: 40px; border-radius: 50%; background: #DEDFE6; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600; color: #3A3F4A; letter-spacing: .5px; }
.prog-testi .prog-stars { display: flex; gap: 1.5px; color: var(--prog-green); }
.prog-testi .prog-stars svg { width: 10px; height: 10px; }
.prog-testi .prog-quote { font-size: 9.5px; font-style: italic; font-weight: 600; color: var(--prog-ink); margin-top: 4px; line-height: 1.35; }
.prog-testi .prog-by { font-size: 8.5px; font-weight: 500; color: var(--prog-muted); margin-top: 4px; }
</style>
<div class="prog-checkout">
  <div class="prog-head">
    <h1 class="prog-title">Lina, choose your<br><span class="prog-g">Tirzepatide</span> program</h1>
    <p class="prog-review">Reviewed and prescribed by a licensed U.S. physician<br>before treatment begins.</p>
    <p class="prog-stat">Patients lose an average of 15–20%* of body weight<br>in their first year.</p>
  </div>
  <div class="prog-select"><h2>Select your plan</h2><p>All plans include medication, supplies, program, and support.</p></div>
  <div class="prog-plans" id="prog-plans"></div>
  <div class="prog-trust">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/></svg>
    <div><div class="prog-t1">No charge unless approved by your physician.</div><div class="prog-t2">If approved, your treatment begins.</div></div>
  </div>
  <div class="prog-testi">
    <div class="prog-avatar">RM</div>
    <div><div class="prog-stars" id="prog-stars"></div><div class="prog-quote">"Down 28 lbs in 3 months and my energy is back."</div><div class="prog-by">— Rachel M., Dallas</div></div>
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
    const cards = document.querySelectorAll("ul.relative.mt-5.flex.flex-col.gap-3 > li");
    console.log("[CO] initializePlans — cards found:", cards.length);
    if (cards.length < 4) return false;
    domCards = [...cards];
    plans    = getPlans(cards);
    render();
    return true;
  }

  if (!initializePlans()) {
    plansObserver = new MutationObserver(() => {
      if (initializePlans()) { plansObserver.disconnect(); plansObserver = null; }
    });
    plansObserver.observe(document.body, { childList: true, subtree: true });
    addObserver(plansObserver);
  }

  const indexMap = { monthly: 0, quarterly: 1, sixmonth: 2, twelvemonth: 3 };

  function selectPlan(id) {
    if (!isMounted) return;
    plans.forEach(p => (p.selected = p.id === id));
    wrap.querySelectorAll(".prog-plan-card").forEach(c => {
      const on = c.dataset.id === id;
      c.classList.toggle("prog-selected", on);
      c.setAttribute("aria-checked", on);
    });
    const domCard = domCards[indexMap[id]];
    if (domCard) domCard.click();
  }

  addListener(wrap, "click", e => { const c = e.target.closest(".prog-plan-card"); if (c) selectPlan(c.dataset.id); });
  addListener(wrap, "keydown", e => { if (e.key === " " || e.key === "Enter") { const c = e.target.closest(".prog-plan-card"); if (c) { e.preventDefault(); selectPlan(c.dataset.id); } } });
  document.getElementById("prog-stars").innerHTML = STAR.repeat(5);
}

// ─── UNMOUNT ──────────────────────────────────────────────────────────────────
function unmountCheckoutUI() {
  console.log("[CO] unmountCheckoutUI — isMounted:", isMounted, "activePage:", window.__TZMD__.activePage);
  const container = document.getElementById("script-container");
  if (!container) { console.log("[CO] unmount — no container"); return; }

  console.log("[CO] unmount — clearing container, widget present:", !!document.getElementById("tzmd-glp1-widget"));
  container.innerHTML = "";
  isMounted = false;
  plans     = [];
  domCards  = [];

  if (plansObserver) { plansObserver.disconnect(); plansObserver = null; }
  console.log("[CO] unmount complete");
}

// ─── PAGE DETECTION ───────────────────────────────────────────────────────────
function isCheckoutPage() {
  const found = [...document.querySelectorAll("button")].some(btn => btn.textContent.trim() === "Start My Doctor Review");
  return found;
}

function syncCheckoutUI() {
  const checkout = isCheckoutPage();
  console.log("[CO] syncCheckoutUI — isCheckoutPage:", checkout, "activePage:", window.__TZMD__.activePage, "isMounted:", isMounted);
  if (checkout) {
    mountCheckoutUI();
  } else {
    unmountCheckoutUI();
  }
}

// ─── BOOT ─────────────────────────────────────────────────────────────────────
let syncTimer = null;

function debouncedSync() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    // ── CRITICAL GUARD ──────────────────────────────────────────────────────
    // destroy() disconnects pageObserver but cannot cancel this timer since
    // syncTimer is module-level and not in disposables. Without this guard,
    // a pending syncTimer fires after checkout is destroyed and
    // unmountCheckoutUI() wipes whatever the new page injected.
    const currentPage = window.__TZMD__?.activePage;
    console.log("[CO] debouncedSync fired — currentPage:", currentPage);
    if (currentPage !== "checkout") {
      console.log("[CO] debouncedSync ABORTED — not checkout page, activePage:", currentPage);
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

console.log("[CO] script fully initialized ✓ activePage:", window.__TZMD__.activePage);