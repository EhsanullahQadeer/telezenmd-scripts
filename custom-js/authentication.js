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

// ─── CSS ──────────────────────────────────────────────────────────────────────

const AUTH_CSS = `
  .auth-styled {
    text-align: center;
  }
  .auth-styled h4 {
    font-size: clamp(1.75rem, 6vw, 2.4rem) !important;
    font-weight: 900 !important;
    line-height: 1.15 !important;
    color: #221f1f !important;
  }
  .auth-green {
    color: #3D5C2A;
    display: block;
  }
  .auth-subtitle {
    text-align: center !important;
    color: #666 !important;
    font-size: 0.875rem !important;
    line-height: 1.6 !important;
    margin-top: 12px !important;
  }
  .auth-email-label {
    display: block;
    font-size: 0.875rem;
    font-weight: 700;
    color: #221f1f;
    text-align: left;
    margin-bottom: 6px;
  }
  .auth-input-icon {
    position: absolute;
    left: 18px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    pointer-events: none;
    z-index: 1;
  }
  .auth-input-icon svg {
    width: 20px;
    height: 20px;
  }
  .auth-hipaa {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 0 6px;
    text-align: left;
  }
  .auth-hipaa svg {
    width: 42px;
    height: 42px;
    flex-shrink: 0;
  }
  .auth-hipaa-title {
    font-weight: 700;
    font-size: 0.9rem;
    color: #221f1f;
    margin-bottom: 3px;
  }
  .auth-hipaa-sub {
    font-size: 0.78rem;
    color: #666;
  }
  .auth-or {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 6px 0;
    color: #666;
    font-size: 0.875rem;
    font-weight: 500;
  }
  .auth-or::before,
  .auth-or::after {
    content: '';
    flex: 1;
    height: 1.5px;
    background: #aaa;
  }
  .auth-account-col {
    flex-direction: column !important;
    gap: 6px !important;
  }
  .auth-account-col p {
    color: #221f1f !important;
  }
  .auth-account-col button {
    color: #3D5C2A !important;
    font-weight: 600 !important;
    text-decoration: underline !important;
  }
  .auth-privacy-card {
    display: flex;
    align-items: center;
    gap: 16px;
    border: 1px solid #ddd;
    border-radius: 14px;
    padding: 16px 18px;
    margin-top: 20px;
    text-align: left;
  }
  .auth-privacy-icon {
    flex: 0 0 52px;
    width: 52px;
    height: 52px;
    border-radius: 50%;
    border: 1.5px solid #ccc;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #3D5C2A;
  }
  .auth-privacy-icon svg {
    width: 22px;
    height: 26px;
  }
  .auth-privacy-title {
    font-weight: 700;
    font-size: 0.9rem;
    color: #221f1f;
    margin-bottom: 4px;
  }
  .auth-privacy-sub {
    font-size: 0.78rem;
    color: #555;
    line-height: 1.45;
  }
`;

// ─── LIFECYCLE ────────────────────────────────────────────────────────────────

console.log("[AUTH] script start — activePage:", window.__TZMD__.activePage);

const authPage = window.__TZMD__.createPage("auth", () => unmountAuthUI());
if (!authPage) {
  console.log("[AUTH] already active or bailing");
  return;
}
const { addObserver, destroy } = authPage;
console.log("[AUTH] createPage success");

let authMounted = false;
let authPrivacyOriginal = null;
let authStyleEl = null;

function getAuthContent() {
  const container = document.getElementById("script-container");
  if (!container) return null;
  const content = container.nextElementSibling;
  if (!content) return null;
  const h4 = content.querySelector("h4");
  if (!h4 || !h4.textContent.includes("One quick step")) return null;
  return content;
}

function mountAuthUI() {
  if (authMounted) return;

  const content = getAuthContent();
  if (!content) { console.log("[AUTH] not auth page or not ready yet"); return; }

  const h4 = content.querySelector("h4");
  const section = content.querySelector("section.relative");
  if (!section) return;

  // Inject CSS
  authStyleEl = document.createElement("style");
  authStyleEl.id = "auth-mod-css";
  authStyleEl.textContent = AUTH_CSS;
  document.head.appendChild(authStyleEl);

  section.classList.add("auth-styled");

  // 1. Heading: color "before we continue." green on its own line
  h4.innerHTML = `One quick step <span class="auth-green">before we continue.</span>`;

  // 2. Subtitle: center + soften + break "Takes..." onto its own line
  const subtitle = h4.parentElement?.querySelector("p");
  if (subtitle) {
    subtitle.dataset.authOrig = subtitle.innerHTML;
    subtitle.classList.add("auth-subtitle");
    subtitle.innerHTML = subtitle.innerHTML
      .replace(/while you/i, "<br>while you")
      .replace(/Takes \d+[\d\s\-]* more minutes\./i, "<br>Takes 2-3 more minutes.");
  }

  // 3. Email label above the input wrapper
  const inputWrapper = content.querySelector("div.flex.flex-col.gap-1");
  if (inputWrapper) {
    const label = document.createElement("span");
    label.className = "auth-email-label auth-injected";
    label.textContent = "Email Address";
    inputWrapper.insertBefore(label, inputWrapper.firstChild);
  }

  // 4. Envelope icon inside the input (position: absolute)
  const inputRelativeDiv = content.querySelector("div.relative");
  const emailInput = inputRelativeDiv?.querySelector("input[type='email']");
  if (inputRelativeDiv && emailInput) {
    const icon = document.createElement("span");
    icon.className = "auth-input-icon auth-injected";
    icon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="#47642e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 7 10-7"/></svg>`;
    inputRelativeDiv.style.position = "relative";
    inputRelativeDiv.insertBefore(icon, emailInput);
    emailInput.style.paddingLeft = "52px";
    emailInput.setAttribute("placeholder", "Enter your email");
    emailInput.style.setProperty("--input-border-focus-color", "#47642e");
    emailInput.style.setProperty("--input-border-hover-color", "#47642e");
  }

  // 5. HIPAA badge — inserted after the email input group, before the submit button
  const inputGroup = emailInput?.closest("[class*='md:grid']") ?? emailInput?.closest(".flex-col");
  if (inputGroup) {
    const hipaa = document.createElement("div");
    hipaa.className = "auth-hipaa auth-injected";
    hipaa.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="#3D5C2A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2L20 6V13C20 17.4 16.5 21.4 12 23C7.5 21.4 4 17.4 4 13V6L12 2Z"/>
        <path d="M8 12L11 15L16 9"/>
      </svg>
      <div>
        <div class="auth-hipaa-title">HIPAA-Compliant &amp; Secure</div>
        <div class="auth-hipaa-sub">Your information is encrypted and protected.</div>
      </div>`;
    inputGroup.insertAdjacentElement("afterend", hipaa);
  }

  // 6. "or" divider after submit button
  const submitBtn = content.querySelector('button[type="submit"]');
  if (submitBtn) {
    const orDiv = document.createElement("div");
    orDiv.className = "auth-or auth-injected";
    orDiv.innerHTML = `<span>or</span>`;
    submitBtn.insertAdjacentElement("afterend", orDiv);
  }

  // 7. Update account link text
  const accountDiv = content.querySelector(".flex.items-center.justify-center.gap-1");
  if (accountDiv) {
    const accountP = accountDiv.querySelector("p");
    const accountBtn = accountDiv.querySelector("button");
    if (accountP) {
      accountP.dataset.authOrig = accountP.textContent;
      accountP.textContent = "Already a Telezen patient?";
    }
    if (accountBtn) {
      accountBtn.dataset.authOrig = accountBtn.textContent;
      accountBtn.textContent = "Sign in to your account";
    }
    accountDiv.classList.add("auth-account-col");
  }

  // 8. Replace privacy span with styled card
  const privacySpan = content.querySelector("span.mt-5");
  if (privacySpan) {
    const card = document.createElement("div");
    card.className = "auth-privacy-card auth-injected";
    card.innerHTML = `
      <div class="auth-privacy-icon">
        <svg viewBox="0 0 24 28" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="4" y="11" width="16" height="13" rx="2.4"/>
          <path d="M7.5 11 V7 A4.5 4.5 0 0 1 16.5 7 V11"/>
        </svg>
      </div>
      <div>
        <div class="auth-privacy-title">Your privacy is our priority.</div>
        <div class="auth-privacy-sub">We will never share your information without your permission.</div>
      </div>`;
    authPrivacyOriginal = privacySpan;
    privacySpan.replaceWith(card);
  }

  // Style password input if already present (sign-in variant)
  stylePasswordInput(content);

  authMounted = true;
  console.log("[AUTH] mounted ✓");
}

function stylePasswordInput(content) {
  const passwordInput = content.querySelector("input[type='password']");
  if (!passwordInput || passwordInput.dataset.authStyled) return;

  passwordInput.style.setProperty("--input-border-focus-color", "#47642e");
  passwordInput.style.setProperty("--input-border-hover-color", "#47642e");
  passwordInput.dataset.authStyled = "1";

  // Add "Password" label above the input wrapper
  const inputWrapper = passwordInput.closest(".flex.flex-col.gap-1");
  if (inputWrapper && !inputWrapper.querySelector(".auth-password-label")) {
    const label = document.createElement("span");
    label.className = "auth-email-label auth-injected auth-password-label";
    label.textContent = "Password";
    inputWrapper.insertBefore(label, inputWrapper.firstChild);
  }

  // Hide Bask's own OR divider — we already inject ours
  const baskOr = [...content.querySelectorAll(".relative.flex.items-center.pb-3")]
    .find((el) => el.querySelector("span")?.textContent?.trim() === "OR");
  if (baskOr && !baskOr.dataset.authHidden) {
    baskOr.style.display = "none";
    baskOr.dataset.authHidden = "1";
  }

  console.log("[AUTH] password input styled ✓");
}

function unmountAuthUI() {
  if (!authMounted) return;

  const container = document.getElementById("script-container");
  const content = container?.nextElementSibling;

  if (content) {
    // Remove all injected elements
    content.querySelectorAll(".auth-injected").forEach((el) => el.remove());

    // Restore heading
    const h4 = content.querySelector("h4");
    if (h4) h4.innerHTML = "One quick step before we continue.";

    // Restore subtitle
    const subtitle = content.querySelector(".auth-subtitle");
    if (subtitle) {
      if (subtitle.dataset.authOrig) { subtitle.innerHTML = subtitle.dataset.authOrig; delete subtitle.dataset.authOrig; }
      subtitle.classList.remove("auth-subtitle");
    }

    // Restore input padding + placeholder
    const emailInput = content.querySelector("input[type='email']");
    if (emailInput) {
      emailInput.style.paddingLeft = "";
      emailInput.setAttribute("placeholder", "Email Address");
      emailInput.style.removeProperty("--input-border-focus-color");
      emailInput.style.removeProperty("--input-border-hover-color");
    }

    // Restore account link text
    const accountDiv = content.querySelector(".auth-account-col");
    if (accountDiv) {
      const p = accountDiv.querySelector("p");
      const btn = accountDiv.querySelector("button");
      if (p?.dataset.authOrig)   { p.textContent = p.dataset.authOrig;   delete p.dataset.authOrig; }
      if (btn?.dataset.authOrig) { btn.textContent = btn.dataset.authOrig; delete btn.dataset.authOrig; }
      accountDiv.classList.remove("auth-account-col");
    }

    // Restore Bask's OR divider if we hid it
    const baskOr = content.querySelector("[data-auth-hidden='1']");
    if (baskOr) { baskOr.style.display = ""; delete baskOr.dataset.authHidden; }

    // Restore privacy span
    const privacyCard = content.querySelector(".auth-privacy-card");
    if (privacyCard && authPrivacyOriginal) privacyCard.replaceWith(authPrivacyOriginal);

    content.querySelector(".auth-styled")?.classList.remove("auth-styled");
  }

  authStyleEl?.remove();
  authStyleEl = null;
  authPrivacyOriginal = null;
  authMounted = false;
  console.log("[AUTH] unmounted ✓");
}

// Watch for SPA navigation — destroy when auth content is gone, mount/update when content changes
const authObserver = new MutationObserver(() => {
  const content = getAuthContent();
  if (authMounted && !content) {
    destroy();
    return;
  }
  if (!authMounted) {
    mountAuthUI();
    return;
  }
  // Already mounted — watch for password field appearing (sign-in variant)
  if (content) stylePasswordInput(content);
});
authObserver.observe(document.body, { childList: true, subtree: true });
addObserver(authObserver);

// Boot — try immediately, observer handles the case where sibling isn't ready yet
mountAuthUI();
