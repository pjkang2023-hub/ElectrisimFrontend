// Port supportingFunctions.js, stage 16: machine and winding drop edges.
//
// Transformer windings no longer ask importTrafoToBusEdgeStyle for a style and
// let the router find its way. Each winding now leaves its own pin, runs 22 px
// straight out along the winding direction, then along a lane 36 px clear of
// the bar before tapping down, so the HV and LV drops of one transformer stop
// overlapping. A short radial drop skips the dog-leg.
//
// NOTE: the switch-present flag is destructured and never tested, so a winding
// edge is drawn even when the import already inserts bus-switch-trafo. That
// matches HEAD; it looks like a regression there, not a porting slip.
//
// Generators and static generators drop straight onto the bar at a tap taken
// from their own centre instead of going through importDeviceToBusEdgeStyle,
// which leaves that helper used only by the external grid.
const fs = require('fs');
const P = 'src/main/webapp/js/electrisim/supportingFunctions.js';
let s = fs.readFileSync(P, 'utf8');
const NL = '\n';
const must = (c, m) => { if (!c) { console.error('ANCHOR FAILED: ' + m); process.exit(1); } };
const sub = (from, to, label) => { must(s.includes(from), label); s = s.replace(from, to); };

// --- 1. transformer winding edges ---------------------------------------
const TR_OLD = [
    '                    // Create edges connecting transformer to buses (skip winding if import adds bus–switch–trafo)',
    '                    if (!skipHvEdge) {',
    '                        grafka.insertEdge(',
    '                            parent,',
    '                            null,',
    "                            '',",
    '                            vertex,',
    '                            hvBusVertex,',
    '                            importTrafoToBusEdgeStyle(vertex, hvBusVertex, true, importPandapowerVerticalSld, allocateBusPin),',
    '                        );',
    '                    }',
    '                    if (!skipLvEdge) {',
    '                        grafka.insertEdge(',
    '                            parent,',
    '                            null,',
    "                            '',",
    '                            vertex,',
    '                            lvBusVertex,',
    '                            importTrafoToBusEdgeStyle(vertex, lvBusVertex, false, importPandapowerVerticalSld, allocateBusPin),',
    '                        );',
    '                    }',
].join(NL);

const TR_NEW = [
    '                    // Stub out of the winding pin, run clear of the bar, then tap down.',
    '                    [[hvBusVertex, true, skipHvEdge], [lvBusVertex, false, skipLvEdge]]',
    '                        .forEach(([busV, isHvWinding, hasSwitch]) => {',
    '                            if (!busV || !vertex.geometry) return;',
    '                            const tg = vertex.geometry;',
    '                            const bg = busV.geometry;',
    '                            const cx = tg.x + tg.width / 2;',
    '                            const cy = tg.y + tg.height / 2;',
    '                            const bx = bg.x + bg.width / 2;',
    '                            const by = bg.y + bg.height / 2;',
    "                            const rotated = /rotation=180/.test(String(vertex.style || ''));",
    "                            const vertical = /transformer-v/.test(String(vertex.style || ''));",
    '',
    '                            // Decimals rather than 4/90, 86/90 and 30/58: terser keeps the',
    '                            // shorter fraction, and HEAD was minified with these folded.',
    '                            let exitX;',
    '                            let exitY;',
    '                            if (vertical) {',
    '                                exitX = 0.5;',
    '                                exitY = isHvWinding ? 0.044444444444444446 : 0.9555555555555556;',
    '                            } else {',
    '                                exitX = isHvWinding ? 0.044444444444444446 : 0.9555555555555556;',
    '                                exitY = 0.5172413793103449;',
    '                            }',
    '',
    '                            let px = tg.x + tg.width * exitX;',
    '                            let py = tg.y + tg.height * exitY;',
    '                            if (rotated) {',
    '                                px = 2 * cx - px;',
    '                                py = 2 * cy - py;',
    '                            }',
    '',
    '                            const vx = px - cx;',
    '                            const vy = py - cy;',
    '                            const len = Math.hypot(vx, vy) || 1;',
    '                            const sx = px + (vx / len) * 22;',
    '                            const sy = py + (vy / len) * 22;',
    '                            const yRun = cy < by ? Math.min(sy, by - 36) : Math.max(sy, by + 36);',
    '                            const tapX = Math.max(bg.x + 16, Math.min(bg.x + (bg.width || 260) - 16, sx));',
    '                            const entryX = Math.max(0.08, Math.min(0.92, (tapX - bg.x) / (bg.width || 1)));',
    '                            // A short radial drop is already straight.',
    '                            const points = window._elxxxRadialImport && Math.abs(cy - by) < 48',
    '                                ? []',
    '                                : [new mxPoint(sx, yRun), new mxPoint(tapX, yRun)];',
    '',
    "                            const edge = grafka.insertEdge(parent, null, '', vertex, busV,",
    "                                'edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=0;html=1;endArrow=none;'",
    '                                + `exitX=${exitX};exitY=${exitY};exitDx=0;exitDy=0;exitPerimeter=0;`',
    '                                + `entryX=${entryX};entryY=0.5;entryDx=0;entryDy=0;entryPerimeter=0;shapeELXXX=NotEditableLine`);',
    "                            if (!edge || !edge.geometry || typeof mxPoint === 'undefined') return;",
    '                            const geo = edge.geometry.clone();',
    '                            geo.points = points;',
    '                            grafka.getModel().setGeometry(edge, geo);',
    '                        });',
].join(NL);

sub(TR_OLD, TR_NEW, 'transformer winding edges');

// --- 2. external grid keeps the helper, without the layout flag ----------
const DEVICE_CALL = [
    '                const edgeStyle = importDeviceToBusEdgeStyle(',
    '                    vertex,',
    '                    busVertex,',
    '                    allocateBusPin,',
    '                    importPandapowerVerticalSld,',
    '                );',
].join(NL);

sub(DEVICE_CALL,
    '                const edgeStyle = importDeviceToBusEdgeStyle(vertex, busVertex, allocateBusPin);',
    'external grid edge style');

// --- 3 & 4. generator and static generator drops -------------------------
const MACHINE_OLD = [
    DEVICE_CALL,
    '',
    '                if (busVertex) {',
    '                    grafka.insertEdge(parent, null, "", vertex, busVertex, edgeStyle);',
    '                }',
].join(NL);

const machineDrop = (exitY, extra) => [
    '                if (busVertex) {',
    '                    const mg = vertex.geometry;',
    '                    const bg = busVertex.geometry;',
    '                    const mcx = mg.x + mg.width / 2;',
    '                    const entryX = Math.max(0.05, Math.min(0.95, (mcx - bg.x) / (bg.width || 1)));',
    '                    const dropEdge = grafka.insertEdge(parent, null, "", vertex, busVertex,',
    "                        'edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=0;html=1;endArrow=none;'",
    '                        + `exitX=0.5;exitY=' + exitY + ';exitDx=0;exitDy=0;exitPerimeter=0;`',
    '                        + `entryX=${entryX};entryY=0.5;entryDx=0;entryDy=0;entryPerimeter=0;`',
    "                        + 'jettySize=0;orthogonalLoop=0;shapeELXXX=NotEditableLine');",
    '                    if (dropEdge && dropEdge.geometry) {',
    '                        // Straight down onto the bar — drop any routed waypoints.',
    '                        const geo = dropEdge.geometry.clone();',
    '                        geo.points = null;',
    '                        grafka.getModel().setGeometry(dropEdge, geo);',
    '                    }',
].concat(extra, ['                }']).join(NL);

// The generator also nudges its radial label sideways so the drop stays legible.
sub(MACHINE_OLD, machineDrop('1', [
    "                    if (typeof mxPoint !== 'undefined') {",
    '                        const kids = grafka.getChildCells(vertex, true, false);',
    '                        const label = kids && kids.length ? kids[kids.length - 1] : null;',
    '                        if (label && label.geometry) {',
    '                            const geo = label.geometry.clone();',
    '                            geo.offset = new mxPoint(42, 0);',
    '                            grafka.getModel().setGeometry(label, geo);',
    '                        }',
    '                    }',
]), 'generator drop edge');

sub(MACHINE_OLD, machineDrop('${sgLeaf ? 0 : 1}', []), 'static generator drop edge');

fs.writeFileSync(P, s);
console.log('stage 16 applied: winding + machine drop edges');
