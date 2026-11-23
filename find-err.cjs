const fs = require('fs');
const path = require('path');
const { keccak256, toBytes } = require('viem');
const root = 'node_modules/@chain-protocol/casino-sdk';
const set = new Set();
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(js|sol|json)$/.test(e.name)) {
      const t = fs.readFileSync(p, 'utf8');
      const re = /error\s+([A-Za-z0-9_]+\([^)]*\))/g;
      let m;
      while ((m = re.exec(t))) set.add(m[1]);
    }
  }
})(root);
let found = false;
for (const e of set) {
  const sel = keccak256(toBytes(e)).slice(0, 10);
  if (sel === '0x98fcd788') { console.log('MATCH:', e); found = true; }
}
if (found === false) console.log('no match among', set.size, 'error signatures');
