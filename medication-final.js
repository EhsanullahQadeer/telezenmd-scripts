const scriptContainer = document.getElementById("script-container");

let hiddenSection = null;

function hideOriginalSection() {
  const scriptContainer = document.getElementById("script-container");

  if (!scriptContainer?.nextElementSibling) return;

  hiddenSection = scriptContainer.nextElementSibling;

  hiddenSection.classList.add("hidden");

  console.log("Original section hidden");
}

function restoreOriginalSection() {
    const isHidden = hiddenSection?.classList.contains("hidden");
    console.log('isHidden: ', isHidden);
  if (isHidden) {
    hiddenSection.classList.remove("hidden");
    console.log("Original section restored");
  }
}

const observer = new MutationObserver(() => {
  const scriptContainer = document.querySelector("#script-container");

  const medicationMarker = document.getElementById("tzmd-glp1-widget");
  console.log('scriptContainer:', scriptContainer );
  console.log('medicationMarker:', medicationMarker );

  if (!medicationMarker) {
    console.log("restoreOriginalSection");
    restoreOriginalSection();
    return;
  }

  if (
    scriptContainer.nextElementSibling &&
    !scriptContainer.nextElementSibling.classList.contains("hidden")
  ) {
    hideOriginalSection();
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});

const baskButtons = {};
let continueButton = [...document.querySelectorAll("button")].find(
  (btn) => btn.textContent.trim() === "Continue",
);

if (!continueButton) {
  const observer = new MutationObserver(() => {
    continueButton = [...document.querySelectorAll("button")].find(
      (btn) => btn.textContent.trim() === "Continue",
    );

    if (continueButton) {
      console.log("Continue button found:", continueButton);

      observer.disconnect();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
} else {
  console.log("Continue button found immediately:", continueButton);
}

const container = document.getElementById("script-container");
if (!container) return;
container.innerHTML = `
 <style>
 #script-container{
  width:100%;
}
      #tzmd-glp1-widget {
        --primary-green: #3d5c2a;
        --medium-green: #6b8f4e;
        --sage-green: #a8bc8a;
        --ink: #1c1c1a;
        --white: #ffffff;
        --page-bg: #fdfdfd;
        --border: #e7e7e4;
        --muted: rgba(28, 28, 26, 0.62);
      }
      #tzmd-glp1-widget * {
        box-sizing: border-box;
      }

      /* ---- headline ---- */
      #tzmd-glp1-widget .headline {
        text-align: center;
        font-size: 32px;
        line-height: 1.2;
        font-weight: 600;
        color: var(--ink);
        letter-spacing: -0.3px;
      }
      #tzmd-glp1-widget .headline .green {
        color: var(--primary-green);
      }
      #tzmd-glp1-widget .subtitle {
        text-align: center;
        font-size: 12px;
        color: var(--ink);
        padding: 9px 16px 0;
        line-height: 1.35;
        font-weight: 400;
        letter-spacing: -0.2px;
        white-space: nowrap;
      }

      /* ---- feature box ---- */
      #tzmd-glp1-widget#tzmd-glp1-widget .features {
        position: relative;
        margin: 15px 0 0;
        border: 1px solid var(--border);
        border-radius: 18px;
        padding: 6px 0;
      }
      #tzmd-glp1-widget .frow {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
      }
      #tzmd-glp1-widget .fcell {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: flex-start;
        text-align: center;
        padding: 12px 3px 11px;
        gap: 8px;
      }
      #tzmd-glp1-widget .ficon {
        width: 40px;
        height: 40px;
        color: var(--primary-green);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      #tzmd-glp1-widget .ficon img {
        width: 100%;
        height: 100%;
        object-fit:contain;
      }
      #tzmd-glp1-widget .flabel {
        font-size: 9.5px;
        line-height: 1.4;
        font-weight: 500;
        color: var(--ink);
        white-space: nowrap;
        letter-spacing: -0.1px;
      }

      /* inset dividers */
      #tzmd-glp1-widget .features .vdiv {
        position: absolute;
        width: 1px;
        background: var(--border);
      }
#tzmd-glp1-widget .features .hdiv{
  position:absolute;
  top:50%;
  height:1px;
  background:var(--border);
}

/* left segment */
#tzmd-glp1-widget .features .hdiv-1{
  left:24px;
  width:calc(33.33% - 42px);
}

/* center segment */
#tzmd-glp1-widget .features .hdiv-2{
  left:calc(33.33% + 18px);
  width:calc(33.33% - 36px);
}

/* right segment */
#tzmd-glp1-widget .features .hdiv-3{
  left:calc(66.66% + 18px);
  right:24px;
}

/* ============================================================
   MEDICATION CARDS*/
.med-list, .med-list *{box-sizing:border-box;margin:0;padding:0;-webkit-font-smoothing:antialiased;}

.med-list{
  width:100%;
  margin-top: 15px;
  padding:0;
  background:transparent;       /* inherits your container's background */
}

/* ---- card shell ---- */
.med-card{
  position:relative;
  background:#FFFFFF;
  border:2px solid #E7E7E4;
  border-radius:15px;
  padding:15px 17px;
  margin-bottom:15px;
  cursor:pointer;
  transition:border-color .15s ease;
}
.med-card:last-child{margin-bottom:0;}
.med-card.selected{border-color:#3D5C2A;}
.med-card.has-badge{padding-top:44px;}        /* room for the badge */

/* ---- MOST POPULAR badge: inside card, top-left, under the border ---- */
.med-badge{
  position:absolute;
  top:6px;
  left:11px;
  display:inline-flex;
  align-items:center;
  gap:4px;
  background:#3D5C2A;
  color:#FFFFFF;
  font-size:10.5px;
  font-weight:600;
  letter-spacing:.3px;
  padding:6px 11px;
  border-radius:999px;
  white-space:nowrap;
  line-height:1;
}
.med-badge svg{width:9px;height:9px;display:block;flex:none;}

/* ---- radio (top-right) ---- */
.med-radio{
  position:absolute;
  right:16px;
  top:39px;
  width:23px;
  height:23px;
  border-radius:50%;
  border:1.5px solid #A8AAAE;
  transition:border-color .15s ease;
}
.med-card.has-badge .med-radio{top:58px;}     /* pushed down by the badge */
.med-radio::after{
  content:'';position:absolute;inset:4px;border-radius:50%;
  background:transparent;transition:background .15s ease;
}
.med-card.selected .med-radio{border-color:#3D5C2A;}
.med-card.selected .med-radio::after{background:#3D5C2A;}

/* ---- body: image + content ---- */
.med-body{display:flex;gap:30px;align-items:stretch;}

.med-image{
  flex:none;width:70px;min-height:118px;border-radius:8px;
  display:flex;align-items:center;justify-content:center;overflow:hidden;
}
.med-image img{width:100%;height:100%;object-fit:contain;display:block;}
.med-image .ph{
  width:100%;height:100%;display:flex;align-items:center;justify-content:center;
  text-align:center;font-size:9px;font-weight:500;color:#A7ADA0;line-height:1.4;
  border:1px dashed #D6DACE;border-radius:8px;background:#FAFBF8;
}

/* ---- content ---- */
.med-content{flex:1;min-width:0;padding-right:6px;}
.med-name{font-size:16px;font-weight:700;color:#1C1C1A;letter-spacing:-.3px;line-height:1.1;}
.med-starting{font-size:11.5px;font-weight:500;color:#5B6470;margin-top:6px;}
.med-price{display:flex;align-items:flex-end;color:#3D5C2A;font-weight:700;margin-top:2px;line-height:1;}
.med-price .cur{font-size:19px;align-self:flex-start;margin-top:4px;margin-right:1px;}
.med-price .amt{font-size:30px;letter-spacing:-.8px;}
.med-price .star{font-size:14px;align-self:flex-start;margin-top:2px;font-weight:600;}
.med-price .per{font-size:14px;font-weight:600;margin-left:2px;padding-bottom:4px;}

.med-divider{height:1px;background:#E7E7E4;margin:11px 0;}

.med-desc{font-size:11px;line-height:1.5;color:#3F4045;font-weight:400;padding-right:26px;}

@media (max-width:430px){
  .med-content{padding-right:4px;}
  .med-desc{padding-right:24px;}
}

.continue-btn{
  position:relative;
  width:100%;                       /* fills your container */
  display:flex;
  align-items:center;
  justify-content:center;
  gap:8px;
  background:#1C1C1A;
  color:#FFFFFF;
  border:none;
  border-radius:14px;
  padding:17px 24px;
  margin-top: 15px;
  font-family:'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  font-size:15px;
  font-weight:600;
  letter-spacing:.2px;
  cursor:pointer;
  -webkit-font-smoothing:antialiased;
  transition:background .15s ease, transform .05s ease;
}
.continue-btn:hover{background:#000000;}
.continue-btn:active{transform:translateY(1px);}
.continue-btn:focus-visible{outline:3px solid #3D5C2A;outline-offset:2px;}

/* arrow pinned to the right while the label stays centered */
.continue-btn .arrow{
  position:absolute;
  right:24px;
  top:50%;
  transform:translateY(-50%);
  width:20px;
  height:20px;
  flex:none;
}
.continue-btn[disabled]{opacity:.5;cursor:not-allowed;}

.med-card.skeleton {
  pointer-events: none;
}
.med-card.skeleton .med-name,
.med-card.skeleton .med-starting,
.med-card.skeleton .med-price,
.med-card.skeleton .med-desc {
  background: #E7E7E4;
  color: transparent;
  border-radius: 6px;
  animation: shimmer 1.2s infinite;
}
.med-card.skeleton .med-image img {
  opacity: 0;
}
.med-card.skeleton .med-radio {
  background: #E7E7E4;
  border-color: #E7E7E4;
  animation: shimmer 1.2s infinite;
}
@keyframes shimmer {
  0%   { opacity: 1; }
  50%  { opacity: 0.4; }
  100% { opacity: 1; }
}
    </style>



 <div id="tzmd-glp1-widget">
      <div class="headline">
        Choose Your<br /><span class="green">GLP-1</span> Medication
      </div>
      <div class="subtitle">
        Both are clinically proven. Here's how most patients choose.
      </div>

      <!-- FEATURE BOX -->
      <div class="features">
        <div class="frow">
          <div class="fcell">
            <div class="ficon">
           <img src="https://res.cloudinary.com/dcl5ecseg/image/upload/v1781646704/physicianguidedcare_uwuuub.png" alt="Physician" />
            </div>
            <div class="flabel">Physician-Guided<br />Care</div>
          </div>
          <div class="fcell">
            <div class="ficon">
            <img src="https://res.cloudinary.com/dcl5ecseg/image/upload/v1781646705/loseitforlifeprogram_twkqeu.png" alt="Lose It For Life" /> 
            </div>
            <div class="flabel">Lose It For Life®<br />Program</div>
          </div>
          <div class="fcell">
            <div class="ficon">
            <img src="https://res.cloudinary.com/dcl5ecseg/image/upload/v1781646704/GLP-1nutritionprotocol-Picsart-BackgroundRemover_ull02n.png" alt="GLP-1 Nutrition Protocol" />
            </div>
            <div class="flabel">GLP-1 Nutrition<br />Protocol™</div>
          </div>
        </div>

        <div class="frow">
          <div class="fcell">
            <div class="ficon">

                <img src="https://res.cloudinary.com/dcl5ecseg/image/upload/v1781646704/concierge_eb3gi7.png" alt="Concierge Support" />
            </div>
            <div class="flabel">Concierge<br />Support</div>
          </div>
          <div class="fcell">
            <div class="ficon">
                <img src="https://res.cloudinary.com/dcl5ecseg/image/upload/v1781646705/ChatGPT_Image_Jun_16_2026_01_26_54_PM_jzrfop.png" alt="Free Shipping" />
              </svg>
            </div>
            <div class="flabel">Free<br />Shipping</div>
          </div>
          <div class="fcell">
            <div class="ficon">
                <img src="https://res.cloudinary.com/dcl5ecseg/image/upload/v1781646704/ChatGPT_Image_Jun_16_2026_01_29_42_PM_iykuqj.png" alt="Injection Supplies Included" />
            </div>
            <div class="flabel">Injection Supplies<br />Included</div>
          </div>
        </div>

  <div class="hdiv hdiv-1"></div>
<div class="hdiv hdiv-2"></div>
<div class="hdiv hdiv-3"></div>

<div class="vdiv" style="left:33.33%;top:11%;height:31%;"></div>
<div class="vdiv" style="left:66.66%;top:11%;height:31%;"></div>
<div class="vdiv" style="left:33.33%;top:58%;height:31%;"></div>
<div class="vdiv" style="left:66.66%;top:58%;height:31%;"></div>
      </div>

      

<div id="med-cards" class="med-list"></div>

<button id="continue-btn" class="continue-btn" type="button">
  Continue to Plan Selection
  <svg class="arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M5 12h14"/>
    <path d="M13 6l6 6-6 6"/>
  </svg>
</button>

      
    </div>
`;

/* 1) DATA ----------------------------------------------------- */
const medications = [
  {
    id: "tirzepatide",
    name: "Tirzepatide",
    price: "199",
    badge: "MOST POPULAR", // '' / null = no badge
    image:
      "https://res.cloudinary.com/dcl5ecseg/image/upload/v1781645810/tirzepatide_rxgrcd.png", // <-- vial image URL here
    description:
      "The newest and most powerful GLP-1. Patients typically lose 20% or more of body weight. Most patients choose this.",
    selected: true,
  },
  {
    id: "semaglutide",
    name: "Semaglutide",
    price: "129",
    badge: "",
    image:
      "https://res.cloudinary.com/dcl5ecseg/image/upload/v1781645969/semaglutide_vdtcaa.png", // <-- vial image URL here
    description:
      "The original GLP-1 — clinically proven with millions of patients worldwide. A strong option for those who prefer to start with the original GLP-1.",
    selected: false,
  },
];

const STAR =
  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 18.4 6.1 21l1.2-6.5L2.5 9.9l6.6-.9z"/></svg>';

/* 2) TEMPLATE ------------------------------------------------- */
function cardHTML(med) {
  const img = med.image
    ? `<img src="${med.image}" alt="${med.name}">`
    : `<span class="ph">Vial image<br>here</span>`;
  return `
    <div class="med-card ${med.badge ? "has-badge" : ""} ${med.selected ? "selected" : ""}"
         data-id="${med.id}" role="radio" aria-checked="${med.selected}" tabindex="0">
      ${med.badge ? `<div class="med-badge">${STAR}${med.badge}</div>` : ""}
      <div class="med-radio"></div>
      <div class="med-body">
        <div class="med-image">${img}</div>
        <div class="med-content">
          <h3 class="med-name">${med.name}</h3>
          <div class="med-starting">Starting at</div>
          <div class="med-price">
            <span class="cur">$</span><span class="amt">${med.price}</span><span class="star">*</span><span class="per">/mo</span>
          </div>
          <div class="med-divider"></div>
          <p class="med-desc">${med.description}</p>
        </div>
      </div>
    </div>`;
}

/* 3) RENDER (map -> innerHTML) -------------------------------- */
const medContainer = document.getElementById("med-cards");
function renderSkeleton() {
  medContainer.innerHTML = medications.map(med => `
    <div class="med-card skeleton ${med.badge ? 'has-badge' : ''}">
      ${med.badge ? `<div class="med-badge">${STAR}${med.badge}</div>` : ''}
      <div class="med-radio"></div>
      <div class="med-body">
        <div class="med-image"><img src="${med.image}" alt=""></div>
        <div class="med-content">
          <h3 class="med-name">${med.name}</h3>
          <div class="med-starting">Starting at</div>
          <div class="med-price">
            <span class="cur">$</span><span class="amt">${med.price}</span><span class="star">*</span><span class="per">/mo</span>
          </div>
          <div class="med-divider"></div>
          <p class="med-desc">${med.description}</p>
        </div>
      </div>
    </div>`
  ).join('');
}
function render() {
  medContainer.innerHTML = medications.map(cardHTML).join("");
}

function setupCustomCards() {
  baskButtons.semaglutide = [...document.querySelectorAll("h1")]
    .find((el) => el.textContent.trim() === "Personalized Semaglutide Program")
    ?.closest("button");

  baskButtons.tirzepatide = [...document.querySelectorAll("h1")]
    .find((el) => el.textContent.trim() === "Personalized Tirzepatide Program")
    ?.closest("button");

  if (!baskButtons.semaglutide || !baskButtons.tirzepatide) {
    console.log("[BASK] Buttons not found yet, retrying...");
    setTimeout(setupCustomCards, 500);
    return;
  }

  console.log("[BASK] Both buttons found");
  console.log("[BASK] semaglutide classes:", baskButtons.semaglutide.className);
  console.log("[BASK] tirzepatide classes:", baskButtons.tirzepatide.className);

  const observeTarget =
    baskButtons.semaglutide.closest("form") ||
    baskButtons.semaglutide.parentElement;
  console.log("[BASK] Will observe:", observeTarget);


 renderSkeleton();
  console.log('[BASK] Skeleton shown, waiting 1s before reading selection...');

  setTimeout(() => {
    const delayed = baskButtons.semaglutide.classList.contains('ring-2') ? 'semaglutide'
      : baskButtons.tirzepatide.classList.contains('ring-2') ? 'tirzepatide'
      : null;

    console.log('[BASK] After 1s — resolved selection:', delayed);
    medications.forEach(m => m.selected = (m.id === (delayed || 'tirzepatide')));
    render();
  }, 1000);

  // Keep watching permanently for API-driven changes
  const selectionObserver = new MutationObserver(() => {
    const semHas = baskButtons.semaglutide.classList.contains("ring-2");
    const tirzHas = baskButtons.tirzepatide.classList.contains("ring-2");
    const id = semHas ? "semaglutide" : tirzHas ? "tirzepatide" : null;

    console.log(
      "[BASK] class change — sema ring-2:",
      semHas,
      "| tirz ring-2:",
      tirzHas,
      "| resolved:",
      id,
    );

    if (id) {
      const current = medications.find((m) => m.selected)?.id;
      if (current !== id) {
        console.log("[BASK] Selection changed from", current, "to", id);
        medications.forEach((m) => (m.selected = m.id === id));
        render();
      }
    }
  });

  selectionObserver.observe(observeTarget, {
    attributes: true,
    attributeFilter: ["class"],
    subtree: true,
  });

  console.log("[BASK] Permanent observer started");
}

setupCustomCards();
/* 4) SELECTION ------------------------------------------------ */
function selectCard(id) {
  medications.forEach((m) => (m.selected = m.id === id));
  medContainer.querySelectorAll(".med-card").forEach((card) => {
    const on = card.dataset.id === id;
    card.classList.toggle("selected", on);
    card.setAttribute("aria-checked", on);
  });
  onSelectionChange(id);
}
function onSelectionChange(id) {
  console.log("Selected medication:", id);
  console.log("Available buttons:", baskButtons);

  if (baskButtons[id]) {
    console.log("Clicking button:", baskButtons[id]);
    baskButtons[id].click();
  } else {
    console.warn(`Button not found for "${id}"`);
  }
}
medContainer.addEventListener("click", (e) => {
  const c = e.target.closest(".med-card");
  if (c) selectCard(c.dataset.id);
});
medContainer.addEventListener("keydown", (e) => {
  if (e.key === " " || e.key === "Enter") {
    const c = e.target.closest(".med-card");
    if (c) {
      e.preventDefault();
      selectCard(c.dataset.id);
    }
  }
});

document.getElementById("continue-btn").addEventListener("click", onContinue);

function onContinue() {
  continueButton?.click();
}
