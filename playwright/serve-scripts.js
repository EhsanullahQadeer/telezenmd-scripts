/**
 * Tiny HTTP server that serves custom-js/ at http://localhost:4321/
 * Run standalone:  node playwright/serve-scripts.js
 * Or imported from tests: require('../serve-scripts')
 *
 * Files available:
 *   http://localhost:4321/GLP1Checkout.min.js
 *   http://localhost:4321/GLP1Checkout.js
 *   http://localhost:4321/baskupdate.min.js
 *   http://localhost:4321/Semaglutide.min.js
 *   (any file in custom-js/)
 */

const http = require("http");
const fs   = require("fs");
const path = require("path");

const PORT     = 4321;
const SERVE_DIR = path.join(__dirname, "..", "custom-js");

const MIME = {
  ".js":  "application/javascript",
  ".css": "text/css",
  ".html":"text/html",
  ".json":"application/json",
};

function createServer() {
  return http.createServer((req, res) => {
    // CORS — allows Playwright-injected page at any origin to load the file
    res.setHeader("Access-Control-Allow-Origin", "*");

    const file = path.join(SERVE_DIR, path.basename(req.url.split("?")[0]));
    if (!fs.existsSync(file)) {
      res.writeHead(404); res.end("Not found: " + path.basename(file)); return;
    }
    const ext = path.extname(file);
    res.setHeader("Content-Type", MIME[ext] || "text/plain");
    fs.createReadStream(file).pipe(res);
  });
}

// When run directly (node serve-scripts.js) → stay alive
if (require.main === module) {
  const server = createServer();
  server.listen(PORT, () => {
    console.log(`\n✅  Script server running at http://localhost:${PORT}/`);
    console.log(`   Serving: ${SERVE_DIR}`);
    console.log(`\n   Examples:`);
    console.log(`     http://localhost:${PORT}/GLP1Checkout.min.js`);
    console.log(`     http://localhost:${PORT}/baskupdate.min.js`);
    console.log("\n   Ctrl+C to stop\n");
  });
} else {
  // When required from a test — start and return a stop() function
  module.exports = function startServer() {
    return new Promise((resolve) => {
      const server = createServer();
      server.listen(PORT, () => {
        console.log(`[serve] localhost:${PORT} ready`);
        resolve(() => server.close());
      });
      server.on("error", (e) => {
        if (e.code === "EADDRINUSE") {
          // Already running — that's fine, just resolve with a no-op stop
          console.log(`[serve] port ${PORT} already in use — assuming server is up`);
          resolve(() => {});
        } else {
          throw e;
        }
      });
    });
  };
}
