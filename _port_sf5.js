// Port supportingFunctions.js, stage 5: the geo-layout rewrite.
//
//  - importGeoCanvasOk: a new guard. Geo coordinates are only used when the
//    resulting canvas has a sane aspect ratio; a 1000:1 sliver of a network was
//    previously accepted and produced an unusable diagram.
//  - importBusPositionsFromGeo: rewritten (see _sf_geopositions.js).
const fs = require('fs');
const P = 'src/main/webapp/js/electrisim/supportingFunctions.js';
let s = fs.readFileSync(P, 'utf8');
const NL = '\n';
const must = (c, m) => { if (!c) { console.error('ANCHOR FAILED: ' + m); process.exit(1); } };
const sub = (from, to, label) => { must(s.includes(from), label); s = s.replace(from, to); };

// --- 1. replace importBusPositionsFromGeo wholesale ---------------------
const HEAD_FN = 'function importBusPositionsFromGeo(busData, anchorX, anchorY, scale) {';
const start = s.indexOf(HEAD_FN);
must(start >= 0, 'importBusPositionsFromGeo');
const END = NL + '}' + NL;
const end = s.indexOf(END, start);
must(end > start, 'importBusPositionsFromGeo terminator');

const NEWFN = fs.readFileSync('_sf_geopositions.js', 'utf8').replace(/\r\n/g, NL).trimEnd();
s = s.slice(0, start) + NEWFN + s.slice(end + END.length - 1);

// --- 2. the canvas sanity guard, right before it ------------------------
sub(NEWFN.slice(0, NEWFN.indexOf(NL)),
    [
        '/**',
        ' * Are the geo coordinates worth using as a layout?',
        ' *',
        ' * Small networks always are. Very large ones never are. In between, a canvas',
        ' * whose aspect ratio is extreme (a sliver) produces an unusable diagram, so',
        ' * fall through to the feeder/voltage-group layouts instead.',
        ' */',
        'function importGeoCanvasOk(busData) {',
        '    const n = busData.data.length;',
        '    if (n <= 40) return true;',
        '    if (n > 12000) return false;',
        '    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;',
        '    for (let i = 0; i < n; i++) {',
        '        const row = busData.data[i];',
        '        const x = Number(row[4]);',
        '        const y = Number(row[5]);',
        '        minX = Math.min(minX, x);',
        '        maxX = Math.max(maxX, x);',
        '        minY = Math.min(minY, y);',
        '        maxY = Math.max(maxY, y);',
        '    }',
        '    const dx = maxX - minX;',
        '    const dy = maxY - minY;',
        '    if (!(dx > 1e-6) || !(dy > 1e-6)) return false;',
        '    const aspect = dx / dy;',
        '    return aspect >= 0.25 && aspect <= 4;',
        '}',
        '',
        NEWFN.slice(0, NEWFN.indexOf(NL)),
    ].join(NL),
    'importGeoCanvasOk');

// --- 3. the call site consults both guards ------------------------------
sub('            if (importAllBusesHaveGeo(busData)) {',
    '            if (importAllBusesHaveGeo(busData) && importGeoCanvasOk(busData)) {',
    'geo guard call site');

fs.writeFileSync(P, s);
console.log('stage 5 applied:', s.split(NL).length, 'lines');
