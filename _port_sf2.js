// Port supportingFunctions.js, stage 2: geometry fixes, the two small import
// helpers, the layout-choice plumbing, and the finally block that invokes the
// elRadial*/elTransmission* helpers added in stage 1.
const fs = require('fs');
const P = 'src/main/webapp/js/electrisim/supportingFunctions.js';
let s = fs.readFileSync(P, 'utf8');
const NL = '\n';
const must = (c, m) => { if (!c) { console.error('ANCHOR FAILED: ' + m); process.exit(1); } };
const sub = (from, to, label) => { must(s.includes(from), label); s = s.replace(from, to); };

// --- 1. busbar geometry follows the actual cell, not the default size ----
//     Radial import draws narrower, thinner buses (56/110 px wide, 2 px tall),
//     so the hard-coded defaults put pins and drops in the wrong place.
sub("        x: busVertex.geometry.x + IMPORT_BUSBAR_W / 2,",
    "        x: busVertex.geometry.x + (busVertex.geometry.width || IMPORT_BUSBAR_W) / 2,",
    'importBusbarCenterXY width');

sub("    return busVertex.geometry.y + IMPORT_BUSBAR_H / 2;",
    "    return busVertex.geometry.y + busVertex.geometry.height / 2;",
    'importBusbarElectricalY height');

// --- 2. trafo3w drop uses an orthogonal edge, not the jump-style base ----
sub("    return (" + NL +
    "        `${IMPORT_VERTICAL_SLD_EDGE_BASE}` +" + NL +
    "        `exitX=0.5;exitY=${busAbove ? 0 : 1};exitDx=0;exitDy=0;exitPerimeter=0;` +" + NL +
    "        `entryX=${entryX};entryY=${IMPORT_BUSBAR_EDGE_Y};entryDx=0;entryDy=0;entryPerimeter=0;;shapeELXXX=NotEditableLine`" + NL +
    "    );",
    "    return (" + NL +
    "        'edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;jettySize=0;orthogonalLoop=1;' +" + NL +
    "        `exitX=0.5;exitY=${busAbove ? 0 : 1};exitDx=0;exitDy=0;exitPerimeter=0;` +" + NL +
    "        `entryX=${entryX};entryY=${IMPORT_BUSBAR_EDGE_Y};entryDx=0;entryDy=0;entryPerimeter=0;shapeELXXX=NotEditableLine`" + NL +
    "    );",
    'importTrafo3wToBusEdgeStyle');

// --- 3. two small import helpers, before importTrafo3wToBusEdgeStyle ----
sub("function importTrafo3wToBusEdgeStyle(trafoVertex, busVertex, allocateBusPin) {",
    "/** Straight drop from a shunt-like device down (or up) onto its busbar. */" + NL +
    "function importStraightShuntDropStyle(deviceVertex, busVertex) {" + NL +
    "    const dg = deviceVertex?.geometry;" + NL +
    "    const bg = busVertex?.geometry;" + NL +
    "    if (!dg || !bg) {" + NL +
    "        return 'edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=none;jettySize=0;orthogonalLoop=0;exitX=0.5;exitY=0;entryX=0.5;entryY=0.5;exitPerimeter=0;entryPerimeter=0;shapeELXXX=NotEditableLine';" + NL +
    "    }" + NL +
    "    const cx = dg.x + dg.width / 2;" + NL +
    "    const busAbove = importBusbarElectricalY(busVertex) <= dg.y + dg.height / 2;" + NL +
    "    const entryX = Math.max(0.08, Math.min(0.92, (cx - bg.x) / (bg.width || 1)));" + NL +
    "    return `edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=none;jettySize=0;orthogonalLoop=0;exitX=0.5;exitY=${busAbove ? 0 : 1};exitDx=0;exitDy=0;exitPerimeter=0;entryX=${entryX};entryY=0.5;entryDx=0;entryDy=0;entryPerimeter=0;shapeELXXX=NotEditableLine`;" + NL +
    "}" + NL + NL +
    "/** Fan successive devices on the same bus sideways so they do not overlap. */" + NL +
    "function importDeviceSlotX(busVertex) {" + NL +
    "    const key = busVertex ? String(busVertex.id) : '';" + NL +
    "    const slots = window._elxxxDevSlot || (window._elxxxDevSlot = new Map());" + NL +
    "    const n = slots.get(key) || 0;" + NL +
    "    slots.set(key, n + 1);" + NL +
    "    return n === 0 ? 0 : (n % 2 ? 1 : -1) * Math.ceil(n / 2) * 52;" + NL +
    "}" + NL + NL +
    "function importTrafo3wToBusEdgeStyle(trafoVertex, busVertex, allocateBusPin) {",
    'importDeviceSlotX + importStraightShuntDropStyle');

// --- 4. the layout choice gains a 'radial' option -----------------------
sub("        const importLayoutChoice = data?._object?._import_layout === 'horizontal' ? 'horizontal' : 'vertical';",
    "        const _importLayout = data?._object?._import_layout;" + NL +
    "        const importLayoutChoice = _importLayout === 'horizontal'" + NL +
    "            ? 'horizontal'" + NL +
    "            : (_importLayout === 'radial' ? 'radial' : 'vertical');",
    'layout choice');

// --- 5. per-import scratch state, and the layout tidy-ups on the way out -
const FINALLY = "            grafka.getModel().endUpdate();";
const lastFinally = s.lastIndexOf(FINALLY);
must(lastFinally > 0, 'insertComponentsForData finally');
s = s.slice(0, lastFinally) +
    "            grafka._elxxxSkipPlaceholders = false;" + NL +
    "            window._elxxxLargeImport = false;" + NL +
    "            window._elxxxOrthoLane = 0;" + NL +
    "            window._elxxxGenSlot = new Map();" + NL +
    "            window._elxxxDevSlot = new Map();" + NL +
    "            window._elxxxLineTap = new Map();" + NL +
    "            window._elxxxTrafoTap = new Map();" + NL +
    "            try {" + NL +
    "                elRadialStraighten(grafka, parent);" + NL +
    "                elRadialFixSwitchLinks(grafka, parent);" + NL +
    "                elTransmissionFixCouplers(grafka, parent);" + NL +
    "                elTransmissionFixLineSwitches(grafka, parent);" + NL +
    "                elTransmissionFixTrafoSwitches(grafka, parent);" + NL +
    "            } catch (_rt) { /* layout tidy-up must never block the import */ }" + NL +
    "            try {" + NL +
    "                if (globalPandaPowerData) elApplySidecar(grafka, globalPandaPowerData);" + NL +
    "            } catch (_scErr) {" + NL +
    "                console.warn('Sidecar apply failed', _scErr);" + NL +
    "            }" + NL +
    s.slice(lastFinally);

fs.writeFileSync(P, s);
console.log('stage 2 applied:', s.split(NL).length, 'lines');
