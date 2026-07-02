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
    disposables.observers.forEach(o => o.disconnect());
    disposables.timers.forEach(t => clearTimeout(t));
    disposables.listeners.forEach(({ element, event, handler, options }) =>
      element.removeEventListener(event, handler, options));
    disposables.observers = [];
    disposables.timers   = [];
    disposables.listeners = [];
  }
  registry.cleanup[PAGE_ID] = destroy;
  return { addObserver, addTimer, addListener, destroy };
};

// ─── BOOT ─────────────────────────────────────────────────────────────────────
console.log("[BD] script start — activePage:", window.__TZMD__.activePage);
const page = window.__TZMD__.createPage("birthday", () => unmountBirthdayUI());
if (!page) { console.log("[BD] already active, bailing"); return; }
const { addObserver, addTimer, addListener, destroy } = page;
console.log("[BD] createPage success");

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const BD_CSS = `
.bd-wrap { width: 100%; font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; -webkit-font-smoothing: antialiased; }
.bd-wrap * { box-sizing: border-box; margin: 0; padding: 0; }
.bd-selects { display: grid; grid-template-columns: 1.5fr 0.9fr 1.2fr; gap: 10px; width: 100%; }
.bd-field { display: flex; flex-direction: column; gap: 8px; }
.bd-label { font-size: 11px; font-weight: 600; color: #5b6470; text-transform: uppercase; letter-spacing: 0.8px; padding-left: 4px; }
.bd-select {
  width: 100%; height: 80px; padding: 0 40px 0 20px;
  border: none; outline: 1px solid #47642e; border-radius: 16px;
  background: #fff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23221f1f' stroke-width='1.8' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") no-repeat right 16px center;
  color: #221f1f; font-family: inherit; font-size: 16px; font-weight: 600;
  appearance: none; -webkit-appearance: none; cursor: pointer;
  transition: outline-color .15s ease, outline-width .15s ease;
}
.bd-select:hover { outline-color: #D4D4D4; }
.bd-select:focus { outline: 2px solid #221f1f; }
.bd-select:required:invalid { color: #9ca3af; font-weight: 500; }
.bd-select option { font-weight: 500; color: #221f1f; }
@media (max-width: 380px) {
  .bd-selects { gap: 7px; }
  .bd-select { font-size: 14px; padding: 0 28px 0 14px; }
}
`;

// ─── STATE ────────────────────────────────────────────────────────────────────
let isMounted   = false;
let bdHiddenEls = [];
let bdHideObserver = null;

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function isBirthdayPage() {
  if (findSpinbutton("month")) return true;
  // iOS fallback: React Aria always wraps DateField in div[role="group"] regardless
  // of whether it renders spinbuttons or contenteditable textboxes for the segments.
  const container = document.getElementById("script-container");
  const next = container?.nextElementSibling;
  return !!next?.querySelector('div[role="group"]');
}

function findSpinbutton(label) {
  // Desktop: React Aria renders div[role="spinbutton"][aria-label]
  // iOS Safari: React Aria renders div[role="textbox"][contenteditable][aria-label]
  return (
    document.querySelector(`div[role="spinbutton"][aria-label="${label}"]`) ||
    document.querySelector(`div[role="textbox"][contenteditable][aria-label="${label}"]`) ||
    null
  );
}

// Read the current numeric value from a date segment regardless of platform.
// Desktop spinbuttons expose aria-valuenow; iOS textboxes use data-placeholder + textContent.
function getSegmentValue(el) {
  if (!el) return null;
  const avn = el.getAttribute("aria-valuenow");
  if (avn !== null) return Number(avn);
  if (el.getAttribute("data-placeholder") === "true") return null;
  const text = el.textContent?.trim().replace(/[^0-9]/g, "");
  return text ? Number(text) : null;
}

function tick(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── BAILOUT ──────────────────────────────────────────────────────────────────
// Called when Bask's layout or API has changed and our script can no longer
// safely target elements. Silently restores the original Bask UI and stops
// all our observers/listeners so nothing breaks in production.
function bailout(reason) {
  console.warn("[BD] bailout —", reason, "— restoring original Bask UI");
  destroy(); // triggers unmountBirthdayUI via TZMD onDestroy, then disconnects all observers/listeners
}

// Walk the React fiber tree upward from a DOM element.
// React Aria passes DateFieldState as a prop (not a hook), so we check
// both memoizedProps.state and the hook chain at every level.
// Logs found function names so we know what setter to call even if names differ.
function getDateFieldState(el) {
  const fiberKey = Object.keys(el).find(k =>
    k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$")
  );
  if (!fiberKey) { console.warn("[BD] getDateFieldState — no fiber key"); return null; }

  let fiber = el[fiberKey];
  let depth = 0;
  while (fiber && depth < 25) {
    const typeName = typeof fiber.type === "function"
      ? (fiber.type.displayName ?? fiber.type.name ?? "anon")
      : (typeof fiber.type === "string" ? fiber.type : "?");

    // ── Check memoizedProps.state (React Aria passes DateFieldState as prop)
    const props = fiber.memoizedProps;
    if (props?.state && typeof props.state === "object") {
      const s = props.state;
      const fns = Object.keys(s).filter(k => typeof s[k] === "function");
      console.log(`[BD] d=${depth} ${typeName} props.state fns:`, fns.join(",") || "(none)");
      if (typeof s.setSegment === "function")       return s;
      if (typeof s.setSegmentValue === "function")  return s;
      // Try other likely setter names
      const setter = fns.find(f => /set.*(seg|month|day|year|date|field)/i.test(f));
      if (setter) { console.log("[BD] using alt setter:", setter); return s; }
    }

    // ── Check hook chain memoizedState
    let hook = fiber.memoizedState;
    let hi = 0;
    while (hook) {
      const s = hook.memoizedState;
      if (s && typeof s === "object" && !Array.isArray(s)) {
        const fns = Object.keys(s).filter(k => typeof s[k] === "function");
        if (fns.length >= 3) {
          console.log(`[BD] d=${depth} ${typeName} hook${hi} fns:`, fns.join(","));
          if (fns.includes("setSegment"))       return s;
          if (fns.includes("setSegmentValue"))  return s;
        }
        // Check ref-wrapped state
        if (s.current && typeof s.current === "object") {
          const rf = Object.keys(s.current).filter(k => typeof s.current[k] === "function");
          if (rf.includes("setSegment") || rf.includes("setSegmentValue")) return s.current;
        }
      }
      hi++;
      hook = hook.next;
    }

    fiber = fiber.return;
    depth++;
  }
  console.warn("[BD] getDateFieldState — not found after", depth, "levels");
  return null;
}

// Track selections across all three dropdowns.
const bdSelection = { month: null, day: null, year: null };

// Re-fetch state after each setSegment so we always read the post-render
// DateFieldState — avoids the stale-closure problem where all calls fork
// from the same captured date and the last writer wins.
function freshState() {
  const spin = findSpinbutton("month");
  if (spin) return getDateFieldState(spin);
  // Fallback: walk fiber from any date segment or the group wrapper
  const container = document.getElementById("script-container");
  const next = container?.nextElementSibling;
  const group = next?.querySelector('div[role="group"]');
  const target = group?.querySelector('[role="spinbutton"],[role="textbox"][contenteditable]') ?? group ?? null;
  return target ? getDateFieldState(target) : null;
}

async function syncAllSegments() {
  const segments = [
    ["year",  bdSelection.year],
    ["month", bdSelection.month],
    ["day",   bdSelection.day],
  ];

  try {
    // Phase 1: apply all selected segments (year first anchors the CalendarDate).
    for (const [seg, val] of segments) {
      if (val === null) continue;
      const s = freshState();
      if (!s) {
        // If the spinbutton is still in the DOM but state is unreachable,
        // React Aria's API has changed — bail so original UI is restored.
        if (findSpinbutton("month")) {
          bailout("DateFieldState.setSegment not found — React Aria API may have changed");
        }
        return;
      }
      s.setSegment(seg, val);
      await tick(80);
    }

    // Phase 2: verify and retry only segments that didn't land.
    // When the "completing call" (last missing segment) fires React Aria's
    // onChange, a subsequent setSegment can overwrite that segment via a stale
    // displayValue. Retrying only the wrong segments avoids further overwrites.
    for (const [seg, val] of segments) {
      if (val === null) continue;
      const current = getSegmentValue(findSpinbutton(seg));
      // null means we can't verify (iOS may not expose the value yet) — skip retry
      if (current !== null && current !== val) {
        const s = freshState();
        if (!s) break;
        s.setSegment(seg, val);
        await tick(80);
      }
    }

    console.log("[BD] syncAllSegments — month:", getSegmentValue(findSpinbutton("month")),
      "day:", getSegmentValue(findSpinbutton("day")),
      "year:", getSegmentValue(findSpinbutton("year")));
  } catch (err) {
    console.error("[BD] syncAllSegments unexpected error —", err);
    bailout("unexpected error during segment sync");
  }
}

// ─── HIDE / RESTORE BASK BIRTHDAY ELEMENTS ───────────────────────────────────
// We MUST NOT use display:none on the date-group wrapper because that makes the
// spinbutton divs non-focusable, which breaks keyboard-event dispatch.
// Instead: collapse non-interactive wrappers (h4) and move the date group
// off-screen with position:fixed so spinbuttons stay fully focusable.
function hideEl(el, method) {
  if (!el || el.dataset.bdHidden) return;
  el.dataset.bdHidden = "1";
  el.dataset.bdStyle  = el.getAttribute("style") ?? "";
  const base = el.dataset.bdStyle ? el.dataset.bdStyle + "; " : "";
  if (method === "collapse") {
    el.style.cssText = base + "height:0!important;overflow:hidden!important;margin:0!important;padding:0!important;";
    console.log("[BD] hideEl collapse —", el.className.slice(0, 60));
  } else {
    el.style.cssText = base + "position:fixed!important;left:-9999px!important;top:0!important;opacity:0!important;pointer-events:none!important;";
    console.log("[BD] hideEl offscreen —", el.className.slice(0, 60));
  }
  bdHiddenEls.push(el);
}

function applyBirthdayHides() {
  if (!isMounted) return true;
  const container = document.getElementById("script-container");
  const next = container?.nextElementSibling;
  if (!next) { console.log("[BD] applyBirthdayHides — no next sibling"); return false; }

  const section = next.querySelector("section.relative") ?? next;
  console.log("[BD] applyBirthdayHides — section found:", !!section);

  const h4 = [...section.querySelectorAll("h4")].find(
    h => h.textContent.trim() === "When were you born?"
  );
  const h4Wrap   = h4?.closest(".flex.w-full.flex-col.break-words") ?? h4?.parentElement;
  const dateGroup = section.querySelector('div[role="group"]');
  const dateWrap  = dateGroup?.closest(".relative.flex.w-full.flex-col.gap-1") ?? dateGroup?.parentElement;

  console.log("[BD] applyBirthdayHides — h4:", !!h4, "h4Wrap:", !!h4Wrap, "dateGroup:", !!dateGroup, "dateWrap:", !!dateWrap);
  console.log("[BD] applyBirthdayHides — spinbuttons in DOM: month:", !!findSpinbutton("month"), "day:", !!findSpinbutton("day"), "year:", !!findSpinbutton("year"));

  // dateWrap is critical: without hiding it both UIs show simultaneously.
  // If it's gone Bask's layout changed — bail rather than show a broken dual-UI.
  if (!dateWrap) {
    bailout("cannot locate Bask date wrapper — layout may have changed");
    return false;
  }

  hideEl(h4Wrap,   "collapse");
  hideEl(dateWrap, "offscreen");
  return true;
}

function restoreBirthdayHides() {
  bdHiddenEls.forEach(el => {
    const orig = el.dataset.bdStyle;
    if (orig) el.setAttribute("style", orig);
    else      el.removeAttribute("style");
    delete el.dataset.bdHidden;
    delete el.dataset.bdStyle;
  });
  bdHiddenEls = [];
}

// ─── MOUNT ────────────────────────────────────────────────────────────────────
function mountBirthdayUI() {
  if (isMounted) return;
  const container = document.getElementById("script-container");
  if (!container)       { console.log("[BD] no script-container"); return; }
  if (!isBirthdayPage()) { console.log("[BD] not on birthday page"); return; }

  try {
    // Build option lists
    const now     = new Date();
    const maxYear = now.getFullYear() - 18;
    const minYear = now.getFullYear() - 100;

    const monthOpts = MONTHS.map((m, i) =>
      `<option value="${i + 1}">${m}</option>`
    ).join("");

    const dayOpts = Array.from({ length: 31 }, (_, i) =>
      `<option value="${i + 1}">${i + 1}</option>`
    ).join("");

    let yearOpts = "";
    for (let y = maxYear; y >= minYear; y--) {
      yearOpts += `<option value="${y}">${y}</option>`;
    }

    container.innerHTML = `
<style>${BD_CSS}</style>
<div class="bd-wrap">
  <h4 style="margin-bottom: 40px; color: rgb(34, 31, 31);" class="!no-underline text-brand-heading-text font-brand-header text-3xl font-bold" style="color: rgb(34, 31, 31);">When were you born?</h4>
  <div class="bd-selects">
    <div class="bd-field">
      <label class="bd-label" for="bd-month">Month</label>
      <select class="bd-select" id="bd-month" required>
        <option value="" disabled selected>Month</option>
        ${monthOpts}
      </select>
    </div>
    <div class="bd-field">
      <label class="bd-label" for="bd-day">Day</label>
      <select class="bd-select" id="bd-day" required>
        <option value="" disabled selected>Day</option>
        ${dayOpts}
      </select>
    </div>
    <div class="bd-field">
      <label class="bd-label" for="bd-year">Year</label>
      <select class="bd-select" id="bd-year" required>
        <option value="" disabled selected>Year</option>
        ${yearOpts}
      </select>
    </div>
  </div>
</div>
`;

    isMounted = true;
    console.log("[BD] HTML injected ✓");

    // Pre-fill from whatever Bask already has in the spinbuttons
    const mSpin = findSpinbutton("month");
    const dSpin = findSpinbutton("day");
    const ySpin = findSpinbutton("year");
    const mSel  = document.getElementById("bd-month");
    const dSel  = document.getElementById("bd-day");
    const ySel  = document.getElementById("bd-year");

    // Pre-fill selects from Bask's date segments if they already have values
    const mVal = getSegmentValue(mSpin);
    const dVal = getSegmentValue(dSpin);
    const yVal = getSegmentValue(ySpin);
    if (mVal) { mSel.value = mVal; bdSelection.month = mVal; }
    if (dVal) { dSel.value = dVal; bdSelection.day   = dVal; }
    if (yVal) { ySel.value = yVal; bdSelection.year  = yVal; }
    console.log("[BD] pre-filled month/day/year:", mVal, dVal, yVal);

    // applyBirthdayHides returns false (and calls bailout internally) if Bask's
    // layout has changed and we can't locate the elements to hide.
    const hideOk = applyBirthdayHides();
    if (!hideOk) return;

    // Each select update records its value then re-applies all known segments together
    addListener(mSel, "change", () => {
      bdSelection.month = parseInt(mSel.value, 10);
      syncAllSegments();
    });
    addListener(dSel, "change", () => {
      bdSelection.day = parseInt(dSel.value, 10);
      syncAllSegments();
    });
    addListener(ySel, "change", () => {
      bdSelection.year = parseInt(ySel.value, 10);
      syncAllSegments();
    });
  } catch (err) {
    console.error("[BD] mountBirthdayUI unexpected error —", err);
    bailout("unexpected error during mount");
  }
}

// ─── UNMOUNT ──────────────────────────────────────────────────────────────────
function unmountBirthdayUI() {
  console.log("[BD] unmounting — isMounted:", isMounted);
  if (bdHideObserver) {
    bdHideObserver.disconnect();
    bdHideObserver = null;
  }
  restoreBirthdayHides();
  const container = document.getElementById("script-container");
  if (container) container.innerHTML = "";
  isMounted = false;
  console.log("[BD] unmounted ✓");
}

// ─── SYNC ─────────────────────────────────────────────────────────────────────
function syncBirthdayUI() {
  try {
    const on = isBirthdayPage();
    console.log("[BD] syncBirthdayUI — on:", on, "isMounted:", isMounted);
    if (on) mountBirthdayUI();
    else    unmountBirthdayUI();
  } catch (err) {
    console.error("[BD] syncBirthdayUI unexpected error —", err);
    bailout("unexpected error during UI sync");
  }
}

syncBirthdayUI();

const pageObserver = new MutationObserver(() => {
  if (isMounted && !isBirthdayPage()) { unmountBirthdayUI(); return; }
  if (!isMounted && isBirthdayPage())  syncBirthdayUI();
});
pageObserver.observe(document.body, { childList: true, subtree: true });
addObserver(pageObserver);

console.log("[BD] script fully initialized ✓ activePage:", window.__TZMD__.activePage);
