// Port supportingFunctions.js, stage 12: static generator and storage placement.
//
// Static generators: a radial import whose friendly name or id looks like a wind
// machine gets the turbine symbol at 58 px instead of the generic one. A leaf bus
// hangs its machine below the bar (north port); everything else sits above it
// (south port).
//
// Storage: side-mounted on a radial side bus, below the bar on any other radial
// bus, and at the legacy offset otherwise.
const fs = require('fs');
const P = 'src/main/webapp/js/electrisim/supportingFunctions.js';
let s = fs.readFileSync(P, 'utf8');
const NL = '\n';
const must = (c, m) => { if (!c) { console.error('ANCHOR FAILED: ' + m); process.exit(1); } };

// --- static generator ---------------------------------------------------
const SG_OLD = [
    '                // Vertical SLD: centre under the LV bus (WTG column). Horizontal: legacy stagger.',
    '                const staticGenOffset = importPandapowerVerticalSld ? 0 : index * 40;',
    "                const [sgW, sgH] = vertexSizeFromElectrisimSymbol('sym-static-gen', 45, 45);",
    '                const anchorX = busVertex.geometry.x + IMPORT_BUSBAR_W / 2 + staticGenOffset;',
    '                const anchorY = busVertex.geometry.y + 120;',
    "                const styleStaticGenerator = vertexStyleFromElectrisimSymbol('sym-static-gen', 'Static Generator');",
].join(NL);

const SG_NEW = [
    '                const staticGenOffset = 0;',
    '                // A radial import names its machines, so a wind plant can be drawn',
    '                // with turbine symbols rather than the generic static-generator one.',
    "                const sgFriendly = (window._elxxxUfn && (window._elxxxUfn[name] || window._elxxxUfn[bus_name])) || '';",
    "                const isWind = window._elxxxRadialImport && /wind|turbine/i.test(String(sgFriendly) + ' ' + name);",
    "                const sgSymbol = isWind ? 'sym-wind-turbine' : 'sym-static-gen';",
    '                const sgLeaf = window._elxxxRadialImport',
    '                    && window._elxxxRadialLeaves',
    '                    && window._elxxxRadialLeaves.has(String(bus_name));',
    '                const [sgW, sgH] = vertexSizeFromElectrisimSymbol(sgSymbol, isWind ? 58 : 45, isWind ? 58 : 45);',
    '                const anchorX = busVertex.geometry.x + busVertex.geometry.width / 2 + staticGenOffset;',
    '                const anchorY = sgLeaf',
    '                    ? busVertex.geometry.y + (busVertex.geometry.height || 12) + 70',
    '                    : busVertex.geometry.y - 200;',
    '                const styleStaticGenerator = (isWind',
    "                    ? vertexStyleFromElectrisimSymbol(sgSymbol, 'Wind Turbine')",
    "                    : vertexStyleFromElectrisimSymbol('sym-static-gen', 'Static Generator')",
    "                        .replace('sym-static-gen.svg', 'sym-static-gen-down.svg'))",
    "                    + (sgLeaf ? ';portConstraint=north' : ';portConstraint=south');",
].join(NL);

must(s.includes(SG_OLD), 'static generator placement');
s = s.replace(SG_OLD, SG_NEW);

// --- storage ------------------------------------------------------------
const ST_OLD = [
    "                const [stW, stH] = vertexSizeFromElectrisimSymbol('sym-storage', 30, 20);",
    '                const anchorX = busVertex.geometry.x + IMPORT_BUSBAR_W / 2 + 60;',
    '                const anchorY = busVertex.geometry.y + 60;',
].join(NL);

const ST_NEW = [
    "                const [stW, stH] = vertexSizeFromElectrisimSymbol('sym-storage', 30, 20);",
    '                const stSide = window._elxxxRadialSides && window._elxxxRadialSides.has(String(bus_name));',
    '                const anchorX = stSide',
    '                    ? busVertex.geometry.x + busVertex.geometry.width + 100',
    '                    : (window._elxxxRadialImport',
    '                        ? busVertex.geometry.x + busVertex.geometry.width / 2',
    '                        : busVertex.geometry.x + IMPORT_BUSBAR_W / 2 + 60);',
    '                const anchorY = stSide',
    '                    ? busVertex.geometry.y - 6',
    '                    : (window._elxxxRadialImport',
    '                        ? busVertex.geometry.y + (busVertex.geometry.height || 12) + 80',
    '                        : busVertex.geometry.y + 60);',
].join(NL);

must(s.includes(ST_OLD), 'storage placement');
s = s.replace(ST_OLD, ST_NEW);

fs.writeFileSync(P, s);
console.log('stage 12 applied: static generator + storage placement');
