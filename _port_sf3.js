// Port supportingFunctions.js, stage 3: findVertexByBusId.
//
// The old version scanned every child cell on every call and only looked at
// attributes[0], so it broke as soon as a bus carried another attribute first.
// HEAD builds a name -> cell map once and caches it on the parent, and accepts
// either `name` or the `pp_bus_name` written by the radial importer.
const fs = require('fs');
const P = 'src/main/webapp/js/electrisim/supportingFunctions.js';
let s = fs.readFileSync(P, 'utf8');
const NL = '\n';
const must = (c, m) => { if (!c) { console.error('ANCHOR FAILED: ' + m); process.exit(1); } };

const OLD = [
    'function findVertexByBusId(grafka, parent, busName) {',
    '    const childCells = grafka.getChildCells(parent, true, false);',
    '    //console.log("childCells");',
    '    //console.log(childCells);',
    '',
    '    for (let i = 0; i < childCells.length; i++) {',
    '        const cell = childCells[i];',
    '        if (cell.value === "PandapowerNet") {',
    '            continue;',
    '        } else {',
    '            if (String(cell.value.attributes[0].nodeValue) === String(busName)) {',
    '              ',
    '                return cell;',
    '            }',
    '        }',
    '    }',
    '    return null;',
    '}',
].join(NL);

const NEW = [
    'function findVertexByBusId(grafka, parent, busName) {',
    '    const want = String(busName);',
    '    // The map is rebuilt once per import and cached on the parent; callers hit',
    '    // this thousands of times on a large network.',
    '    if (parent && parent._elBusByName && parent._elBusByName.has(want)) {',
    '        return parent._elBusByName.get(want);',
    '    }',
    '',
    '    const childCells = grafka.getChildCells(parent, true, false);',
    '    const map = new Map();',
    '    let found = null;',
    '',
    '    for (let i = 0; i < childCells.length; i++) {',
    '        const cell = childCells[i];',
    '        if (!cell || !cell.value || cell.value === "PandapowerNet") continue;',
    '        const attrs = cell.value.attributes;',
    '        if (!attrs) continue;',
    '        for (let a = 0; a < attrs.length; a++) {',
    "            const nm = attrs[a].nodeName;",
    "            if ((nm === 'name' || nm === 'pp_bus_name') && attrs[a].nodeValue != null) {",
    '                const key = String(attrs[a].nodeValue);',
    '                if (!map.has(key)) map.set(key, cell);',
    '                if (key === want) found = cell;',
    '            }',
    '        }',
    '    }',
    '',
    '    if (parent) parent._elBusByName = map;',
    '    return found;',
    '}',
].join(NL);

must(s.includes(OLD), 'findVertexByBusId body');
s = s.replace(OLD, NEW);

fs.writeFileSync(P, s);
console.log('stage 3 applied: findVertexByBusId rewritten');

// The name->cell map is cached on the parent, so it must be dropped at the
// start of each import or the second import reuses the first one's buses.
const PARENT = 'var parent = grafka.getDefaultParent();';
const at = s.lastIndexOf(PARENT);
must(at > 0, 'getDefaultParent in insertComponentsForData');
s = s.slice(0, at + PARENT.length) +
    NL + '    if (parent) parent._elBusByName = null;' +
    s.slice(at + PARENT.length);

fs.writeFileSync(P, s);
console.log('bus-name cache invalidation added');
