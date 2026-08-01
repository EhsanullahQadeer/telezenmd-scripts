/**
 * Find which element is auto-scrolling on page load.
 * Run: node playwright/diagnose-scroll.js
 */
const { chromium } = require("@playwright/test");
const path = require("path");
const fs   = require("fs");

const USER_DATA_DIR = path.join(__dirname, "auth", "user-data");
const SNAPSHOT_FILE = path.join(__dirname, "auth", "checkout-snapshot.json");
const SS = (name) => path.join(__dirname, "auth", `scroll-diag-${name}.png`);

(async () => {
  const snap = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, "utf8"));

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
  page.on("console", msg => {
    const txt = msg.text();
    if (txt.includes("[SCROLL]") || txt.includes("[CO]")) console.log("  [PAGE]", txt);
  });
  page.on("pageerror", err => console.error("  [ERROR]", err.message));

  // Inject scroll spy BEFORE page loads
  await context.addInitScript(() => {
    // Patch scrollIntoView to log caller
    const _orig = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function(opt) {
      console.log('[SCROLL] scrollIntoView called on:', this.tagName, this.id || this.className.slice(0,40));
      try { throw new Error('stack'); } catch(e) {
        console.log('[SCROLL] stack:', e.stack.split('\n').slice(1,4).join(' | '));
      }
      return _orig.call(this, opt);
    };

    // Watch for scroll on window
    window.addEventListener('scroll', () => {
      console.log('[SCROLL] window.scroll event — scrollY:', window.scrollY);
    }, { passive: true, capture: true });

    // Watch for scroll on document
    document.addEventListener('scroll', (e) => {
      console.log('[SCROLL] document.scroll event — target:', e.target?.tagName, e.target?.id || e.target?.className?.slice(0,40));
    }, { passive: true, capture: true });

    // Patch window.scrollTo
    const _scrollTo = window.scrollTo.bind(window);
    window.scrollTo = function(x, y) {
      const args = typeof x === 'object' ? JSON.stringify(x) : `${x}, ${y}`;
      console.log('[SCROLL] window.scrollTo called:', args);
      return _scrollTo(x, y);
    };

    // After DOM is ready, also watch every scrollable element
    window.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => {
        // Find all elements with scrollTop > 0 or that can scroll
        const all = document.querySelectorAll('*');
        all.forEach(el => {
          el.addEventListener('scroll', function() {
            if (this.scrollTop > 0) {
              console.log('[SCROLL] element scrolled — tag:', this.tagName, 'id:', this.id, 'class:', this.className.slice(0,50), 'scrollTop:', this.scrollTop);
            }
          }, { passive: true });
        });
        console.log('[SCROLL] Watching', all.length, 'elements for scroll');
      }, 500);
    });
  });

  await page.goto(snap.url);
  await page.waitForSelector(".prog-plans", { timeout: 20_000 });

  // Wait for Stripe to init
  console.log("\n[1] Page loaded, waiting 6s for Stripe/Bask to initialize...");
  await page.waitForTimeout(6000);

  await page.screenshot({ path: SS("after-load"), fullPage: false });
  console.log("[1] Screenshot taken:", SS("after-load"));

  // Now check scroll positions
  const scrollReport = await page.evaluate(() => {
    const results = [];

    // Check window scroll
    results.push({ who: 'window', scrollY: window.scrollY, scrollX: window.scrollX });

    // Check document.documentElement
    const de = document.documentElement;
    results.push({ who: 'documentElement', scrollTop: de.scrollTop, scrollHeight: de.scrollHeight, clientHeight: de.clientHeight });

    // Check document.body
    const b = document.body;
    results.push({ who: 'body', scrollTop: b.scrollTop, scrollHeight: b.scrollHeight, clientHeight: b.clientHeight });

    // Find all elements with non-zero scrollTop
    const all = document.querySelectorAll('*');
    for (const el of all) {
      if (el.scrollTop > 0) {
        results.push({
          who: `${el.tagName}#${el.id}.${[...el.classList].join('.')}`.slice(0, 80),
          scrollTop: el.scrollTop,
          scrollHeight: el.scrollHeight,
          clientHeight: el.clientHeight,
        });
      }
    }

    // Also find the Bask section
    const baskSection = document.querySelector('section.relative');
    if (baskSection) {
      const rect = baskSection.getBoundingClientRect();
      results.push({
        who: 'baskSection (section.relative)',
        top: rect.top,
        bottom: rect.bottom,
        height: rect.height,
        visibility: baskSection.style.visibility,
        scrollTop: baskSection.scrollTop,
      });
    }

    // Check what element is at the bottom of viewport
    const bottomEl = document.elementFromPoint(215, 899);
    results.push({
      who: 'elementAtViewportBottom',
      tag: bottomEl?.tagName,
      id: bottomEl?.id,
      cls: bottomEl?.className?.slice(0, 60),
    });

    return results;
  });

  console.log("\n[2] Scroll state after 6s:");
  for (const r of scrollReport) {
    console.log(" ", JSON.stringify(r));
  }

  // Also find the Bask parent container and check its scroll
  const baskContainerScroll = await page.evaluate(() => {
    const scriptContainer = document.getElementById('script-container');
    if (!scriptContainer) return { error: '#script-container not found' };
    const baskContainer = scriptContainer.nextElementSibling;
    if (!baskContainer) return { error: 'no sibling after #script-container' };
    return {
      baskContainerTag: baskContainer.tagName,
      baskContainerClass: baskContainer.className.slice(0, 80),
      baskContainerScrollTop: baskContainer.scrollTop,
      baskContainerScrollHeight: baskContainer.scrollHeight,
      baskContainerClientHeight: baskContainer.clientHeight,
      baskContainerRect: baskContainer.getBoundingClientRect(),
      // Walk up to find any scrolled ancestor
      scrolledAncestors: (() => {
        const res = [];
        let el = baskContainer.parentElement;
        while (el && el !== document.body) {
          if (el.scrollTop > 0) {
            res.push({ tag: el.tagName, id: el.id, cls: el.className.slice(0,40), scrollTop: el.scrollTop });
          }
          el = el.parentElement;
        }
        return res;
      })(),
      // Also find the main scrollable container (the one users scroll)
      mainScrollEl: (() => {
        const candidates = [document.documentElement, document.body];
        // also check for questionnaire-animation or similar
        const q = document.querySelector('.questionnaire-animation');
        if (q) candidates.push(q);
        const m = document.querySelector('main');
        if (m) candidates.push(m);
        return candidates.map(el => ({
          tag: el.tagName, id: el.id, cls: el.className.slice(0,40),
          scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight,
          overflow: window.getComputedStyle(el).overflow,
          overflowY: window.getComputedStyle(el).overflowY,
        }));
      })(),
    };
  });

  console.log("\n[3] Bask container analysis:");
  console.log(JSON.stringify(baskContainerScroll, null, 2));

  console.log("\n  Browser staying open — check DevTools console for [SCROLL] logs.");
  await new Promise(() => {});
})();
