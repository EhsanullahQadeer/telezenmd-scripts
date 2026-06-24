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
    if (typeof onDestroy === "function") onDestroy();
    delete registry.cleanup[PAGE_ID];
    if (registry.activePage === PAGE_ID) registry.activePage = null;
    disposables.observers.forEach((o) => o.disconnect());
    disposables.timers.forEach((t) => clearTimeout(t));
    disposables.listeners.forEach(({ element, event, handler, options }) =>
      element.removeEventListener(event, handler, options));
    disposables.observers = [];
    disposables.timers = [];
    disposables.listeners = [];
  }
  registry.cleanup[PAGE_ID] = destroy;
  return { addObserver, addTimer, addListener, destroy };
};

// ─── CONFIG ───────────────────────────────────────────────────────────────────

const LP_CONFIG = {
  heroLine1:     "Lose Weight.",
  heroLine2:     "Keep It Off.",

  subheadPrefix: "Complete our",
  subheadAccent: "5-minute",
  subheadSuffix: "assessment to see if you qualify.",

  features: [
    {
      icon:  "clock",
      title: "5 Minutes",
      sub:   "Quick &amp; easy",
      left:  true,
    },
    {
      icon:  "physician",
      title: "Physician<br>Reviewed",
      sub:   "Board-certified<br>doctors",
    },
    {
      icon:  "card",
      title: "No Charge<br>Unless Approved",
      sub:   "You pay nothing<br>unless approved",
    },
  ],

  journeyHeading: "Your journey includes:",
  journeyItems: [
    "GLP-1 Medication",
    "Lose It For Life&trade; Program",
    "GLP-1 Nutrition Protocol&trade;",
    "Concierge Support",
  ],

  ctaText:    "Start My 5-Minute Assessment",
  secureText: "Your information is secure and confidential.",
};

// ─── ICONS ────────────────────────────────────────────────────────────────────

const LP_ICONS = {
  clock: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="24" cy="24" r="15"/><path d="M24 24 V14"/><path d="M24 24 L31 29"/></svg>`,

  physician: `<img src="https://res.cloudinary.com/dcl5ecseg/image/upload/v1782327343/physician_rymyk7.png" alt="Physician Reviewed" style="width:36px;height:36px;object-fit:contain;">`,

  card: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="14" width="30" height="20" rx="3.2"/><line x1="8" y1="20.5" x2="38" y2="20.5"/><rect x="29" y="28" width="13" height="10.5" rx="2.2" fill="var(--lp-circle-bg)"/><path d="M32 28 V25.7 A3.5 3.5 0 0 1 39 25.7 V28"/></svg>`,

  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 13 L9 18 L20 5"/></svg>`,

  shield: `<svg viewBox="0 0 64 74" fill="none"><path d="M32 3 L58 13.5 V35 C58 53 46.5 64.5 32 71 C17.5 64.5 6 53 6 35 V13.5 Z" fill="var(--lp-primary)"/><path d="M32 9 L52.5 17.3 V35 C52.5 49.6 43.5 59.2 32 64.8 C20.5 59.2 11.5 49.6 11.5 35 V17.3 Z" fill="none" stroke="var(--lp-sage)" stroke-width="1.6" opacity="0.85"/><path d="M22 36.5 L29 44 L43 27.5" fill="none" stroke="#FFFFFF" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,

  lock: `<svg viewBox="0 0 24 28" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="13" rx="2.4"/><path d="M7.5 11 V7 A4.5 4.5 0 0 1 16.5 7 V11"/></svg>`,

  chevron: `<svg viewBox="0 0 16 24" fill="none" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2 2 L12 12 L2 22"/></svg>`,
};

// ─── CSS ──────────────────────────────────────────────────────────────────────

const LP_CSS = `
  .lp-page {
    --lp-primary:            #3D5C2A;
    --lp-medium:             #6B8F4E;
    --lp-sage:               #A8BC8A;
    --lp-black:              #1C1C1A;
    --lp-white:              #FFFFFF;
    --lp-cream:              #F6F4ED;
    --lp-circle-bg:          #ECEDE3;
    --lp-box-bg:             #ECECE7;
    --lp-divider:            #D9D9CF;
    --button-hover-color:    #aab59f;
    --button-disabled-color: #aab59f;
  }
  .lp-page {
    margin: 0 auto;
    color: var(--lp-black);
    text-rendering: optimizeLegibility;
    box-sizing: border-box;
  }
  .lp-page *, .lp-page *::before, .lp-page *::after { box-sizing: border-box; margin: 0; padding: 0; }
  .lp-hero {
    font-weight: 800;
    line-height: 1.0;
    letter-spacing: -0.5px;
    font-size: 46px;
    margin-bottom: 18px;
  }
  .lp-hero .lp-green { color: var(--lp-primary); display: block; white-space: nowrap; }
  .lp-hero .lp-dark  { color: var(--lp-black);   display: block; white-space: nowrap; }
  .lp-subhead {
    font-size: 17px;
    font-weight: 400;
    line-height: 1.4;
    color: var(--lp-black);
    margin-bottom: 26px;
  }
  .lp-subhead .lp-accent { color: var(--lp-medium); font-weight: 600; }
  .lp-features {
    display: grid;
    grid-template-columns: 0.8fr 1.1fr 1.1fr;
    margin-bottom: 26px;
  }
  .lp-feature {
    padding: 0 5px;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }
  .lp-feature.lp-left { align-items: flex-start; text-align: left; padding-left: 0; padding-right: 8px; }
  .lp-feature + .lp-feature { border-left: 1px solid var(--lp-divider); padding-left: 10px; }
  .lp-icon-circle {
    width: 52px; height: 52px; border-radius: 50%;
    background: var(--lp-circle-bg);
    display: flex; align-items: center; justify-content: center;
    color: var(--lp-primary);
    margin-bottom: 10px;
  }
  .lp-icon-circle svg { width: 50px; height: 50px; }
  .lp-feature-title { color: var(--lp-medium); font-weight: 600; font-size: 14px; line-height: 1.22; margin-bottom: 3px; }
  .lp-feature-sub   { color: var(--lp-black);  font-weight: 400; font-size: 13px; line-height: 1.3; }
  .lp-journey {
    background: var(--lp-box-bg);
    border-radius: 16px;
    padding: 20px 20px 20px 16px;
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 20px;
  }
  .lp-shield { flex: 0 0 auto; color: var(--lp-primary); }
  .lp-shield svg { width: 62px; height: auto; display: block; }
  .lp-journey-head { color: var(--lp-medium); font-weight: 700; font-size: 15px; margin-bottom: 8px; }
  .lp-journey-list { list-style: none; }
  .lp-journey-list li {
    display: flex; align-items: center; gap: 9px;
    font-size: 15px; font-weight: 400; color: var(--lp-black);
    line-height: 1.2; padding: 3px 0;
  }
  .lp-check { flex: 0 0 auto; color: var(--lp-medium); }
  .lp-check svg { width: 14px; height: 14px; display: block; }
  .lp-cta {
    position: relative; width: 100%; border: none; cursor: pointer;
    background: var(--lp-black); color: var(--lp-white);
    border-radius: 40px; padding: 16px 22px;
    font-weight: 600;
    font-size: 15px; letter-spacing: 0.6px; text-transform: uppercase;
    text-align: center; transition: background .18s ease;
  }
  .lp-cta:hover    { background: var(--button-hover-color); }
  .lp-cta:disabled { background: var(--button-disabled-color); cursor: not-allowed; }
  .lp-cta:focus-visible { outline: 3px solid var(--lp-sage); outline-offset: 3px; }
  .lp-cta .lp-chevron {
    position: absolute; right: 22px; top: 50%;
    transform: translateY(-50%); display: flex;
  }
  .lp-cta .lp-chevron svg { width: 12px; height: 20px; }
  .lp-secure {
    display: flex; align-items: center; justify-content: center;
    gap: 8px; margin-top: 14px; font-size: 13px;
    color: #3a3a35; font-weight: 400;
  }
  .lp-secure svg { width: 12px; height: 15px; color: var(--lp-primary); }
  .lp-product-img {
    display: block;
    width: 100%;
    margin-top: 20px;
    border-radius: 12px;
    object-fit: cover;
    padding: 0 25px;
  }
  @media (max-width: 430px) {
    .lp-hero    { font-size: 11vw; }
    .lp-subhead { font-size: 4.4vw; }
  }
`;

// ─── BUILD ────────────────────────────────────────────────────────────────────

function buildLandingHTML(cfg, icons) {
  const featureCards = cfg.features.map((f) => `
    <div class="lp-feature${f.left ? " lp-left" : ""}">
      <div class="lp-icon-circle">${icons[f.icon]}</div>
      <div class="lp-feature-title">${f.title}</div>
      <div class="lp-feature-sub">${f.sub}</div>
    </div>`).join("");

  const journeyItems = cfg.journeyItems.map((item) => `
    <li><span class="lp-check">${icons.check}</span>${item}</li>`).join("");

  return `
<style>${LP_CSS}</style>
<main class="lp-page">

  <h1 class="lp-hero">
    <span class="lp-green">${cfg.heroLine1}</span>
    <span class="lp-dark">${cfg.heroLine2}</span>
  </h1>

  <p class="lp-subhead">
    ${cfg.subheadPrefix} <span class="lp-accent">${cfg.subheadAccent}</span> ${cfg.subheadSuffix}
  </p>

  <section class="lp-features">${featureCards}</section>

  <section class="lp-journey">
    <div class="lp-shield">${icons.shield}</div>
    <div class="lp-journey-body">
      <div class="lp-journey-head">${cfg.journeyHeading}</div>
      <ul class="lp-journey-list">${journeyItems}</ul>
    </div>
  </section>

  <button class="lp-cta">
    ${cfg.ctaText}
    <span class="lp-chevron">${icons.chevron}</span>
  </button>

  <div class="lp-secure">
    ${icons.lock}
    ${cfg.secureText}
  </div>

  <img class="lp-product-img" src="https://res.cloudinary.com/dcl5ecseg/image/upload/v1782330666/info-banner_ifobbh.png" alt="GLP-1 Treatment Products">

</main>`;
}

// ─── LIFECYCLE ────────────────────────────────────────────────────────────────
console.log("[LP] script start — activePage:", window.__TZMD__.activePage);

const lpPage = window.__TZMD__.createPage("landing", () => unmountLandingUI());
if (!lpPage) {
  console.log("[LP] already active or bailing");
  return;
}
const { addObserver, addListener, destroy } = lpPage;
console.log("[LP] createPage success");

let lpMounted = false;
let lpHiddenDiv = null;

function mountLandingUI() {
  if (lpMounted) return;
  const container = document.getElementById("script-container");
  if (!container) { console.log("[LP] no script-container"); return; }

  // Hide 2nd child immediately
  const orig = container.nextElementSibling;
  if (orig && !lpHiddenDiv) {
    orig.classList.add("hidden");
    lpHiddenDiv = orig;
    console.log("[LP] original content hidden ✓");
  }

  container.innerHTML = buildLandingHTML(LP_CONFIG, LP_ICONS);
  lpMounted = true;
  console.log("[LP] mounted ✓");

  // Wire our CTA → Bask's hidden Next button
  const ctaBtn = container.querySelector(".lp-cta");
  if (ctaBtn) {
    addListener(ctaBtn, "click", () => {
      const baskNext = [...document.querySelectorAll('button[type="button"]')]
        .find((b) => b.textContent.trim().startsWith("Next"));
      if (baskNext) {
        console.log("[LP] CTA clicked → triggering Bask Next");
        baskNext.click();
      } else {
        console.warn("[LP] Bask Next button not found");
      }
    });
  }
}

function unmountLandingUI() {
  if (lpHiddenDiv) {
    lpHiddenDiv.classList.remove("hidden");
    lpHiddenDiv = null;
    console.log("[LP] original content restored ✓");
  }
  const container = document.getElementById("script-container");
  if (container) container.innerHTML = "";
  lpMounted = false;
  console.log("[LP] unmounted ✓");
}

// Boot
mountLandingUI();

// Watch for SPA navigation away (script-container leaves DOM)
const lpObserver = new MutationObserver(() => {
  if (lpMounted && !document.getElementById("script-container")) {
    destroy();
  }
});
lpObserver.observe(document.body, { childList: true, subtree: true });
addObserver(lpObserver);
