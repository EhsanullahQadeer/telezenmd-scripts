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

// ─── BOOT ─────────────────────────────────────────────────────────────────────
console.log("[MED] script start — activePage:", window.__TZMD__.activePage);
const page = window.__TZMD__.createPage("medication");
if (!page) { console.log("[MED] already active, bailing"); return; }
const { addObserver, addTimer, addListener, destroy } = page;
console.log("[MED] createPage success");

// ─── CONTAINER ────────────────────────────────────────────────────────────────
const container = document.getElementById("script-container");
if (!container) { console.log("[MED] no script-container, bailing"); return; }

// ─── SECTION VISIBILITY ───────────────────────────────────────────────────────
// Store a direct DOM reference when hiding so we can restore it even after
// React removes script-container during back-navigation (getElementById → null).
let hiddenSection = null;

function hideOriginalSection() {
  const next = container.nextElementSibling;
  console.log("[MED] hideOriginalSection — next:", next?.className?.slice(0,60), "has hidden:", next?.classList.contains("hidden"));
  if (next && !next.classList.contains("hidden")) {
    hiddenSection = next;
    next.classList.add("hidden");
    console.log("[MED] added hidden ✓");
  }
}

function restoreOriginalSection() {
  console.log("[MED] restoreOriginalSection — hiddenSection:", !!hiddenSection, "has hidden:", hiddenSection?.classList.contains("hidden"));
  if (hiddenSection?.classList.contains("hidden")) {
    hiddenSection.classList.remove("hidden");
    console.log("[MED] removed hidden ✓");
  }
  hiddenSection = null;
}

// ─── ACTIVE FLAG ──────────────────────────────────────────────────────────────
let medicationActive = true;

// ─── CLEANUP REGISTRY OVERRIDE ────────────────────────────────────────────────
window.__TZMD__.cleanup["medication"] = function() {
  console.log("[MED] cleanup called — medicationActive:", medicationActive, "activePage:", window.__TZMD__.activePage);
  medicationActive = false;
  clearTimeout(domDebounceTimer);
  // Restore via stored reference — script-container may already be gone from
  // the DOM when React navigates back, so getElementById would return null.
  restoreOriginalSection();
  const c = document.getElementById("script-container");
  console.log("[MED] cleanup — script-container still in DOM:", !!c);
  if (c) {
    console.log("[MED] cleanup — clearing container.innerHTML");
    c.innerHTML = "";
  }
  destroy();
  console.log("[MED] cleanup done — activePage now:", window.__TZMD__.activePage);
};

// ─── DOM OBSERVER ─────────────────────────────────────────────────────────────
let domDebounceTimer = null;

const domObserver = new MutationObserver(() => {
  clearTimeout(domDebounceTimer);
  domDebounceTimer = setTimeout(() => {
    if (!medicationActive) {
      console.log("[MED] domObserver fired but medicationActive=false, ignoring");
      return;
    }
    const widget       = document.getElementById("tzmd-glp1-widget");
    const hasBaskCards = [...document.querySelectorAll("h1")].some(h =>
      h.textContent.trim() === "Personalized Tirzepatide Program" ||
      h.textContent.trim() === "Personalized Semaglutide Program"
    );
    console.log("[MED] domObserver debounce — widget:", !!widget, "hasBaskCards:", hasBaskCards, "activePage:", window.__TZMD__.activePage);

    if (!widget && !hasBaskCards) {
      // Call the full cleanup registry — not bare destroy() — so it also
      // removes "hidden" from the sibling. When the user clicks Back (no
      // new script runs), only the domObserver detects the navigation away,
      // so it must be the one to restore the hidden section.
      console.log("[MED] domObserver — both gone, running full cleanup");
      window.__TZMD__.cleanup["medication"]?.();
      return;
    }
    console.log("[MED] domObserver — still on med page, hiding section");
    hideOriginalSection();
  }, 150);
});
domObserver.observe(document.body, { childList: true, subtree: true });
addObserver(domObserver);

// ─── FIND CONTINUE BUTTON ─────────────────────────────────────────────────────
function findContinueButton() {
  return [...document.querySelectorAll("button")]
    .find(btn => btn.textContent.trim() === "Continue") ?? null;
}

// ─── WIDGET HTML + STYLES ─────────────────────────────────────────────────────
console.log("[MED] injecting widget HTML");
container.innerHTML = `
<style>
#script-container { width: 100%; }
#tzmd-glp1-widget {
  --primary-green: #3d5c2a; --medium-green: #6b8f4e; --sage-green: #a8bc8a;
  --ink: #1c1c1a; --white: #ffffff; --page-bg: #fdfdfd; --border: #e7e7e4;
  --muted: rgba(28, 28, 26, 0.62);
}
#tzmd-glp1-widget * { box-sizing: border-box; }
#tzmd-glp1-widget .headline { text-align: center; font-size: 32px; line-height: 1.2; font-weight: 600; color: var(--ink); letter-spacing: -0.3px; }
#tzmd-glp1-widget .headline .green { color: var(--primary-green); }
#tzmd-glp1-widget .subtitle { text-align: center; font-size: 12px; color: var(--ink); padding: 9px 16px 0; line-height: 1.35; font-weight: 400; letter-spacing: -0.2px; white-space: nowrap; }
#tzmd-glp1-widget .features { position: relative; margin: 15px 0 0; border: 1px solid var(--border); border-radius: 18px; padding: 6px 0; }
#tzmd-glp1-widget .frow { display: grid; grid-template-columns: repeat(3, 1fr); }
#tzmd-glp1-widget .fcell { display: flex; flex-direction: column; align-items: center; justify-content: flex-start; text-align: center; padding: 12px 3px 11px; gap: 8px; }
#tzmd-glp1-widget .ficon { width: 40px; height: 40px; color: var(--primary-green); display: flex; align-items: center; justify-content: center; }
#tzmd-glp1-widget .ficon img { width: 100%; height: 100%; object-fit: contain; }
#tzmd-glp1-widget .flabel { font-size: 9.5px; line-height: 1.4; font-weight: 500; color: var(--ink); white-space: nowrap; letter-spacing: -0.1px; }
#tzmd-glp1-widget .features .vdiv { position: absolute; width: 1px; background: var(--border); }
#tzmd-glp1-widget .features .hdiv { position: absolute; top: 50%; height: 1px; background: var(--border); }
#tzmd-glp1-widget .features .hdiv-1 { left: 24px; width: calc(33.33% - 42px); }
#tzmd-glp1-widget .features .hdiv-2 { left: calc(33.33% + 18px); width: calc(33.33% - 36px); }
#tzmd-glp1-widget .features .hdiv-3 { left: calc(66.66% + 18px); right: 24px; }
.med-list, .med-list * { box-sizing: border-box; margin: 0; padding: 0; -webkit-font-smoothing: antialiased; }
.med-list { width: 100%; margin-top: 15px; background: transparent; }
.med-card { position: relative; background: #fff; border: 2px solid #e7e7e4; border-radius: 15px; padding: 15px 17px; margin-bottom: 15px; cursor: pointer; transition: border-color .15s ease; }
.med-card:last-child { margin-bottom: 0; }
.med-card.selected { border-color: #3d5c2a; }
.med-card.has-badge { padding-top: 44px; }
.med-badge { position: absolute; top: 6px; left: 11px; display: inline-flex; align-items: center; gap: 4px; background: #3d5c2a; color: #fff; font-size: 10.5px; font-weight: 600; letter-spacing: .3px; padding: 6px 11px; border-radius: 999px; white-space: nowrap; line-height: 1; }
.med-badge svg { width: 9px; height: 9px; display: block; flex: none; }
.med-radio { position: absolute; right: 16px; top: 39px; width: 23px; height: 23px; border-radius: 50%; border: 1.5px solid #a8aaae; transition: border-color .15s ease; }
.med-card.has-badge .med-radio { top: 58px; }
.med-radio::after { content: ''; position: absolute; inset: 4px; border-radius: 50%; background: transparent; transition: background .15s ease; }
.med-card.selected .med-radio { border-color: #3d5c2a; }
.med-card.selected .med-radio::after { background: #3d5c2a; }
.med-body { display: flex; gap: 30px; align-items: stretch; }
.med-image { flex: none; width: 70px; min-height: 118px; border-radius: 8px; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.med-image img { width: 100%; height: 100%; object-fit: contain; display: block; }
.med-content { flex: 1; min-width: 0; padding-right: 6px; }
.med-name {margin-top: 6px; font-size: 30px; font-weight: 700; color: #1c1c1a; letter-spacing: -.3px; line-height: 1.1; }
.med-starting { font-size: 11.5px; font-weight: 500; color: #5b6470; margin-top: 6px; }
.med-price { display: flex; align-items: flex-end; color: #3d5c2a; font-weight: 700; margin-top: 2px; line-height: 1; }
.med-price .cur { font-size: 19px; align-self: flex-start; margin-top: 4px; margin-right: 1px; }
.med-price .amt { font-size: 30px; letter-spacing: -.8px; }
.med-price .star { font-size: 14px; align-self: flex-start; margin-top: 2px; font-weight: 600; }
.med-price .per { font-size: 14px; font-weight: 600; margin-left: 2px; padding-bottom: 4px; }
.med-divider { height: 1px; background: #e7e7e4; margin: 11px 0; }
.med-desc { font-size: 18px; margin-top: 14px;max-width: 400px; line-height: 1.5; color: #3f4045; font-weight: 400; padding-right: 26px; }
@media (max-width: 500px) { #tzmd-glp1-widget .med-content { padding-right: 4px; } #tzmd-glp1-widget .med-desc { font-size: 14px; padding-right: 24px; } }
.continue-btn { position: relative; width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px; background: #1c1c1a; color: #fff; border: none; border-radius: 14px; padding: 17px 24px; margin-top: 15px; font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 15px; font-weight: 600; letter-spacing: .2px; cursor: pointer; -webkit-font-smoothing: antialiased; transition: background .15s ease, transform .05s ease; }
.continue-btn:hover { background: #000; }
.continue-btn:active { transform: translateY(1px); }
.continue-btn:focus-visible { outline: 3px solid #3d5c2a; outline-offset: 2px; }
.continue-btn .arrow { position: absolute; right: 24px; top: 50%; transform: translateY(-50%); width: 20px; height: 20px; flex: none; }
.continue-btn[disabled] { opacity: .5; cursor: not-allowed; }
.med-card.skeleton { pointer-events: none; }
.med-card.skeleton .med-name, .med-card.skeleton .med-starting, .med-card.skeleton .med-price, .med-card.skeleton .med-desc { background: #e7e7e4; color: transparent; border-radius: 6px; animation: shimmer 1.2s infinite; }
.med-card.skeleton .med-image img { opacity: 0; }
.med-card.skeleton .med-radio { background: #e7e7e4; border-color: #e7e7e4; animation: shimmer 1.2s infinite; }
@keyframes shimmer { 0%, 100% { opacity: 1; } 50% { opacity: .4; } }
</style>
<div id="tzmd-glp1-widget">
  <div class="headline">Choose Your<br /><span class="green">GLP-1</span> Medication</div>
  <div class="subtitle">Both are clinically proven. Here's how most patients choose.</div>
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
  <div id="med-cards" class="med-list"></div>
  <button id="continue-btn" class="continue-btn" type="button">
    Continue to Plan Selection
    <svg class="arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>
  </button>
</div>
`;
console.log("[MED] widget injected, tzmd-glp1-widget exists:", !!document.getElementById("tzmd-glp1-widget"));

hideOriginalSection();

// ─── DATA ─────────────────────────────────────────────────────────────────────
const medications = [
  { id: "tirzepatide", name: "Tirzepatide", price: "199", badge: "MOST POPULAR", image: "https://res.cloudinary.com/dcl5ecseg/image/upload/v1781645810/tirzepatide_rxgrcd.png", description: "The newest and most powerful GLP-1. Patients typically lose 20% or more of body weight. Most patients choose this.", selected: true },
  { id: "semaglutide", name: "Semaglutide", price: "129", badge: "", image: "https://res.cloudinary.com/dcl5ecseg/image/upload/v1781645969/semaglutide_vdtcaa.png", description: "The original GLP-1 — clinically proven with millions of patients worldwide. A strong option for those who prefer to start with the original GLP-1.", selected: false },
];
const STAR = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 18.4 6.1 21l1.2-6.5L2.5 9.9l6.6-.9z"/></svg>';

function cardHTML(med) {
  const img = med.image ? `<img src="${med.image}" alt="${med.name}">` : `<span class="ph">Vial image<br>here</span>`;
  return `<div class="med-card ${med.badge ? "has-badge" : ""} ${med.selected ? "selected" : ""}" data-id="${med.id}" role="radio" aria-checked="${med.selected}" tabindex="0">
    ${med.badge ? `<div class="med-badge">${STAR}${med.badge}</div>` : ""}
    <div class="med-radio"></div>
    <div class="med-body"><div class="med-image">${img}</div>
    <div class="med-content"><h3 class="med-name">${med.name}</h3>
    <p class="med-desc">${med.description}</p></div></div></div>`;
}

function skeletonHTML(med) {
  return `<div class="med-card skeleton ${med.badge ? "has-badge" : ""}">
    ${med.badge ? `<div class="med-badge">${STAR}${med.badge}</div>` : ""}
    <div class="med-radio"></div>
    <div class="med-body"><div class="med-image"><img src="${med.image}" alt=""></div>
    <div class="med-content"><h3 class="med-name">${med.name}</h3><div class="med-starting">Starting at</div>
    <div class="med-price"><span class="cur">$</span><span class="amt">${med.price}</span><span class="star">*</span><span class="per">/mo</span></div>
    <div class="med-divider"></div><p class="med-desc">${med.description}</p></div></div></div>`;
}

const medContainer = document.getElementById("med-cards");
console.log("[MED] medContainer found:", !!medContainer);

function render() {
  console.log("[MED] render() — widget still in DOM:", !!document.getElementById("tzmd-glp1-widget"), "activePage:", window.__TZMD__.activePage);
  medContainer.innerHTML = medications.map(cardHTML).join("");
}
function renderSkeleton() { medContainer.innerHTML = medications.map(skeletonHTML).join(""); }

const baskButtons = {};

function setupCustomCards() {
  baskButtons.semaglutide = [...document.querySelectorAll("h1")].find(el => el.textContent.trim() === "Personalized Semaglutide Program")?.closest("button");
  baskButtons.tirzepatide = [...document.querySelectorAll("h1")].find(el => el.textContent.trim() === "Personalized Tirzepatide Program")?.closest("button");

  if (!baskButtons.semaglutide || !baskButtons.tirzepatide) {
    console.log("[MED] setupCustomCards — buttons not found yet, retrying... medicationActive:", medicationActive);
    addTimer(setTimeout(setupCustomCards, 500));
    return;
  }

  console.log("[MED] Both buttons found — widget in DOM:", !!document.getElementById("tzmd-glp1-widget"), "activePage:", window.__TZMD__.activePage);
  const observeTarget = baskButtons.semaglutide.closest("form") || baskButtons.semaglutide.parentElement;
  renderSkeleton();

  addTimer(setTimeout(() => {
    console.log("[MED] 1s timer fired — widget in DOM:", !!document.getElementById("tzmd-glp1-widget"), "activePage:", window.__TZMD__.activePage, "medicationActive:", medicationActive);
    const resolved = baskButtons.semaglutide.classList.contains("ring-2") ? "semaglutide"
      : baskButtons.tirzepatide.classList.contains("ring-2") ? "tirzepatide" : null;
    console.log("[MED] Resolved selection:", resolved);
    medications.forEach(m => (m.selected = m.id === (resolved || "tirzepatide")));
    render();
    console.log("[MED] render() complete — widget still in DOM:", !!document.getElementById("tzmd-glp1-widget"));
  }, 1000));

  const selectionObserver = new MutationObserver(() => {
    const semSel  = baskButtons.semaglutide.classList.contains("ring-2");
    const tirzSel = baskButtons.tirzepatide.classList.contains("ring-2");
    const id      = semSel ? "semaglutide" : tirzSel ? "tirzepatide" : null;
    if (id && medications.find(m => m.selected)?.id !== id) {
      console.log("[MED] Selection changed to", id);
      medications.forEach(m => (m.selected = m.id === id));
      render();
    }
  });
  selectionObserver.observe(observeTarget, { attributes: true, attributeFilter: ["class"], subtree: true });
  addObserver(selectionObserver);
}

setupCustomCards();

function selectCard(id) {
  medications.forEach(m => (m.selected = m.id === id));
  medContainer.querySelectorAll(".med-card").forEach(card => {
    const on = card.dataset.id === id;
    card.classList.toggle("selected", on);
    card.setAttribute("aria-checked", on);
  });
  if (baskButtons[id]) { baskButtons[id].click(); }
  else { console.warn(`[MED] Button not found for "${id}"`); }
}

addListener(medContainer, "click", e => { const card = e.target.closest(".med-card"); if (card) selectCard(card.dataset.id); });
addListener(medContainer, "keydown", e => { if (e.key === " " || e.key === "Enter") { const card = e.target.closest(".med-card"); if (card) { e.preventDefault(); selectCard(card.dataset.id); } } });
addListener(document.getElementById("continue-btn"), "click", () => {
  console.log("[MED] continue-btn clicked");
  findContinueButton()?.click();
});

console.log("[MED] script fully initialized ✓ activePage:", window.__TZMD__.activePage);