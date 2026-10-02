// Port supportingFunctions.js, stage 10: generator placement.
//
// Generators used to fan out by their index in the whole file, so two machines
// on different buses were still offset from each other. They now take a slot per
// bus (_elxxxGenSlot) and alternate left/right around it.
//
// Placement also became layout-aware: a radial leaf bus hangs its machine below,
// any other radial bus puts it to the left of the bar, and a transmission import
// places it above. The symbol points down with a south port constraint so the
// drop lands on the busbar.
const fs = require('fs');
const P = 'src/main/webapp/js/electrisim/supportingFunctions.js';
let s = fs.readFileSync(P, 'utf8');
const NL = '\n';
const must = (c, m) => { if (!c) { console.error('ANCHOR FAILED: ' + m); process.exit(1); } };

const OLD = [
    '                const generatorOffset = index * 30;',
    "                const [genW, genH] = vertexSizeFromElectrisimSymbol('sym-generator', 45, 45);",
    '                const anchorX = busVertex.geometry.x + IMPORT_BUSBAR_W / 2 + generatorOffset;',
    '                const anchorY = busVertex.geometry.y + 80;',
    "                const styleGenerator = vertexStyleFromElectrisimSymbol('sym-generator', 'Generator');",
].join(NL);

const NEW = [
    "                const slotKey = busVertex ? String(busVertex.id) : '';",
    '                const nSlot = window._elxxxGenSlot && busVertex',
    '                    ? (window._elxxxGenSlot.get(slotKey) || 0)',
    '                    : 0;',
    '                if (busVertex && window._elxxxGenSlot) window._elxxxGenSlot.set(slotKey, nSlot + 1);',
    '                const generatorOffset = nSlot === 0',
    '                    ? 0',
    '                    : (nSlot % 2 ? 1 : -1) * Math.ceil(nSlot / 2) * 48;',
    '',
    "                const [genW, genH] = vertexSizeFromElectrisimSymbol('sym-generator', 45, 45);",
    '                const genLeaf = window._elxxxRadialImport',
    '                    && window._elxxxRadialLeaves',
    '                    && window._elxxxRadialLeaves.has(String(bus_name));',
    '                const anchorX = (window._elxxxRadialImport && !genLeaf)',
    '                    ? busVertex.geometry.x - 150 + generatorOffset',
    '                    : busVertex.geometry.x + busVertex.geometry.width / 2 + generatorOffset;',
    '                const anchorY = genLeaf',
    '                    ? busVertex.geometry.y + (busVertex.geometry.height || 12) + 70',
    '                    : (window._elxxxRadialImport ? busVertex.geometry.y - 70 : busVertex.geometry.y - 130);',
    "                const styleGenerator = vertexStyleFromElectrisimSymbol('sym-generator', 'Generator')",
    "                    .replace('sym-generator.svg', 'sym-generator-down.svg') + ';portConstraint=south';",
].join(NL);

must(s.includes(OLD), 'generator placement');
s = s.replace(OLD, NEW);

fs.writeFileSync(P, s);
console.log('stage 10 applied: generator placement');
