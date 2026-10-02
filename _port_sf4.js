// Port supportingFunctions.js, stage 4: the radial-import branch in
// insertComponentsForData.
//
// When the user picks "Radial" in the import prompt, bus positions come from
// importRadialLayout's layoutRadialSld instead of the geo/BFS paths, and the
// per-import window flags record which buses are leaves or side-mounted so the
// element placement further down can fan them correctly.
const fs = require('fs');
const P = 'src/main/webapp/js/electrisim/supportingFunctions.js';
let s = fs.readFileSync(P, 'utf8');
const NL = '\n';
const must = (c, m) => { if (!c) { console.error('ANCHOR FAILED: ' + m); process.exit(1); } };

const ANCHOR = "        if (importLayoutChoice === 'vertical') {";
must(s.includes(ANCHOR), 'vertical layout branch');

const RADIAL = [
    '        window._elxxxRadialImport = false;',
    '        window._elxxxRadialLeaves = new Set();',
    '        window._elxxxRadialSides = new Set();',
    '        window._elxxxUfn = {};',
    '',
    "        if (importLayoutChoice === 'radial') {",
    '            try {',
    '                const rawUfn = data._object.user_friendly_names && data._object.user_friendly_names._object;',
    "                window._elxxxUfn = typeof rawUfn === 'string' ? JSON.parse(rawUfn) : (rawUfn || {});",
    '            } catch (e) {',
    '                window._elxxxUfn = {};',
    '            }',
    '            try {',
    '                busPositions = elLayoutRadial(',
    '                    busData.data,',
    '                    lineData.data,',
    '                    transformerData.data,',
    '                    (externalGridData && externalGridData.data) || [],',
    '                    layoutCenterX,',
    '                    startY,',
    '                );',
    '                importPandapowerVerticalSld = true;',
    '                window._elxxxRadialImport = true;',
    '                busPositions.forEach((pos, busIndex) => {',
    '                    if (!pos || !busData.data[busIndex]) return;',
    '                    if (pos.leaf) window._elxxxRadialLeaves.add(String(busData.data[busIndex][0]));',
    '                    if (pos.side) window._elxxxRadialSides.add(String(busData.data[busIndex][0]));',
    '                });',
    '            } catch (err) {',
    "                console.warn('Radial layout failed', err);",
    '                busPositions = null;',
    '            }',
    '        }',
    '',
].join(NL);

s = s.replace(ANCHOR, RADIAL + ANCHOR);

fs.writeFileSync(P, s);
console.log('stage 4 applied: radial import branch');
