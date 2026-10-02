// Port supportingFunctions.js, stage 1: the new imports and the import-layout
// block. The remaining in-place edits follow in stage 2.
//
// The six elRadial*/elTransmission* helpers were written straight into the
// minified file across commits c967051b / 25edf9cb / c4999894 - HEAD is not a
// terser fixed point (78,287 B -> 71,780 B) - so they are reproduced from
// _sf_importlayout.js verbatim rather than reconstructed.
const fs = require('fs');
const P = 'src/main/webapp/js/electrisim/supportingFunctions.js';
let s = fs.readFileSync(P, 'utf8');
const NL = '\n';
const must = (c, m) => { if (!c) { console.error('ANCHOR FAILED: ' + m); process.exit(1); } };
const sub = (from, to, label) => { must(s.includes(from), label); s = s.replace(from, to); };

// --- 1. the two new modules ---------------------------------------------
sub("} from './electricalSymbols.js';",
    "} from './electricalSymbols.js';" + NL +
    "import { applyElectrisimImportSidecar as elApplySidecar } from './applyElectrisimImportSidecar.js';" + NL +
    "import { layoutRadialSld as elLayoutRadial, suggestImportSystem as elSuggestSystem } from './importRadialLayout.js';",
    'new imports');

// --- 2. the import-layout helpers, after waitForData ---------------------
const WFD = 'function waitForData(timeoutMs = 10000) {';
const wfdStart = s.indexOf(WFD);
must(wfdStart >= 0, 'waitForData');
const NEXT = NL + 'function findVertexByBusId(';
const wfdEnd = s.indexOf(NEXT, wfdStart);
must(wfdEnd > wfdStart, 'findVertexByBusId (end of waitForData)');

const BLOCK = fs.readFileSync('_sf_importlayout.js', 'utf8').replace(/\r\n/g, NL).trimEnd();
s = s.slice(0, wfdEnd) + NL + NL + BLOCK + NL + s.slice(wfdEnd);

fs.writeFileSync(P, s);
console.log('stage 1 applied:', s.split(NL).length, 'lines');
