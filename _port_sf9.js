// Port supportingFunctions.js, stage 9: line insertion.
//
//  - importBusToBusLineEdgeStyle short-circuits to a straight jump-style edge on
//    a large import: orthogonal routing with pin allocation does not scale to
//    thousands of lines.
//  - The line-vertex (bus-switch-line) path drops the importPandapowerVerticalSld
//    flag in favour of the buses' own geometry, and on a radial import parks the
//    vertex above the lower bus instead of at the midpoint.
//  - Radial imports re-style both stubs to a clean vertical drop and delete the
//    stub that a bus-switch already covers.
//  - Large imports route plain bus-to-bus lines through a shared horizontal lane,
//    tapping each busbar at a spread-out x so parallel lines do not overlap.
const fs = require('fs');
const P = 'src/main/webapp/js/electrisim/supportingFunctions.js';
let s = fs.readFileSync(P, 'utf8');
const NL = '\n';
const must = (c, m) => { if (!c) { console.error('ANCHOR FAILED: ' + m); process.exit(1); } };
const sub = (from, to, label) => { must(s.includes(from), label); s = s.replace(from, to); };

// --- 1. large-import short circuit --------------------------------------
sub('function importBusToBusLineEdgeStyle(fromBusVertex, toBusVertex, allocateBusPin) {' + NL +
    '    const fromC = importBusbarCenterXY(fromBusVertex);' + NL +
    '    const toC = importBusbarCenterXY(toBusVertex);',
    'function importBusToBusLineEdgeStyle(fromBusVertex, toBusVertex, allocateBusPin) {' + NL +
    '    const fromC = importBusbarCenterXY(fromBusVertex);' + NL +
    '    const toC = importBusbarCenterXY(toBusVertex);' + NL +
    '    // Orthogonal routing with pin allocation does not scale to thousands of' + NL +
    '    // lines; fall back to a straight edge with jumps.' + NL +
    '    if (window._elxxxLargeImport) {' + NL +
    "        return 'edgeStyle=none;rounded=0;orthogonalLoop=0;jettySize=0;jumpStyle=arc;jumpSize=12;html=1;endArrow=none;noEdgeStyle=1;exitX=0.5;exitY=0.5;entryX=0.5;entryY=0.5;exitPerimeter=0;entryPerimeter=0;shapeELXXX=Line';" + NL +
    '    }',
    'importBusToBusLineEdgeStyle large-import branch');

// --- 2. line-vertex orientation and radial placement --------------------
sub('                        const useVertical =' + NL +
    '                            importPandapowerVerticalSld ||' + NL +
    '                            Math.abs(fc.y - tc.y) > Math.abs(fc.x - tc.x);',
    '                        const useVertical = Math.abs(fc.y - tc.y) > Math.abs(fc.x - tc.x);',
    'line vertex orientation');

sub('                        const mx = (fc.x + tc.x) / 2 - lvW / 2;' + NL +
    '                        const my = (fc.y + tc.y) / 2 - lvH / 2;',
    '                        // Radial: hang the line symbol just above the lower bus rather' + NL +
    '                        // than halfway up the drop, where it collides with the feeder.' + NL +
    '                        const radialDrop = window._elxxxRadialImport && Math.abs(fc.y - tc.y) > 36;' + NL +
    '                        const lowerBusC = fc.y <= tc.y ? tc : fc;' + NL +
    '                        const mx = radialDrop ? lowerBusC.x - lvW / 2 : (fc.x + tc.x) / 2 - lvW / 2;' + NL +
    '                        const my = radialDrop ? lowerBusC.y - 78 - lvH / 2 : (fc.y + tc.y) / 2 - lvH / 2;',
    'line vertex placement');

// --- 3. stubs: no jetty on a radial import ------------------------------
const JETTY = "                            `edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;` +";
must(s.split(JETTY).length - 1 === 2, 'two stub style literals');
s = s.split(JETTY).join(
    "                            `edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=${window._elxxxRadialImport ? 0 : 'auto'};html=1;` +");

// --- 4. radial: straighten the stubs, and drop the one a switch covers ---
sub("                        grafka.insertEdge(parent, null, '', fromBusVertex, lineVertex, stubExit);" + NL +
    "                        grafka.insertEdge(parent, null, '', lineVertex, toBusVertex, stubEntry);",
    "                        const stubEdgeFrom = grafka.insertEdge(parent, null, '', fromBusVertex, lineVertex, stubExit);" + NL +
    "                        const stubEdgeTo = grafka.insertEdge(parent, null, '', lineVertex, toBusVertex, stubEntry);" + NL +
    '' + NL +
    '                        if (window._elxxxRadialImport) {' + NL +
    '                            [stubEdgeFrom, stubEdgeTo].forEach((ed) => {' + NL +
    '                                if (!ed || !ed.geometry) return;' + NL +
    '                                const aC = importBusbarCenterXY(ed.source);' + NL +
    '                                const bC = importBusbarCenterXY(ed.target);' + NL +
    '                                const upper = aC.y <= bC.y ? ed.source : ed.target;' + NL +
    '                                const lower = aC.y <= bC.y ? ed.target : ed.source;' + NL +
    '                                const pin = importBusbarPinXFromPeerX(upper, importBusbarCenterXY(lower).x);' + NL +
    '                                const exitX = aC.y <= bC.y ? pin : 0.5;' + NL +
    '                                const entryX = aC.y <= bC.y ? 0.5 : pin;' + NL +
    '                                grafka.getModel().setStyle(ed, `edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=0;html=1;endArrow=none;exitX=${exitX};exitY=0.5;exitPerimeter=0;entryX=${entryX};entryY=0.5;entryPerimeter=0;shapeELXXX=NotEditableLine`);' + NL +
    '                                const geo = ed.geometry.clone();' + NL +
    '                                geo.points = null;' + NL +
    '                                grafka.getModel().setGeometry(ed, geo);' + NL +
    '                            });' + NL +
    '' + NL +
    '                            // A bus-switch already provides the connection on its side,' + NL +
    '                            // so the matching stub would double it up.' + NL +
    '                            (switchData.data || []).forEach((row) => {' + NL +
    "                                if (!Array.isArray(row) || String(row[3] || 'l') !== 'l') return;" + NL +
    '                                const el = String(row[2]);' + NL +
    "                                if (el !== String(name) && el !== String(index) && el !== 'Line_' + index) return;" + NL +
    '                                const bus = String(row[1]);' + NL +
    '                                if ((bus === String(fromBusName) || bus === String(from_bus)) && stubEdgeFrom) {' + NL +
    '                                    grafka.getModel().remove(stubEdgeFrom);' + NL +
    '                                }' + NL +
    '                                if ((bus === String(toBusName) || bus === String(to_bus)) && stubEdgeTo) {' + NL +
    '                                    grafka.getModel().remove(stubEdgeTo);' + NL +
    '                                }' + NL +
    '                            });' + NL +
    '                        }',
    'radial stub handling');

// --- 5. plain edge: radial straightening and large-import lane routing ---
sub('                        configureLineAttributes(grafka, edge, lineAttr);' + NL +
    '                    }',
    '                        if (window._elxxxRadialImport && edge && typeof mxPoint !== \'undefined\') {' + NL +
    '                            const aC = importBusbarCenterXY(fromBusVertex);' + NL +
    '                            const bC = importBusbarCenterXY(toBusVertex);' + NL +
    '                            if (Math.abs(aC.y - bC.y) > 36) {' + NL +
    '                                const geo = edge.geometry.clone();' + NL +
    '                                geo.points = null;' + NL +
    '                                grafka.getModel().setGeometry(edge, geo);' + NL +
    '                                const upper = aC.y <= bC.y ? fromBusVertex : toBusVertex;' + NL +
    '                                const lower = aC.y <= bC.y ? toBusVertex : fromBusVertex;' + NL +
    '                                const ux = importBusbarPinXFromPeerX(upper, importBusbarCenterXY(lower).x);' + NL +
    '                                grafka.getModel().setStyle(edge, `edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=0;html=1;endArrow=none;exitX=${aC.y <= bC.y ? ux : 0.5};exitY=0.5;exitPerimeter=0;entryX=${aC.y <= bC.y ? 0.5 : ux};entryY=0.5;entryPerimeter=0;shapeELXXX=Line`);' + NL +
    '                            }' + NL +
    '                        }' + NL +
    '' + NL +
    '                        // Large import: send every line through one of eight shared' + NL +
    '                        // horizontal lanes, tapping each busbar at a spread-out x.' + NL +
    "                        if (window._elxxxLargeImport && edge && fromBusVertex.geometry && toBusVertex.geometry && typeof mxPoint !== 'undefined') {" + NL +
    '                            const fromGeo = fromBusVertex.geometry;' + NL +
    '                            const toGeo = toBusVertex.geometry;' + NL +
    '                            const lane = (window._elxxxOrthoLane = (window._elxxxOrthoLane | 0) + 1) % 8;' + NL +
    '                            const dy = toGeo.y - fromGeo.y;' + NL +
    '                            const sameRow = Math.abs(dy) < 90;' + NL +
    '                            const slot = Math.floor(lane / 2);' + NL +
    '                            let laneY;' + NL +
    '                            let srcDown;' + NL +
    '                            let dstDown;' + NL +
    '                            if (sameRow) {' + NL +
    '                                laneY = Math.max(fromGeo.y, toGeo.y) + fromGeo.height + 220 + 18 * slot;' + NL +
    '                                srcDown = true;' + NL +
    '                                dstDown = true;' + NL +
    '                            } else if (dy > 0) {' + NL +
    '                                laneY = fromGeo.y + fromGeo.height + 220 + 18 * slot;' + NL +
    '                                srcDown = true;' + NL +
    '                                dstDown = false;' + NL +
    '                            } else {' + NL +
    '                                laneY = fromGeo.y - 250 - 18 * slot;' + NL +
    '                                srcDown = false;' + NL +
    '                                dstDown = true;' + NL +
    '                            }' + NL +
    '                            const tap = (cell, geo, down) => {' + NL +
    "                                const key = String(cell.id || '');" + NL +
    '                                const map = window._elxxxLineTap || (window._elxxxLineTap = new Map());' + NL +
    '                                const n = (map.get(key) || 0) + 1;' + NL +
    '                                map.set(key, n);' + NL +
    '                                const span = Math.max(40, geo.width - 48);' + NL +
    '                                const steps = Math.max(1, Math.floor(span / 22));' + NL +
    '                                const x = geo.x + 24 + ((n - 1) % steps) * (span / steps);' + NL +
    '                                return {' + NL +
    '                                    x,' + NL +
    '                                    y: geo.y + geo.height / 2 + (down ? 28 : -28),' + NL +
    '                                    fx: Math.max(0.08, Math.min(0.92, (x - geo.x) / (geo.width || 1))),' + NL +
    '                                };' + NL +
    '                            };' + NL +
    '                            const ps = tap(fromBusVertex, fromGeo, srcDown);' + NL +
    '                            const pg = tap(toBusVertex, toGeo, dstDown);' + NL +
    '                            const geo = edge.geometry.clone();' + NL +
    '                            geo.points = [' + NL +
    '                                new mxPoint(ps.x, ps.y),' + NL +
    '                                new mxPoint(ps.x, laneY),' + NL +
    '                                new mxPoint(pg.x, laneY),' + NL +
    '                                new mxPoint(pg.x, pg.y),' + NL +
    '                            ];' + NL +
    '                            grafka.getModel().setGeometry(edge, geo);' + NL +
    '                            grafka.getModel().setStyle(edge, `edgeStyle=none;rounded=0;orthogonalLoop=0;jettySize=0;jumpStyle=arc;jumpSize=12;html=1;endArrow=none;noEdgeStyle=1;exitX=${ps.fx};exitY=0.5;exitDx=0;exitDy=0;exitPerimeter=0;entryX=${pg.fx};entryY=0.5;entryDx=0;entryDy=0;entryPerimeter=0;shapeELXXX=Line`);' + NL +
    '                        }' + NL +
    '' + NL +
    '                        configureLineAttributes(grafka, edge, lineAttr);' + NL +
    '                    }',
    'plain edge radial + lane routing');

fs.writeFileSync(P, s);
console.log('stage 9 applied:', s.split(NL).length, 'lines');
