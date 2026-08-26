# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: glp1-plan-inspect.spec.js >> GLP1 plan card inspection — DOM order vs plans array
- Location: playwright\tests\glp1-plan-inspect.spec.js:5:1

# Error details

```
Error: page.evaluate: Target page, context or browser has been closed
```

# Test source

```ts
  1  | const { test } = require("@playwright/test");
  2  | const fs = require("fs");
  3  | const path = require("path");
  4  | 
  5  | test("GLP1 plan card inspection — DOM order vs plans array", async ({ page }) => {
  6  |   const logs = [];
  7  |   page.on("console", (msg) => {
  8  |     const text = `[${msg.type().toUpperCase()}] ${msg.text()}`;
  9  |     if (!text.includes("googleAnalytics")) { console.log(text); logs.push(text); }
  10 |   });
  11 |   page.on("pageerror", (err) => {
  12 |     const text = `[PAGE-ERROR] ${err.message}`;
  13 |     console.error(text);
  14 |     logs.push(text);
  15 |   });
  16 | 
  17 |   await page.goto("https://join.telezenmd.com/start-online-visit/glp1questionnaire", {
  18 |     waitUntil: "networkidle",
  19 |     timeout: 60000,
  20 |   });
  21 | 
  22 |   console.log("\n=== Browser open — navigate to checkout step, then press Resume ===\n");
  23 |   await page.pause();
  24 | 
  25 |   // ── 1. Bask DOM card order ──────────────────────────────────────────────────
> 26 |   const baskCards = await page.evaluate(() => {
     |                                ^ Error: page.evaluate: Target page, context or browser has been closed
  27 |     const cards = [...document.querySelectorAll("ul.relative.mt-5.flex.flex-col.gap-3 > li")];
  28 |     return cards.map((li, i) => {
  29 |       const spans = [...li.querySelectorAll(":scope > div:first-child span")];
  30 |       return {
  31 |         domIndex: i,
  32 |         title: spans[0]?.textContent?.trim() ?? "(no title)",
  33 |         price: spans[spans.length - 1]?.textContent?.trim() ?? "(no price)",
  34 |         hasBorder2: li.classList.contains("border-2"),
  35 |         classList: [...li.classList].join(" "),
  36 |       };
  37 |     });
  38 |   });
  39 | 
  40 |   console.log("\n=== BASK DOM CARD ORDER ===");
  41 |   baskCards.forEach((c) =>
  42 |     console.log(`  domIndex=${c.domIndex}  title="${c.title}"  price=${c.price}  selected=${c.hasBorder2}`)
  43 |   );
  44 | 
  45 |   // ── 2. Our custom plan cards ────────────────────────────────────────────────
  46 |   const customCards = await page.evaluate(() => {
  47 |     return [...document.querySelectorAll(".prog-plan-card")].map((c, i) => ({
  48 |       arrayIndex: i,
  49 |       id: c.dataset.id,
  50 |       name: c.querySelector(".prog-plan-name")?.textContent?.trim(),
  51 |       price: c.querySelector(".prog-amt")?.textContent?.trim(),
  52 |       selected: c.classList.contains("prog-selected"),
  53 |     }));
  54 |   });
  55 | 
  56 |   console.log("\n=== OUR CUSTOM PLAN CARDS (array order) ===");
  57 |   customCards.forEach((c) =>
  58 |     console.log(`  arrayIndex=${c.arrayIndex}  id=${c.id}  name="${c.name}"  price=${c.price}  selected=${c.selected}`)
  59 |   );
  60 | 
  61 |   // ── 3. Click each custom card and check which Bask card gets border-2 ───────
  62 |   console.log("\n=== CLICK TEST: click each plan, see which Bask card gets selected ===");
  63 |   for (const cc of customCards) {
  64 |     await page.click(`.prog-plan-card[data-id="${cc.id}"]`);
  65 |     await page.waitForTimeout(800); // wait for Bask to react
  66 | 
  67 |     const result = await page.evaluate((id) => {
  68 |       const baskList = [...document.querySelectorAll("ul.relative.mt-5.flex.flex-col.gap-3 > li")];
  69 |       const selectedBask = baskList.findIndex((li) => li.classList.contains("border-2"));
  70 |       const selectedTitle = selectedBask >= 0
  71 |         ? baskList[selectedBask]?.querySelector(":scope > div:first-child span:first-child")?.textContent?.trim()
  72 |         : "(none)";
  73 |       const ourCard = document.querySelector(`.prog-plan-card[data-id="${id}"]`);
  74 |       return {
  75 |         ourSelected: ourCard?.classList.contains("prog-selected"),
  76 |         baskDomIndex: selectedBask,
  77 |         baskTitle: selectedTitle,
  78 |       };
  79 |     }, cc.id);
  80 | 
  81 |     const match = result.baskTitle === cc.name ||
  82 |       (cc.name === "6 Month" && result.baskTitle === "Six months") ||
  83 |       (cc.name === "Annual" && result.baskTitle === "Yearly");
  84 | 
  85 |     console.log(
  86 |       `  Click "${cc.name}" (id=${cc.id}, arrayIdx=${cc.arrayIndex}) → Bask selected domIndex=${result.baskDomIndex} title="${result.baskTitle}" ${match ? "✓ CORRECT" : "✗ WRONG MAPPING"}`
  87 |     );
  88 |   }
  89 | 
  90 |   // ── 4. Save output ───────────────────────────────────────────────────────────
  91 |   const outPath = path.join(__dirname, "..", "glp1-plan-inspect-output.txt");
  92 |   fs.writeFileSync(outPath, logs.join("\n"), "utf8");
  93 |   console.log(`\nLog saved to: ${outPath}`);
  94 | 
  95 |   await page.pause(); // keep open for manual inspection
  96 | });
  97 | 
```