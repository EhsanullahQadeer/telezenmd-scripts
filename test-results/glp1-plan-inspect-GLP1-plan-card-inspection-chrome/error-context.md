# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: glp1-plan-inspect.spec.js >> GLP1 plan card inspection
- Location: playwright\tests\glp1-plan-inspect.spec.js:5:1

# Error details

```
Error: page.evaluate: Target page, context or browser has been closed
```

# Test source

```ts
  1   | /**
  2   |  * GLP1 plan mapping + price test
  3   |  *
  4   |  * Setup:
  5   |  *  1. In Bask custom script field, paste ONE of:
  6   |  *       HTML:  <script src="http://localhost:4321/GLP1Checkout.min.js"></script>
  7   |  *       JS:    var s=document.createElement('script');s.src='http://localhost:4321/GLP1Checkout.min.js';document.head.appendChild(s);
  8   |  *  2. Keep local server running:  node playwright/serve-scripts.js
  9   |  *  3. Run:  node playwright/tests/glp1-plan-inspect.spec.js
  10  |  *
  11  |  * Script loads automatically via Bask — no injection needed here.
  12  |  * Uses persistent Chrome profile so no manual login required.
  13  |  */
  14  | 
  15  | const { chromium } = require("@playwright/test");
  16  | const path = require("path");
  17  | const startServer = require("../serve-scripts");
  18  | 
  19  | const USER_DATA_DIR = path.join(__dirname, "..", "auth", "user-data");
  20  | const GLP1_URL      = "https://join.telezenmd.com/start-online-visit/glp1questionnaire";
  21  | 
  22  | (async () => {
  23  |   // ── 1. Ensure localhost server is up ──────────────────────────────────────
  24  |   const stopServer = await startServer();
  25  | 
  26  |   // ── 2. Launch persistent Chrome profile (keeps all cookies/session) ───────
  27  |   const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
  28  |     headless: false,
  29  |     channel: "chrome",
  30  |     viewport: { width: 390, height: 844 }, // mobile viewport matches real user
  31  |     args: [
  32  |       "--disable-blink-features=AutomationControlled",
  33  |       "--no-sandbox",
  34  |     ],
  35  |     userAgent:
  36  |       "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
> 37  |   });
      |                               ^ Error: page.evaluate: Target page, context or browser has been closed
  38  | 
  39  |   await context.addInitScript(() => {
  40  |     Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  41  |   });
  42  | 
  43  |   const logs = [];
  44  |   const page = await context.newPage();
  45  | 
  46  |   page.on("console", (msg) => {
  47  |     const t = msg.text();
  48  |     if (t.includes("CO]") || t.includes("CO-DEBUG") || t.includes("TZMD")) {
  49  |       const line = `[${msg.type().toUpperCase()}] ${t}`;
  50  |       console.log(line);
  51  |       logs.push(line);
  52  |     }
  53  |   });
  54  |   page.on("pageerror", (e) => console.error("[PAGE-ERROR]", e.message));
  55  | 
  56  |   // ── 3. Navigate to GLP1 checkout ──────────────────────────────────────────
  57  |   console.log("\n→ Opening GLP1 checkout page...");
  58  |   await page.goto(GLP1_URL, { waitUntil: "networkidle", timeout: 60000 });
  59  | 
  60  |   // ── 4. Wait for user to reach the checkout step ───────────────────────────
  61  |   console.log("\n>>> Navigate through the questionnaire to the CHECKOUT step in the browser.");
  62  |   console.log(">>> The test will continue automatically once plan cards appear (up to 5 min).\n");
  63  | 
  64  |   try {
  65  |     // Wait for our custom plan cards — they appear only when the Empty page script runs at checkout
  66  |     await page.waitForSelector(".prog-plan-card", { timeout: 300000 });
  67  |     console.log("✓ Custom plan cards found — at checkout step");
  68  |   } catch {
  69  |     console.warn("⚠ Plan cards not found in 5min — aborting");
  70  |     await context.close();
  71  |     stopServer();
  72  |     process.exit(1);
  73  |   }
  74  | 
  75  |   // Let Bask finish mounting
  76  |   await page.waitForTimeout(1500);
  77  | 
  78  |   // ── 6. Dump Bask DOM card order ───────────────────────────────────────────
  79  |   const baskCards = await page.evaluate(() => {
  80  |     const cards = [...document.querySelectorAll("ul.relative.mt-5.flex.flex-col.gap-3 > li")];
  81  |     return cards.map((li, i) => ({
  82  |       domIndex: i,
  83  |       title: li.querySelector(":scope > div:first-child span:first-child")?.textContent?.trim() ?? "(no title)",
  84  |       price: li.querySelector(":scope > div:first-child span:last-child")?.textContent?.trim() ?? "(no price)",
  85  |       selected: li.classList.contains("border-2"),
  86  |     }));
  87  |   });
  88  | 
  89  |   console.log("\n=== BASK DOM CARD ORDER ===");
  90  |   baskCards.forEach((c) =>
  91  |     console.log(`  domIdx=${c.domIndex}  "${c.title}"  ${c.price}  selected=${c.selected}`)
  92  |   );
  93  | 
  94  |   // ── 7. Dump our custom plan cards ─────────────────────────────────────────
  95  |   const customCards = await page.evaluate(() =>
  96  |     [...document.querySelectorAll(".prog-plan-card")].map((c, i) => ({
  97  |       arrayIndex: i,
  98  |       id: c.dataset.id,
  99  |       name: c.querySelector(".prog-plan-name")?.textContent?.trim(),
  100 |       price: c.querySelector(".prog-amt")?.textContent?.trim(),
  101 |       selected: c.classList.contains("prog-selected"),
  102 |     }))
  103 |   );
  104 | 
  105 |   console.log("\n=== OUR CUSTOM PLAN CARDS ===");
  106 |   customCards.forEach((c) =>
  107 |     console.log(`  arrayIdx=${c.arrayIndex}  id=${c.id}  name="${c.name}"  price=${c.price}  selected=${c.selected}`)
  108 |   );
  109 | 
  110 |   // ── 8. Click each plan, verify correct Bask card is selected ──────────────
  111 |   console.log("\n=== CLICK-THROUGH PLAN MAPPING TEST ===");
  112 |   const TITLE_MAP = { monthly: "Monthly", quarterly: "Quarterly", sixmonth: "Six months", twelvemonth: "Yearly" };
  113 | 
  114 |   for (const cc of customCards) {
  115 |     await page.click(`.prog-plan-card[data-id="${cc.id}"]`);
  116 |     await page.waitForTimeout(900);
  117 | 
  118 |     const result = await page.evaluate((id) => {
  119 |       const baskList = [...document.querySelectorAll("ul.relative.mt-5.flex.flex-col.gap-3 > li")];
  120 |       const selIdx   = baskList.findIndex((li) => li.classList.contains("border-2"));
  121 |       const selTitle = selIdx >= 0
  122 |         ? baskList[selIdx]?.querySelector(":scope > div:first-child span:first-child")?.textContent?.trim()
  123 |         : "(none)";
  124 |       const ourSel = document.querySelector(`.prog-plan-card[data-id="${id}"]`)?.classList.contains("prog-selected");
  125 |       return { selIdx, selTitle, ourSel };
  126 |     }, cc.id);
  127 | 
  128 |     const expected = TITLE_MAP[cc.id];
  129 |     const ok = result.selTitle === expected;
  130 |     console.log(
  131 |       `  ${ok ? "✓" : "✗"}  Click "${cc.name}" (id=${cc.id}) → Bask selected domIdx=${result.selIdx} title="${result.selTitle}" expected="${expected}" ${ok ? "CORRECT" : "WRONG!"}`
  132 |     );
  133 |   }
  134 | 
  135 |   // ── 9. Keep browser open for manual inspection ────────────────────────────
  136 |   console.log("\n=== Done — browser stays open for manual inspection ===");
  137 |   console.log("Close the browser window when finished.\n");
```