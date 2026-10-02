// Port supportingFunctions.js, stage 20: the large-import flags are now set.
//
// The import already reset these in its finally block but never set them, so
// every large-import shortcut downstream (straight line edges instead of
// orthogonal routing, the shared lane counter, the per-bus generator and device
// slots, the line and transformer tap maps) was dead code. They are set here,
// just before the bus vertices go in, from the same bus-count threshold that
// decides the band spacing.
const fs = require('fs');
const P = 'src/main/webapp/js/electrisim/supportingFunctions.js';
let s = fs.readFileSync(P, 'utf8');
const NL = '\n';
const must = (c, m) => { if (!c) { console.error('ANCHOR FAILED: ' + m); process.exit(1); } };

// --- 1. the transformer-end alignment becomes small-diagram only ---------
const ALIGN = [
    '            // Pulling transformer ends onto a shared x only helps a small diagram;',
    '            // on a large one it collapses the grid built above.',
    '            if (busCount <= 40) transformerData.data.forEach((trafo) => {',
].join(NL);
must(s.includes(ALIGN), 'transformer end alignment guard');
s = s.replace(ALIGN, [
    '            // Pulling transformer ends onto a shared x only helps a small diagram;',
    '            // on a large one it collapses the grid built above.',
    '            if (!(busCount > 40)) transformerData.data.forEach((trafo) => {',
].join(NL));

// --- 2. set the flags before the vertices go in --------------------------
const VERTICES = '            // Create vertices using the calculated positions';
must(s.includes(VERTICES), 'bus vertex creation');
s = s.replace(VERTICES, [
    '        // Past this many buses the import takes its cheaper paths: straight',
    '        // line edges rather than pin-allocated orthogonal ones, thin bars, and',
    '        // no placeholder vertices.',
    '        grafka._elxxxSkipPlaceholders = busCount > 40;',
    '        window._elxxxLargeImport = busCount > 40;',
    '        window._elxxxOrthoLane = 0;',
    '        window._elxxxGenSlot = new Map();',
    '        window._elxxxDevSlot = new Map();',
    '        window._elxxxLineTap = new Map();',
    '        window._elxxxTrafoTap = new Map();',
    VERTICES,
].join(NL));

// --- 3. the thin-bar height goes straight into the call ------------------
// Terser cannot hoist it past the style lookup, so HEAD has it inline.
must(s.includes('                const busH = busCount > 40 ? 2 : IMPORT_BUSBAR_H;' + NL), 'busH');
s = s.replace('                const busH = busCount > 40 ? 2 : IMPORT_BUSBAR_H;' + NL, '');

const CALL = [
    '                    busW,',
    '                    busH,',
    '                    busStyle',
].join(NL);
must(s.includes(CALL), 'bus insertVertex');
s = s.replace(CALL, [
    '                    busW,',
    '                    // A large import draws hairline bars.',
    '                    busCount > 40 ? 2 : IMPORT_BUSBAR_H,',
    '                    busStyle',
].join(NL));

fs.writeFileSync(P, s);
console.log('stage 20 applied: large-import flags');
