# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: checkout.spec.js >> TirzepatideCheckout — price mapping >> selecting a plan updates Bask hidden card
- Location: playwright\tests\checkout.spec.js:48:3

# Error details

```
TimeoutError: page.waitForSelector: Timeout 30000ms exceeded.
Call log:
  - waiting for locator('.prog-plan-card') to be visible

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - navigation [ref=e5]:
      - generic [ref=e6]:
        - button [ref=e7] [cursor=pointer]:
          - paragraph [ref=e10]: Back
        - img "Logo" [ref=e12]
        - button [ref=e14] [cursor=pointer]
    - generic [ref=e26]: Loading your personalized health assessment. This won't take long.
    - contentinfo [ref=e33]:
      - generic [ref=e34]:
        - img "logo" [ref=e36]
        - generic [ref=e37]:
          - link [ref=e38] [cursor=pointer]:
            - /url: mailto:Support@telezenmd.com
            - paragraph [ref=e39]: Support@telezenmd.com
          - link:
            - /url: "#"
            - paragraph
          - link [ref=e40] [cursor=pointer]:
            - /url: tel:(888) 775-9343
            - paragraph [ref=e41]: (888) 775-9343
      - generic [ref=e42]:
        - generic [ref=e43]:
          - link [ref=e44] [cursor=pointer]:
            - /url: https://www.instagram.com/telezenmd/
          - link [ref=e49] [cursor=pointer]:
            - /url: https://www.facebook.com/telezenmd
        - generic [ref=e52]:
          - link [ref=e53] [cursor=pointer]:
            - /url: /policy/privacy-policy?id=9664
            - paragraph [ref=e54]: Privacy
          - link [ref=e55] [cursor=pointer]:
            - /url: /policy/terms-of-service?id=9664
            - paragraph [ref=e56]: Terms & Conditions
          - paragraph [ref=e57]: ©
  - status [ref=e63]: Success
  - alert [ref=e64]
```

# Test source

```ts
  1  | const { test, expect } = require("@playwright/test");
  2  | 
  3  | const QUESTIONNAIRE_URL = "https://join.telezenmd.com/start-online-visit/glp1-intake";
  4  | 
  5  | test.beforeEach(async ({ page }) => {
  6  |   // Remove automation fingerprint before every navigation
  7  |   await page.addInitScript(() => {
  8  |     Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  9  |   });
  10 | });
  11 | 
  12 | test.describe("TirzepatideCheckout — price mapping", () => {
  13 |   test("plans render with correct prices from Bask cards", async ({ page }) => {
  14 |     await page.goto(QUESTIONNAIRE_URL);
  15 | 
  16 |     // Wait for the checkout section to be visible
  17 |     await page.waitForSelector(".prog-plans", { timeout: 30_000 });
  18 | 
  19 |     // Grab all four plan cards our script renders
  20 |     const cards = await page.$$(".prog-plan-card");
  21 |     expect(cards.length).toBe(4);
  22 | 
  23 |     // Log plan details to console for inspection
  24 |     for (const card of cards) {
  25 |       const id    = await card.getAttribute("data-id");
  26 |       const price = await card.$eval(".prog-amt",   el => el.textContent).catch(() => "–");
  27 |       const billed= await card.$eval(".prog-plan-billed", el => el.textContent).catch(() => "–");
  28 |       const badge = await card.$eval(".prog-plan-badge",  el => el.textContent.trim()).catch(() => "–");
  29 |       console.log(`[${id}]  price=${price}  badge=${badge}  billed=${billed}`);
  30 |     }
  31 | 
  32 |     // Verify no plan shows NaN or $0
  33 |     for (const card of cards) {
  34 |       const amt = await card.$eval(".prog-amt", el => el.textContent);
  35 |       expect(amt).toMatch(/^\$[\d,]+(\.\d{2})?$/);
  36 |       expect(amt).not.toBe("$0");
  37 |       expect(amt).not.toContain("NaN");
  38 |     }
  39 | 
  40 |     // Snapshot the value block
  41 |     const valueBlock = page.locator(".co-value-block");
  42 |     if (await valueBlock.count()) {
  43 |       const valText = await valueBlock.innerText();
  44 |       console.log("[value-block]", valText.replace(/\n/g, " | "));
  45 |     }
  46 |   });
  47 | 
  48 |   test("selecting a plan updates Bask hidden card", async ({ page }) => {
  49 |     await page.goto(QUESTIONNAIRE_URL);
> 50 |     await page.waitForSelector(".prog-plan-card", { timeout: 30_000 });
     |                ^ TimeoutError: page.waitForSelector: Timeout 30000ms exceeded.
  51 | 
  52 |     // Click the 6-month plan
  53 |     const sixMonth = page.locator('.prog-plan-card[data-id="sixmonth"]');
  54 |     await sixMonth.click();
  55 | 
  56 |     // Our card should become selected
  57 |     await expect(sixMonth).toHaveClass(/prog-selected/);
  58 | 
  59 |     // Bask's hidden card should also be selected (border-2)
  60 |     const baskCards = await page.$$("ul.relative.mt-5.flex.flex-col.gap-3 > li");
  61 |     const selectedBaskCards = [];
  62 |     for (const c of baskCards) {
  63 |       if (await c.evaluate(el => el.classList.contains("border-2"))) {
  64 |         selectedBaskCards.push(await c.innerText());
  65 |       }
  66 |     }
  67 |     console.log("[bask-selected]", selectedBaskCards);
  68 |     expect(selectedBaskCards.length).toBe(1);
  69 |   });
  70 | });
  71 | 
```