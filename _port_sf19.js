// Port supportingFunctions.js, stage 19: radial choice reaches the 1ph feeder.
//
// The OpenDSS single-phase feeder import only had two drawings, left-to-right
// and top-to-bottom. Now that the prompt offers "radial" it has to map onto one
// of them, and a plant single-line runs left to right.
const fs = require('fs');
const P = 'src/main/webapp/js/electrisim/supportingFunctions.js';
let s = fs.readFileSync(P, 'utf8');
const NL = '\n';
const must = (c, m) => { if (!c) { console.error('ANCHOR FAILED: ' + m); process.exit(1); } };

const OLD = "            const layout = data?._object?._import_layout === 'horizontal' ? 'horizontal' : 'vertical';";
const NEW = [
    "            const layout = data?._object?._import_layout === 'horizontal'",
    "                || data?._object?._import_layout === 'radial'",
    "                ? 'horizontal'",
    "                : 'vertical';",
].join(NL);

must(s.includes(OLD), '1ph feeder layout choice');
s = s.replace(OLD, NEW);

fs.writeFileSync(P, s);
console.log('stage 19 applied: radial choice for the 1ph feeder import');
