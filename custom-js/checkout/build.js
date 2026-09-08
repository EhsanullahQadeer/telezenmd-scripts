/**
 * Build script — compiles GLP1Checkout.js into one minified file per drug.
 * Usage:  node custom-js/checkout/build.js
 *         npm run build
 */

const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const SRC = path.join(__dirname, 'GLP1Checkout.js');

const DRUGS = [
  { name: 'Semaglutide',  out: path.join(__dirname, 'SemaglutideCheckout.min.js') },
  { name: 'Tirzepatide',  out: path.join(__dirname, 'TirzepatideCheckout.min.js') },
];

const src = fs.readFileSync(SRC, 'utf8');

for (const drug of DRUGS) {
  const patched = src.replace(
    /^var DRUG_NAME\s*=\s*'[^']*';/m,
    `var DRUG_NAME = '${drug.name}';`
  );

  const tmp = path.join(os.tmpdir(), `glp1_${drug.name}_${Date.now()}.js`);
  fs.writeFileSync(tmp, `(function(){\n${patched}\n})();`, 'utf8');

  try {
    execSync(
      `npx terser "${tmp}" --compress drop_console=true --mangle --output "${drug.out}"`,
      { stdio: 'pipe' }
    );
    const size = (fs.statSync(drug.out).size / 1024).toFixed(1);
    console.log(`✓  ${drug.name.padEnd(14)} → ${path.basename(drug.out)}  (${size} KB)`);
  } finally {
    fs.unlinkSync(tmp);
  }
}
