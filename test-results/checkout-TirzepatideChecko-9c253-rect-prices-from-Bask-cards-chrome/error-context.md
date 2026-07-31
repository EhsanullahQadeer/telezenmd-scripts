# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: checkout.spec.js >> TirzepatideCheckout — price mapping >> plans render with correct prices from Bask cards
- Location: playwright\tests\checkout.spec.js:13:3

# Error details

```
TimeoutError: page.waitForSelector: Timeout 30000ms exceeded.
Call log:
  - waiting for locator('.prog-plans') to be visible

```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e2]:
    - navigation [ref=e5]:
      - generic [ref=e6]:
        - button [ref=e7] [cursor=pointer]:
          - paragraph [ref=e10]: Back
        - img "Logo" [ref=e12]
        - button [ref=e14] [cursor=pointer]
    - generic [ref=e28]:
      - generic [ref=e29]:
        - heading "Basics" [level=4] [ref=e30]
        - paragraph [ref=e31]: Please enter your mobile number and zip code.
      - generic [ref=e32]:
        - textbox "Phone" [active] [ref=e34]: (032) 568-686
        - textbox "Zip Code" [ref=e36]
        - paragraph [ref=e37]: By entering your phone number and checking the above box, you consent to Telezen MD calling or sending text messages to you for the purpose of verifying your phone number, ensuring patient safety, and for any other lawful purposes related to your Telezen MD account in use of our services. This includes cart/browser reminders, marketing promotions, order confirmations, shipment notifications, and messages from your provider. You must be 18 or older to opt in. Message and data rates may apply. Message frequency varies. Reply HELP for assistance or STOP to opt out.
      - button "Next" [ref=e40] [cursor=pointer]
    - contentinfo [ref=e43]:
      - generic [ref=e44]:
        - img "logo" [ref=e46]
        - generic [ref=e47]:
          - link [ref=e48] [cursor=pointer]:
            - /url: mailto:Support@telezenmd.com
            - paragraph [ref=e49]: Support@telezenmd.com
          - link:
            - /url: "#"
            - paragraph
          - link [ref=e50] [cursor=pointer]:
            - /url: tel:(888) 775-9343
            - paragraph [ref=e51]: (888) 775-9343
      - generic [ref=e52]:
        - generic [ref=e53]:
          - link [ref=e54] [cursor=pointer]:
            - /url: https://www.instagram.com/telezenmd/
          - link [ref=e59] [cursor=pointer]:
            - /url: https://www.facebook.com/telezenmd
        - generic [ref=e62]:
          - link [ref=e63] [cursor=pointer]:
            - /url: /policy/privacy-policy?id=9664
            - paragraph [ref=e64]: Privacy
          - link [ref=e65] [cursor=pointer]:
            - /url: /policy/terms-of-service?id=9664
            - paragraph [ref=e66]: Terms & Conditions
          - paragraph [ref=e67]: ©
  - alert [ref=e68]
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
> 17 |     await page.waitForSelector(".prog-plans", { timeout: 30_000 });
     |                ^ TimeoutError: page.waitForSelector: Timeout 30000ms exceeded.
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
  50 |     await page.waitForSelector(".prog-plan-card", { timeout: 30_000 });
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