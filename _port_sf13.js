// Port supportingFunctions.js, stage 13: shunt/capacitor and load placement.
//
// Both now hang straight below the busbar, fanned sideways by importDeviceSlotX
// so several devices on one bus do not stack on top of each other, and dropped
// onto the bar with importStraightShuntDropStyle instead of the pin-allocating
// router. A radial "side" bus mounts its shunt to the right of the bar instead.
const fs = require('fs');
const P = 'src/main/webapp/js/electrisim/supportingFunctions.js';
let s = fs.readFileSync(P, 'utf8');
const NL = '\n';
const must = (c, m) => { if (!c) { console.error('ANCHOR FAILED: ' + m); process.exit(1); } };

// --- shunt / capacitor placement ----------------------------------------
const SH_OLD = [
    "                const [shW, shH] = vertexSizeFromElectrisimSymbol(symbolKey, asCapacitor ? 35 : 30, asCapacitor ? 56 : 20);",
    '                const shuntXOffset = importPandapowerVerticalSld ? 0 : 60;',
    '                const anchorX = busVertex.geometry.x + IMPORT_BUSBAR_W / 2 + shuntXOffset;',
    '                const anchorY = busVertex.geometry.y + (asCapacitor ? 90 : 60);',
    '                const styleShuntOrCap = vertexStyleFromElectrisimSymbol(symbolKey, shapeName);',
].join(NL);

const SH_NEW = [
    '                const [shW, shH] = asCapacitor',
    '                    ? vertexSizeFromElectrisimSymbol(symbolKey, 35, 56)',
    '                    : [28, 56];',
    '                const shuntXOffset = importDeviceSlotX(busVertex);',
    '                const sideShunt = window._elxxxRadialSides && window._elxxxRadialSides.has(String(bus_name));',
    '                const anchorX = sideShunt',
    '                    ? busVertex.geometry.x + busVertex.geometry.width + 36',
    '                    : busVertex.geometry.x + busVertex.geometry.width / 2 + shuntXOffset;',
    '                // anchorY is the top edge here, not the centre.',
    '                const anchorY = sideShunt',
    '                    ? busVertex.geometry.y - 8',
    '                    : busVertex.geometry.y + busVertex.geometry.height + 78;',
    '                const styleShuntOrCap = asCapacitor',
    '                    ? vertexStyleFromElectrisimSymbol(symbolKey, shapeName)',
    "                    : 'pointerEvents=1;verticalLabelPosition=bottom;shadow=0;dashed=0;align=center;html=1;verticalAlign=top;shape=mxgraph.electrical.inductors.choke;shapeELXXX=Shunt Reactor';",
].join(NL);

must(s.includes(SH_OLD), 'shunt placement');
s = s.replace(SH_OLD, SH_NEW);

// The shunt vertex is positioned from its top edge, so drop the centring offset.
const SH_INSERT = [
    '                    anchorX - shW / 2,',
    '                    anchorY - shH / 2,',
    '                    shW,',
    '                    shH,',
    '                    styleShuntOrCap',
].join(NL);
must(s.includes(SH_INSERT), 'shunt insertVertex');
s = s.replace(SH_INSERT, [
    '                    anchorX - shW / 2,',
    '                    anchorY,',
    '                    shW,',
    '                    shH,',
    '                    styleShuntOrCap',
].join(NL));

// --- shunt drop edge ----------------------------------------------------
const SH_EDGE_OLD = [
    '                if (busVertex) {',
    '                    grafka.insertEdge(',
    '                        parent,',
    '                        null,',
    "                        '',",
    '                        vertex,',
    '                        busVertex,',
    '                        importDeviceToBusEdgeStyle(vertex, busVertex, allocateBusPin, importPandapowerVerticalSld),',
    '                    );',
    '                }',
].join(NL);

const SH_EDGE_NEW = [
    '                if (busVertex && vertex) {',
    "                    const dropEdge = grafka.insertEdge(parent, null, '', vertex, busVertex,",
    '                        importStraightShuntDropStyle(vertex, busVertex));',
    "                    if (dropEdge && dropEdge.geometry && typeof mxPoint !== 'undefined') {",
    '                        // Hold the drop under the device until it is clear of the bar.',
    '                        const geo = dropEdge.geometry.clone();',
    '                        geo.points = [new mxPoint(anchorX, busVertex.geometry.y + busVertex.geometry.height + 28)];',
    '                        grafka.getModel().setGeometry(dropEdge, geo);',
    '                    }',
    '                }',
].join(NL);

must(s.includes(SH_EDGE_OLD), 'shunt drop edge');
s = s.replace(SH_EDGE_OLD, SH_EDGE_NEW);

// --- load placement -----------------------------------------------------
const LD_OLD = [
    '                const loadOffset = index * 35;',
    "                const [ldW, ldH] = vertexSizeFromElectrisimSymbol('sym-load', 30, 20);",
    '                const anchorX = busVertex.geometry.x + IMPORT_BUSBAR_W / 2 - 60 + loadOffset;',
    '                const anchorY = busVertex.geometry.y + 80;',
].join(NL);

const LD_NEW = [
    '                const loadOffset = importDeviceSlotX(busVertex);',
    "                const [ldW, ldH] = vertexSizeFromElectrisimSymbol('sym-load', 30, 20);",
    '                const anchorX = busVertex.geometry.x + busVertex.geometry.width / 2 + loadOffset;',
    '                // anchorY is the top edge here, not the centre.',
    '                const anchorY = busVertex.geometry.y + busVertex.geometry.height + 78;',
].join(NL);

must(s.includes(LD_OLD), 'load placement');
s = s.replace(LD_OLD, LD_NEW);

const LD_INSERT = [
    '                    anchorX - ldW / 2,',
    '                    anchorY - ldH / 2,',
    '                    ldW,',
    '                    ldH,',
    '                    loadStyle',
].join(NL);
must(s.includes(LD_INSERT), 'load insertVertex');
s = s.replace(LD_INSERT, [
    '                    anchorX - ldW / 2,',
    '                    anchorY,',
    '                    ldW,',
    '                    ldH,',
    '                    loadStyle',
].join(NL));

// --- load drop edge -----------------------------------------------------
const LD_EDGE_OLD = [
    '                const edgeStyle = "edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;exitX=0.5;exitY=0;exitDx=0;exitDy=0;exitPerimeter=0;entryX=0.3;entryY=0.5;entryDx=0;entryDy=0;entryPerimeter=0;;shapeELXXX=NotEditableLine";',
    '',
    '                if (busVertex) {',
    '                    grafka.insertEdge(parent, null, "", vertex, busVertex, edgeStyle);',
    '                }',
].join(NL);

const LD_EDGE_NEW = [
    '                if (busVertex && vertex) {',
    '                    const dropEdge = grafka.insertEdge(parent, null, "", vertex, busVertex,',
    '                        importStraightShuntDropStyle(vertex, busVertex));',
    "                    if (dropEdge && dropEdge.geometry && typeof mxPoint !== 'undefined') {",
    '                        // Hold the drop under the device until it is clear of the bar.',
    '                        const geo = dropEdge.geometry.clone();',
    '                        geo.points = [new mxPoint(anchorX, busVertex.geometry.y + busVertex.geometry.height + 28)];',
    '                        grafka.getModel().setGeometry(dropEdge, geo);',
    '                    }',
    '                }',
].join(NL);

// The same edgeStyle + insertEdge pair appears in several device sections, so
// start the search at the load section itself.
const ldAt = s.indexOf('configureLoadAttributes(grafka, vertex, {');
must(ldAt > 0, 'configureLoadAttributes');
const ldEdgeAt = s.indexOf(LD_EDGE_OLD, ldAt);
must(ldEdgeAt > ldAt, 'load drop edge');
s = s.slice(0, ldEdgeAt) + LD_EDGE_NEW + s.slice(ldEdgeAt + LD_EDGE_OLD.length);

fs.writeFileSync(P, s);
console.log('stage 13 applied: shunt/capacitor + load placement');
