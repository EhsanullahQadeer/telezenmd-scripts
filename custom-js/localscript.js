var container = document.getElementById("script-container");
if (!container) return;

// DEV: load from localhost (keep server running: node playwright/serve-scripts.js)
(function () {
  var s = document.createElement("script");
  s.src = "http://localhost:4321/GLP1Checkout.min.js";
  document.head.appendChild(s);
})();
