import {
    vertexStyleFromElectrisimSymbol,
    vertexSizeFromElectrisimSymbol,
    vertexStyleImportedBusbar,
} from './electricalSymbols.js';
import { applyElectrisimImportSidecar as elApplySidecar } from './applyElectrisimImportSidecar.js';
import { layoutRadialSld as elLayoutRadial, suggestImportSystem as elSuggestSystem } from './importRadialLayout.js';
import { relayoutSld as elRelayoutSld } from './sldAutoLayout.js';
import { drawElectrisimLayer as elDrawElectrisimLayer } from './importElectrisimLayer.js';
import './resultBoxVisibility.js';
import './diodeTextUpright.js';
import './drawingFrequency.js';

/**
 * Are the geo coordinates worth using as a layout?
 *
 * Small networks always are. Very large ones never are. In between, a canvas
 * whose aspect ratio is extreme (a sliver) produces an unusable diagram, so
 * fall through to the feeder/voltage-group layouts instead.
 */
function importGeoCanvasOk(busData) {
    const n = busData.data.length;
    if (n <= 40) return true;
    if (n > 12000) return false;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < n; i++) {
        const row = busData.data[i];
        const x = Number(row[4]);
        const y = Number(row[5]);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
    }
    const dx = maxX - minX;
    const dy = maxY - minY;
    if (!(dx > 1e-6) || !(dy > 1e-6)) return false;
    const aspect = dx / dy;
    return aspect >= 0.25 && aspect <= 4;
}

/** Horizontal busbar geometry aligned with map-generated diagrams (sym-bus.svg). */
const IMPORT_BUSBAR_W = 260;
/** Match map import / thin palette bus line (see ``vertexStyleImportedBusbar``). */
const IMPORT_BUSBAR_H = 12;

/** sym-transformer.svg viewBox -45..45, -30..28 → winding axis at y = 0 → (30/58) from top */
const TRANSFORMER_EDGE_PIN_Y = 30 / 58;
/** Horizontal stubs end at x=±41 → inset fractions matching Graph constraints */
const TRANSFORMER_EDGE_PIN_X_HV = 4 / 90;
const TRANSFORMER_EDGE_PIN_X_LV = 86 / 90;

/**
 * Inline AC line segment when pandapower switches reference the line (``et='l'``).
 *
 * The vertex exists purely as an attachment point for the switch's peer edge — it should be
 * visually a *continuation* of the line, not a white rectangle. We render it with ``shape=line``
 * (same as the bus / palette line) and orient it along the feeder direction.
 */
const IMPORT_LINE_VERTEX_LENGTH = 24;
const IMPORT_LINE_VERTEX_THICKNESS = 8;
const IMPORT_LINE_VERTEX_STYLE_HORIZONTAL =
    'pointerEvents=1;verticalLabelPosition=bottom;shadow=0;dashed=0;align=center;html=1;verticalAlign=top;' +
    'shape=line;strokeColor=#000000;strokeWidth=1;perimeter=none;rounded=0;shapeELXXX=Line';
const IMPORT_LINE_VERTEX_STYLE_VERTICAL =
    'pointerEvents=1;verticalLabelPosition=bottom;shadow=0;dashed=0;align=center;html=1;verticalAlign=top;' +
    'shape=line;direction=north;strokeColor=#000000;strokeWidth=1;perimeter=none;rounded=0;shapeELXXX=Line';

const IMPORT_STUB_EDGE_STYLE =
    'edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;' +
    'exitX=0.5;exitY=0.5;exitDx=0;exitDy=0;exitPerimeter=0;entryX=0.5;entryY=0.5;entryDx=0;entryDy=0;entryPerimeter=0;;' +
    'shapeELXXX=NotEditableLine';

/** Pixels per pandapower ``geo`` unit (see bus import ``geo_x`` / ``geo_y``). */
const IMPORT_GEO_SCALE = 88;
/** Vertical step between BFS layers when geo is missing. */
const IMPORT_VERTICAL_FEEDER_STEP = 152;
/** Wider than a busbar, so buses on one layer do not run into each other. */
const IMPORT_SIBLING_BUS_GAP = IMPORT_BUSBAR_W + 60;
const IMPORT_MAX_BUSES_VERTICAL_FEEDER = 80;

/** Rotate switch / transformer symbols for geo- or BFS-based **vertical** SLD import (pins align top/bottom). */
const IMPORT_SLD_VERTICAL_ROTATION = 90;

/** Straight edges for vertical SLD — orthogonal routing draws “bracket” paths when pins are almost collinear. */
const IMPORT_VERTICAL_SLD_EDGE_BASE =
    'edgeStyle=none;rounded=0;html=1;jettySize=0;orthogonalLoop=0;jumpStyle=none;';

/** If bus centre and peer centre differ by less than this (px), treat as one vertical feeder and snap switch X to peer. */
const IMPORT_VERTICAL_COLLINEAR_X_EPS = 24;

/** Vertical SLD: distance from busbar electrical centre to first switch centre (px). */
const IMPORT_VERTICAL_SWITCH_GAP_FROM_BUS = 18;
/** Vertical SLD: extra spacing between stacked switch *cells* on the same bus side (px). */
const IMPORT_VERTICAL_SWITCH_STACK_PADDING = 6;

/**
 * Horizontal import: legacy midpoint on switch symbol (Graph uses precise pins).
 * @see Graph.js Switch constraints — pins at y = 22/40 on left/right.
 */
const SWITCH_EDGE_PIN_Y = 0.5;
// Use existing globalPandaPowerData if it exists, otherwise create it
if (typeof globalPandaPowerData === 'undefined') {
    window.globalPandaPowerData = null;
}

// Helper function to safely parse JSON or return empty array if data doesn't exist
if (typeof safeJsonParse === 'undefined') {
    window.safeJsonParse = (jsonData) => {
        try {
            return jsonData ? JSON.parse(jsonData) : [];
        } catch (error) {
            console.warn("Error parsing JSON:", error);
            return [];
        }
    };
}

/*
function fetchPandaPowerData() {
    return fetch('js/electrisim/models/example_simple.json')
        .then(response => {
            console.log('Response:', response);
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            // Explicitly assign to global variable
            globalPandaPowerData = data;
            console.log('Data fetched and stored:', globalPandaPowerData);
            return data;
        })
        .catch(error => {
            console.error('Error fetching data:', error);
        });
}*/
function fetchPandaPowerData() {
    // Add cache-busting parameter using current timestamp
    const cacheBuster = `?_=${new Date().getTime()}`;

    return fetch(`js/electrisim/models/example_simple.json${cacheBuster}`, {
        // Add cache control headers
        headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        }
    })
        .then(response => {
            console.log('Response:', response);
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            // Explicitly assign to global variable
            globalPandaPowerData = data;
            console.log('Data fetched and stored:', globalPandaPowerData);
            return data;
        })
        .catch(error => {
            console.error('Error fetching data:', error);
        });
}

// Make the function globally available
window.fetchPandaPowerData = fetchPandaPowerData;

// Function to use the data
function usePandaPowerData() {
    // Add a check to ensure data is loaded
    if (globalPandaPowerData) {
        console.log('Using global data:', globalPandaPowerData);
        // Your data processing logic here
    } else {
        console.log('Data not yet loaded');
    }
}

// If you need to ensure data is loaded before using
// FIXED: Added timeout to prevent infinite polling loop that causes freezing
function waitForData(timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        const maxAttempts = Math.ceil(timeoutMs / 100);
        let attempts = 0;
        
        function checkData() {
            attempts++;
            const elapsed = Date.now() - startTime;
            
            if (globalPandaPowerData) {
                console.log(`✅ Data loaded after ${attempts} attempts (${elapsed}ms)`);
                resolve(globalPandaPowerData);
            } else if (elapsed >= timeoutMs || attempts >= maxAttempts) {
                const error = new Error(`Timeout waiting for data after ${elapsed}ms (${attempts} attempts)`);
                console.error('❌ waitForData timeout:', error);
                reject(error);
            } else {
                // Check again after a short delay
                setTimeout(checkData, 100);
            }
        }
        checkData();
    });
}

// Also make other functions globally available if needed
window.useDataToInsertOnGraph = useDataToInsertOnGraph;
window.waitForData = waitForData;
window.findVertexByBusId = findVertexByBusId;

// Helper function to find a bus vertex by its ID

// Import-layout helpers for pandapower/OpenDSS model import.
//
// Reproduced from the committed HEAD bytes: these were written straight into
// the minified file (commits c967051b / 25edf9cb / c4999894), keeping full
// identifier names, so this IS the source rather than a reconstruction.
// Only `!0`/`!1` have been spelled out.
//
// elRadial*        - tidy a radial single-line diagram after import
// elTransmission*  - repair couplers and switch links on a transmission grid


function elRadialLabel(graph, cell, ppName) {
    if (!window._elxxxRadialImport || !cell || !cell.value || !cell.value.setAttribute) return;
    const fn = window._elxxxUfn && window._elxxxUfn[ppName];
    if (!fn) return;
    if (!cell.value.getAttribute("pp_element_name")) cell.value.setAttribute("pp_element_name", String(ppName));
    cell.value.setAttribute("name", String(fn));
    cell.value.setAttribute("userFriendlyName", String(fn));
    const kids = graph.getChildCells(cell, !0, false) || [];
    for (let i = 0; i < kids.length; i++) {
        const k = kids[i];
        if (k && k.vertex && typeof k.value === "string" && k.value) graph.getModel().setValue(k, String(fn));
    }
}

function elRadialStraighten(graph, parent) {
    if (!window._elxxxRadialImport || !graph || !parent) return;
    const edges = graph.getChildCells(parent, !1, true) || [];
    edges.forEach(ed => {
        if (!ed || !ed.geometry) return;
        const st = String(ed.style || "");
        if (!/shapeELXXX=Line|shapeELXXX=NotEditableLine/.test(st)) return;
        if (/edgeStyle=orthogonalEdgeStyle/.test(st)) return;
        const next = st.replace(/edgeStyle=[^;]*/, "edgeStyle=orthogonalEdgeStyle");
        graph.getModel().setStyle(ed, /edgeStyle=/.test(st) ? next : "edgeStyle=orthogonalEdgeStyle;" + st);
        if (ed.geometry.points && ed.geometry.points.length) {
            const geo = ed.geometry.clone();
            geo.points = null;
            graph.getModel().setGeometry(ed, geo);
        }
    });
}

function elRadialFixSwitchLinks(graph, parent) {
    if (!window._elxxxRadialImport || !graph || !parent) return;
    const model = graph.getModel();
    const isSw = c => !!(c && !c.edge && /shapeELXXX=Switch/.test(String(c.style || "")));
    const isBus = c => !!(c && !c.edge && /shapeELXXX=Bus/.test(String(c.style || "")));
    const isLineV = c => !!(c && !c.edge && /shapeELXXX=Line$|shapeELXXX=Line;/.test(String(c.style || "")));
    const ctr = c => c && c.geometry ? {
        x: c.geometry.x + (c.geometry.width || 0) / 2,
        y: c.geometry.y + (c.geometry.height || 0) / 2
    } : {
        x: 0,
        y: 0
    };
    const snapPin = (cell, px) => {
        if (!cell || !cell.geometry || !(cell.geometry.width > 0)) return .5;
        const t = (px - cell.geometry.x) / cell.geometry.width;
        return Math.round(Math.max(.05, Math.min(.95, t)) * 20) / 20;
    };
    const snapX = (cell, px) => cell.geometry.x + snapPin(cell, px) * cell.geometry.width;
    const axisFor = (up, dn) => {
        const want = ctr(dn).x;
        let best = snapX(up, want), score = 1e9;
        const w = up.geometry.width || 1;
        for (let i = 1; i <= 19; i++) {
            const x = up.geometry.x + i / 20 * w;
            const far = snapX(dn, x);
            const s = Math.abs(x - far) * 6 + Math.abs(x - want);
            if (s < score) {
                score = s;
                best = x;
            }
        }
        return best;
    };
    const pin = (cell, px) => snapPin(cell, px);
    const put = (cell, cx, cy, w, h) => {
        if (!cell || !cell.geometry) return;
        const g = cell.geometry.clone();
        g.width = w;
        g.height = h;
        g.x = cx - w / 2;
        g.y = cy - h / 2;
        g.points = null;
        model.setGeometry(cell, g);
    };
    const wire = (ed, ex, ey, nx, ny, pts) => {
        if (!ed || !ed.geometry) return;
        // Rerouting must not change what the edge is: a bus-to-bus edge can be a
        // real line, and as a NotEditableLine the load flow skips it.
        const shape = /shapeELXXX=Line(;|$)/.test(String(ed.style || "")) ? "Line" : "NotEditableLine";
        model.setStyle(ed, `edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=0;html=1;endArrow=none;exitX=${ex};exitY=${ey};exitDx=0;exitDy=0;exitPerimeter=0;entryX=${nx};entryY=${ny};entryDx=0;entryDy=0;entryPerimeter=0;shapeELXXX=${shape}`);
        const g = ed.geometry.clone();
        g.points = pts && pts.length ? pts : null;
        model.setGeometry(ed, g);
    };
    const via = (x, y) => typeof mxPoint != "undefined" ? [ new mxPoint(x, y) ] : null;
    const SW_W = 74, SW_H = 38, SW_FY = 22 / 40, swLead = (SW_FY - .5) * SW_H;
    const endPin = (cell, axis, side) => {
        if (isBus(cell)) return axis === "v" ? [ pin(cell, side), .5 ] : [ side, .5 ];
        if (isLineV(cell)) return [ .5, .5 ];
        if (isSw(cell)) return axis === "v" ? side === "top" ? [ 0, SW_FY ] : [ 1, SW_FY ] : side === "left" ? [ 0, SW_FY ] : [ 1, SW_FY ];
        return [ .5, .5 ];
    };
    const link = (ed, axis, ax) => {
        if (!ed || !ed.source || !ed.target) return;
        const A = ctr(ed.source), B = ctr(ed.target);
        if (axis === "v") {
            const srcUp = A.y <= B.y;
            const s = endPin(ed.source, "v", isBus(ed.source) ? ax : srcUp ? "bottom" : "top");
            const t = endPin(ed.target, "v", isBus(ed.target) ? ax : srcUp ? "top" : "bottom");
            wire(ed, s[0], s[1], t[0], t[1], via(ax, (A.y + B.y) / 2));
        } else {
            const srcLeft = A.x <= B.x;
            const s = endPin(ed.source, "h", isBus(ed.source) ? srcLeft ? 1 : 0 : srcLeft ? "right" : "left");
            const t = endPin(ed.target, "h", isBus(ed.target) ? srcLeft ? 0 : 1 : srcLeft ? "left" : "right");
            wire(ed, s[0], s[1], t[0], t[1], via((A.x + B.x) / 2, ax));
        }
    };
    (graph.getChildCells(parent, !0, false) || []).filter(isSw).forEach(sw => {
        const near = (graph.getEdges(sw) || []).map(e => e.source === sw ? e.target : e.source).filter(Boolean);
        const bus = near.find(isBus), sym = near.find(isLineV);
        if (!bus || !sym || !bus.geometry || !sym.geometry) return;
        const far = (graph.getEdges(sym) || []).map(e => e.source === sym ? e.target : e.source).find(c => isBus(c) && c !== bus);
        if (!far || !far.geometry) return;
        (graph.getEdges(sym) || []).forEach(e => {
            if (e.source === bus && e.target === sym || e.source === sym && e.target === bus) model.remove(e);
        });
        const bC = ctr(bus), fC = ctr(far);
        if (Math.abs(fC.y - bC.y) > Math.abs(fC.x - bC.x) + 8) {
            const span = Math.abs(fC.y - bC.y), dir = fC.y >= bC.y ? 1 : -1;
            const upCell = bC.y <= fC.y ? bus : far, dnCell = upCell === bus ? far : bus;
            const ax = axisFor(upCell, dnCell);
            let swOff = Math.max(110, Math.min(150, span * .42)), symOff = swOff + 52;
            if (symOff > span - 26) {
                symOff = Math.max(64, span * .64);
                swOff = Math.max(46, symOff - 52);
            }
            model.setStyle(sw, /rotation=90/.test(String(sw.style || "")) ? String(sw.style) : String(sw.style || "") + ";rotation=90");
            put(sw, ax + swLead, bC.y + dir * swOff, SW_W, SW_H);
            put(sym, ax, bC.y + dir * symOff, 8, 24);
            model.setStyle(sym, /direction=north/.test(String(sym.style || "")) ? String(sym.style) : String(sym.style || "") + ";direction=north");
            (graph.getEdges(sw) || []).concat(graph.getEdges(sym) || []).forEach(e => link(e, "v", ax));
        } else {
            const dir = fC.x >= bC.x ? 1 : -1, ay = (bC.y + fC.y) / 2;
            const busEnd = dir > 0 ? bus.geometry.x + bus.geometry.width : bus.geometry.x;
            const farEnd = dir > 0 ? far.geometry.x : far.geometry.x + far.geometry.width;
            const gap = Math.abs(farEnd - busEnd) || 1;
            let symX = farEnd - dir * Math.max(22, Math.min(60, gap * .22)), swX = symX - dir * 52;
            if (Math.abs(swX - busEnd) < 44) {
                swX = busEnd + dir * Math.max(24, gap * .36);
                symX = swX + dir * 52;
            }
            model.setStyle(sw, String(sw.style || "").replace(/;?rotation=90/g, ""));
            put(sw, swX, ay - swLead, SW_W, SW_H);
            put(sym, symX, ay, 24, 8);
            model.setStyle(sym, String(sym.style || "").replace(/;?direction=north/g, ""));
            (graph.getEdges(sw) || []).concat(graph.getEdges(sym) || []).forEach(e => link(e, "h", ay));
        }
    });
    (graph.getChildCells(parent, !1, true) || []).forEach(ed => {
        if (!ed || !isBus(ed.source) || !isBus(ed.target)) return;
        const A = ctr(ed.source), B = ctr(ed.target);
        if (Math.abs(A.y - B.y) > Math.abs(A.x - B.x) + 8) {
            const low = A.y >= B.y ? ed.source : ed.target, up = A.y >= B.y ? ed.target : ed.source;
            const ax = axisFor(up, low);
            link(ed, "v", ax);
        } else if (Math.abs(A.x - B.x) > 24) link(ed, "h", (A.y + B.y) / 2);
    });
}

function elTransmissionFixCouplers(graph, parent) {
    if (window._elxxxRadialImport || !graph || !parent) return;
    const model = graph.getModel();
    const isSw = c => !!(c && !c.edge && /shapeELXXX=Switch/.test(String(c.style || "")));
    const isBus = c => !!(c && !c.edge && /shapeELXXX=Bus/.test(String(c.style || "")));
    const ctr = c => c && c.geometry ? {
        x: c.geometry.x + (c.geometry.width || 0) / 2,
        y: c.geometry.y + (c.geometry.height || 0) / 2
    } : {
        x: 0,
        y: 0
    };
    const SW_W = 74, SW_H = 38, SW_FY = 22 / 40, swLead = (SW_FY - .5) * SW_H;
    const pin = (cell, px) => {
        if (!cell || !cell.geometry || !(cell.geometry.width > 0)) return .5;
        const t = (px - cell.geometry.x) / cell.geometry.width;
        return Math.round(Math.max(.08, Math.min(.92, t)) * 20) / 20;
    };
    const axisFor = (up, dn) => {
        const want = ctr(dn).x;
        let best = want, score = 1e9;
        const w = up.geometry.width || 1;
        for (let i = 1; i <= 19; i++) {
            const x = up.geometry.x + i / 20 * w;
            const far = dn.geometry.x + pin(dn, x) * dn.geometry.width;
            const s = Math.abs(x - far) * 6 + Math.abs(x - want);
            if (s < score) {
                score = s;
                best = x;
            }
        }
        return best;
    };
    (graph.getChildCells(parent, !0, false) || []).filter(isSw).forEach(sw => {
        const edges = (graph.getEdges(sw) || []).filter(e => e && e.source && e.target);
        const buses = edges.map(e => e.source === sw ? e.target : e.source).filter(isBus);
        if (buses.length < 2 || !buses[0].geometry || !buses[1].geometry) return;
        const A = ctr(buses[0]), B = ctr(buses[1]);
        if (Math.abs(B.y - A.y) < 30 || Math.abs(B.y - A.y) > 220 || Math.abs(B.x - A.x) > 200) return;
        const up = A.y <= B.y ? buses[0] : buses[1], dn = up === buses[0] ? buses[1] : buses[0];
        const ax = axisFor(up, dn), mid = (ctr(up).y + ctr(dn).y) / 2;
        const g = sw.geometry.clone();
        g.width = SW_W;
        g.height = SW_H;
        g.x = ax + swLead - SW_W / 2;
        g.y = mid - SW_H / 2;
        g.points = null;
        model.setGeometry(sw, g);
        const st = String(sw.style || "");
        model.setStyle(sw, /rotation=90/.test(st) ? st : st + ";rotation=90");
        edges.forEach(ed => {
            const fromSw = ed.source === sw;
            const bus = fromSw ? ed.target : ed.source;
            if (!isBus(bus)) return;
            const busIsUp = ctr(bus).y <= mid;
            const swX = busIsUp ? 0 : 1, swY = SW_FY, busX = pin(bus, ax);
            const exitX = fromSw ? swX : busX, exitY = fromSw ? swY : .5, entryX = fromSw ? busX : swX, entryY = fromSw ? .5 : swY;
            model.setStyle(ed, `edgeStyle=none;rounded=0;orthogonalLoop=0;jettySize=0;html=1;endArrow=none;exitX=${exitX};exitY=${exitY};exitDx=0;exitDy=0;exitPerimeter=0;entryX=${entryX};entryY=${entryY};entryDx=0;entryDy=0;entryPerimeter=0;shapeELXXX=NotEditableLine`);
            if (ed.geometry) {
                const eg = ed.geometry.clone();
                eg.points = null;
                model.setGeometry(ed, eg);
            }
        });
    });
}

function elTransmissionFixLineSwitches(graph, parent) {
    if (window._elxxxRadialImport || !graph || !parent) return;
    const model = graph.getModel();
    const isSw = c => !!(c && !c.edge && /shapeELXXX=Switch/.test(String(c.style || "")));
    const isBus = c => !!(c && !c.edge && /shapeELXXX=Bus/.test(String(c.style || "")));
    const isLineV = c => !!(c && !c.edge && /shapeELXXX=Line(;|$)/.test(String(c.style || "")));
    const ctr = c => c && c.geometry ? {
        x: c.geometry.x + (c.geometry.width || 0) / 2,
        y: c.geometry.y + (c.geometry.height || 0) / 2
    } : {
        x: 0,
        y: 0
    };
    const SW_W = 74, SW_H = 38, SW_FY = 22 / 40;
    const far = (e, self) => !e || !self ? null : e.source === self ? e.target : e.source;
    const groups = new Map;
    (graph.getChildCells(parent, !0, false) || []).filter(isSw).forEach(sw => {
        const edges = (graph.getEdges(sw) || []).filter(e => e && e.source && e.target);
        const peers = edges.map(e => far(e, sw));
        const lineV = peers.find(isLineV);
        const bus = peers.find(isBus);
        if (!lineV || !bus) return;
        if (!groups.has(lineV)) groups.set(lineV, []);
        groups.get(lineV).push({
            sw: sw,
            bus: bus,
            edges: edges
        });
    });
    groups.forEach((items, lineV) => {
        const buses = (graph.getEdges(lineV) || []).map(e => far(e, lineV)).filter(isBus);
        if (buses.length < 2 || !buses[0].geometry || !buses[1].geometry) return;
        const endX = (cell, towardX) => {
            const g = cell.geometry, c = ctr(cell), frac = towardX >= c.x ? .82 : .18;
            return {
                x: g.x + frac * g.width,
                y: c.y,
                frac: frac
            };
        };
        const EA = endX(buses[0], ctr(buses[1]).x), EB = endX(buses[1], ctr(buses[0]).x);
        const A = EA, B = EB;
        const dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
        const gap = Math.min(78, Math.max(46, len * .22));
        const lg = lineV.geometry.clone();
        lg.width = 12;
        lg.height = 12;
        lg.x = (A.x + B.x) / 2 - 6;
        lg.y = (A.y + B.y) / 2 - 6;
        lg.points = null;
        model.setGeometry(lineV, lg);
        (graph.getEdges(lineV) || []).slice().forEach(ed => {
            const peer = far(ed, lineV);
            if (isBus(peer)) model.remove(ed);
        });
        const covered = new Set(items.map(it => it.bus));
        buses.forEach(bus => {
            if (covered.has(bus) || !bus.geometry) return;
            const peer = bus === buses[0] ? buses[1] : buses[0];
            const frac = endX(bus, ctr(peer).x).frac;
            graph.insertEdge(parent, null, "", bus, lineV, `edgeStyle=none;rounded=0;orthogonalLoop=0;jettySize=0;html=1;endArrow=none;exitX=${frac};exitY=0.5;exitDx=0;exitDy=0;exitPerimeter=0;entryX=0.5;entryY=0.5;entryDx=0;entryDy=0;entryPerimeter=0;shapeELXXX=NotEditableLine`);
        });
        items.forEach(item => {
            const fromA = ctr(item.bus).x === A.x && ctr(item.bus).y === A.y || Math.hypot(ctr(item.bus).x - A.x, ctr(item.bus).y - A.y) < Math.hypot(ctr(item.bus).x - B.x, ctr(item.bus).y - B.y);
            const t = fromA ? gap : len - gap;
            const cx = A.x + ux * t, cy = A.y + uy * t;
            const ang = Math.atan2(fromA ? dy : -dy, fromA ? dx : -dx) * 180 / Math.PI;
            const g = item.sw.geometry.clone();
            g.width = SW_W;
            g.height = SW_H;
            g.x = cx - SW_W / 2;
            g.y = cy - SW_H / 2;
            g.points = null;
            model.setGeometry(item.sw, g);
            model.setStyle(item.sw, String(item.sw.style || "").replace(/;?rotation=-?\d+(\.\d+)?/g, "") + ";rotation=" + ang.toFixed(1));
            item.edges.forEach(ed => {
                const fromSw = ed.source === item.sw;
                const peer = fromSw ? ed.target : ed.source;
                const toBus = isBus(peer);
                const swX = toBus ? 0 : 1, swY = SW_FY;
                const busFrac = peer === buses[0] ? EA.frac : peer === buses[1] ? EB.frac : .5;
                const exitX = fromSw ? swX : busFrac, exitY = fromSw ? swY : .5, entryX = fromSw ? busFrac : swX, entryY = fromSw ? .5 : swY;
                model.setStyle(ed, `edgeStyle=none;rounded=0;orthogonalLoop=0;jettySize=0;html=1;endArrow=none;exitX=${exitX};exitY=${exitY};exitDx=0;exitDy=0;exitPerimeter=0;entryX=${entryX};entryY=${entryY};entryDx=0;entryDy=0;entryPerimeter=0;shapeELXXX=NotEditableLine`);
                if (ed.geometry) {
                    const eg = ed.geometry.clone();
                    eg.points = null;
                    model.setGeometry(ed, eg);
                }
            });
        });
    });
}

function elTransmissionFixTrafoSwitches(graph, parent) {
    if (window._elxxxRadialImport || !graph || !parent) return;
    const model = graph.getModel();
    const isSw = c => !!(c && !c.edge && /shapeELXXX=Switch/.test(String(c.style || "")));
    const isBus = c => !!(c && !c.edge && /shapeELXXX=Bus/.test(String(c.style || "")));
    const isTrafo = c => !!(c && !c.edge && /shapeELXXX=Transformer/.test(String(c.style || "")) && !/Three Winding/.test(String(c.style || "")));
    const ctr = c => c && c.geometry ? {
        x: c.geometry.x + (c.geometry.width || 0) / 2,
        y: c.geometry.y + (c.geometry.height || 0) / 2
    } : {
        x: 0,
        y: 0
    };
    const far = (e, self) => !e || !self ? null : e.source === self ? e.target : e.source;
    const SW_W = 74, SW_H = 38, SW_FY = 22 / 40;
    const terminals = trafo => {
        const n = trafo.geometry;
        if (!n) return [];
        const st = String(trafo.style || ""), rot = /rotation=180/.test(st), vert = /transformer-v/.test(st);
        const cx = n.x + n.width / 2, cy = n.y + n.height / 2;
        const ports = vert ? [ {
            ex: .5,
            ey: .044444444444444446
        }, {
            ex: .5,
            ey: .9555555555555556
        } ] : [ {
            ex: .044444444444444446,
            ey: .5172413793103449
        }, {
            ex: .9555555555555556,
            ey: .5172413793103449
        } ];
        return ports.map(p => {
            let x = n.x + n.width * p.ex, y = n.y + n.height * p.ey;
            if (rot) {
                x = 2 * cx - x;
                y = 2 * cy - y;
            }
            return {
                x: x,
                y: y,
                ex: p.ex,
                ey: p.ey
            };
        });
    };
    (graph.getChildCells(parent, !0, false) || []).filter(isSw).forEach(sw => {
        const edges = (graph.getEdges(sw) || []).filter(e => e && e.source && e.target);
        const peers = edges.map(e => far(e, sw));
        const bus = peers.find(isBus), trafo = peers.find(isTrafo);
        if (!bus || !trafo || !bus.geometry || !trafo.geometry) return;
        const ports = terminals(trafo);
        if (!ports.length) return;
        const bc = ctr(bus);
        let port = ports[0], best = 1e9;
        ports.forEach(p => {
            const d = Math.hypot(p.x - bc.x, p.y - bc.y);
            if (d < best) {
                best = d;
                port = p;
            }
        });
        const frac = port.x >= bc.x ? .82 : .18;
        const ax = bus.geometry.x + frac * bus.geometry.width, ay = bc.y;
        const dx = port.x - ax, dy = port.y - ay, len = Math.hypot(dx, dy) || 1;
        const gap = Math.min(72, Math.max(40, len * .35));
        const cx = ax + dx / len * gap, cy = ay + dy / len * gap;
        const ang = Math.atan2(dy, dx) * 180 / Math.PI;
        const g = sw.geometry.clone();
        g.width = SW_W;
        g.height = SW_H;
        g.x = cx - SW_W / 2;
        g.y = cy - SW_H / 2;
        g.points = null;
        model.setGeometry(sw, g);
        model.setStyle(sw, String(sw.style || "").replace(/;?rotation=-?\d+(\.\d+)?/g, "") + ";rotation=" + ang.toFixed(1));
        (graph.getEdges(trafo) || []).slice().forEach(ed => {
            if (far(ed, trafo) === bus) model.remove(ed);
        });
        edges.forEach(ed => {
            const fromSw = ed.source === sw;
            const peer = fromSw ? ed.target : ed.source;
            const toBus = peer === bus;
            const swX = toBus ? 0 : 1, swY = SW_FY;
            const exitX = fromSw ? swX : toBus ? frac : port.ex, exitY = fromSw ? swY : toBus ? .5 : port.ey;
            const entryX = fromSw ? toBus ? frac : port.ex : swX, entryY = fromSw ? toBus ? .5 : port.ey : swY;
            model.setStyle(ed, `edgeStyle=none;rounded=0;orthogonalLoop=0;jettySize=0;html=1;endArrow=none;exitX=${exitX};exitY=${exitY};exitDx=0;exitDy=0;exitPerimeter=0;entryX=${entryX};entryY=${entryY};entryDx=0;entryDy=0;entryPerimeter=0;shapeELXXX=NotEditableLine`);
            if (ed.geometry) {
                const eg = ed.geometry.clone();
                eg.points = null;
                model.setGeometry(ed, eg);
            }
        });
    });
}

/**
 * Whether a vertical stem from busVertex at x to height y would cross another
 * busbar drawn between them - or pass so close to a bar's end (margin) that it
 * reads as a connection to it.
 */
function stemCrossesBusbar(grafka, parent, busVertex, x, y, margin = 40) {
    const from = busVertex.geometry.y;
    const lo = Math.min(from, y), hi = Math.max(from, y);
    return (grafka.getChildCells(parent, true, false) || []).some((cell) => {
        if (cell === busVertex || !cell.geometry || !/shapeELXXX=Bus(;|$)/.test(cell.style || '')) return false;
        const g = cell.geometry;
        return g.y > lo && g.y < hi && x >= g.x - margin && x <= g.x + g.width + margin;
    });
}

function findVertexByBusId(grafka, parent, busName) {
    const want = String(busName);
    // The map is rebuilt once per import and cached on the parent; callers hit
    // this thousands of times on a large network.
    if (parent && parent._elBusByName && parent._elBusByName.has(want)) {
        return parent._elBusByName.get(want);
    }

    const childCells = grafka.getChildCells(parent, true, false);
    const map = new Map();
    let found = null;

    for (let i = 0; i < childCells.length; i++) {
        const cell = childCells[i];
        if (!cell || !cell.value || cell.value === "PandapowerNet") continue;
        const attrs = cell.value.attributes;
        if (!attrs) continue;
        for (let a = 0; a < attrs.length; a++) {
            const nm = attrs[a].nodeName;
            if ((nm === 'name' || nm === 'pp_bus_name') && attrs[a].nodeValue != null) {
                const key = String(attrs[a].nodeValue);
                if (!map.has(key)) map.set(key, cell);
                if (key === want) found = cell;
            }
        }
    }

    if (parent) parent._elBusByName = map;
    return found;
}

function importGetXmlAttribute(cell, attrName) {
    if (!cell?.value?.attributes) return null;
    const attrs = cell.value.attributes;
    for (let i = 0; i < attrs.length; i++) {
        if (attrs[i].name === attrName) return attrs[i].value;
    }
    return null;
}

function importBusbarCenterXY(busVertex) {
    if (!busVertex?.geometry) return { x: 0, y: 0 };
    return {
        x: busVertex.geometry.x + (busVertex.geometry.width || IMPORT_BUSBAR_W) / 2,
        y: busVertex.geometry.y + busVertex.geometry.height / 2,
    };
}

/** Snap to the busbar ``points=`` grid (every 5 %). Keep off the extreme ends. */
function importSnapBusbarPinX(frac) {
    const clamped = Math.max(0.05, Math.min(0.95, Number(frac) || 0.5));
    return Math.round(clamped * 20) / 20;
}

/**
 * Preferred dock fraction along a busbar from a peer X (component / other bus centre).
 * Spreads feeder / trafo / device ties so they do not all stack at mid-bus.
 */
function importBusbarPinXFromPeerX(busVertex, peerX) {
    if (!busVertex?.geometry) return 0.5;
    const bx = busVertex.geometry.x;
    const bw = busVertex.geometry.width || IMPORT_BUSBAR_W;
    if (!(bw > 0)) return 0.5;
    return importSnapBusbarPinX((peerX - bx) / bw);
}

/**
 * Allocate a free busbar pin near ``preferredFrac`` on ``side`` ('above'|'below'|'any').
 * Avoids stacking multiple edges on the exact same dock point.
 */
function importCreateBusbarPinAllocator() {
    const used = new Map();
    return function allocate(busVertex, preferredFrac, side = 'any') {
        const busKey = busVertex?.id != null ? String(busVertex.id) : 'bus';
        const key = `${busKey}:${side}`;
        if (!used.has(key)) used.set(key, new Set());
        const taken = used.get(key);
        let pin = importSnapBusbarPinX(preferredFrac);
        if (!taken.has(pin)) {
            taken.add(pin);
            return pin;
        }
        const step = 0.1;
        for (let attempt = 1; attempt <= 18; attempt++) {
            const delta = Math.ceil(attempt / 2) * step * (attempt % 2 === 0 ? -1 : 1);
            pin = importSnapBusbarPinX(preferredFrac + delta);
            if (!taken.has(pin)) {
                taken.add(pin);
                return pin;
            }
        }
        taken.add(pin);
        return pin;
    };
}

/** True when a pandapower shunt should render as an Electrisim Capacitor (not shunt reactor). */
function importShuntLooksLikeCapacitor(name, qMvar) {
    const n = String(name || '').toLowerCase();
    if (/(capacitor|cap\s*bank|capbank|\bcaps?\b)/i.test(n)) return true;
    const q = Number(qMvar);
    return Number.isFinite(q) && q < 0;
}

/**
 * Bus dock Y for ``shape=line`` busbars: the stroke is drawn at cell mid-height.
 * Docking at 0/1 leaves a visible gap of ~half the bus cell height.
 */
const IMPORT_BUSBAR_EDGE_Y = 0.5;

function importFindVertexByTransformerName(grafka, parent, trafoName) {
    const want = String(trafoName);
    const childCells = grafka.getChildCells(parent, true, false);
    for (let i = 0; i < childCells.length; i++) {
        const cell = childCells[i];
        if (!cell?.style || cell.edge) continue;
        const st = String(cell.style);
        if (!st.includes('shapeELXXX=Transformer') && !st.includes('shapeELXXX=Three Winding Transformer')) continue;
        const nm = importGetXmlAttribute(cell, 'name');
        if (nm != null && String(nm) === want) return cell;
    }
    return null;
}

/** Backend may emit plain indices (``"4"``) while buses use ``Bus_4`` when names are blank. */
function importFindBusVertexByPandapowerRef(grafka, parent, ref, busData) {
    if (ref == null || ref === '') return null;
    const s = String(ref).trim();
    let v = findVertexByBusId(grafka, parent, s);
    if (v) return v;
    if (/^\d+$/.test(s)) {
        v = findVertexByBusId(grafka, parent, `Bus_${s}`);
        if (v) return v;
        const idx = parseInt(s, 10);
        if (busData && busData.data && busData.data[idx]) {
            const rowName = busData.data[idx][0];
            return findVertexByBusId(grafka, parent, rowName);
        }
    }
    return null;
}

/**
 * Switch ``element`` for lines may be ``Line_0`` or bare ``"0"`` (pandapower index) after export.
 */
function importResolveLineDataRow(lineData, elementRef) {
    if (!lineData || !lineData.data) return null;
    const s = String(elementRef);
    let row = lineData.data.find((ln) => String(ln[0]) === s);
    if (row) return row;
    if (/^\d+$/.test(s)) {
        const idx = parseInt(s, 10);
        if (lineData.data[idx]) return lineData.data[idx];
        row = lineData.data.find((ln) => String(ln[0]) === `Line_${s}`);
        if (row) return row;
    }
    return null;
}

function importFindLineVertexPeer(importLineVertexByName, lineData, elementRef) {
    const s = String(elementRef);
    if (importLineVertexByName[s]) return importLineVertexByName[s];
    if (/^\d+$/.test(s) && importLineVertexByName[`Line_${s}`]) return importLineVertexByName[`Line_${s}`];
    const row = importResolveLineDataRow(lineData, elementRef);
    if (row && importLineVertexByName[String(row[0])]) return importLineVertexByName[String(row[0])];
    return null;
}

function importFindTrafoVertexForSwitch(grafka, parent, elementRef, transformerData) {
    let v = importFindVertexByTransformerName(grafka, parent, elementRef);
    if (v) return v;
    const s = String(elementRef).trim();
    if (/^\d+$/.test(s)) {
        v = importFindVertexByTransformerName(grafka, parent, `Trafo_${s}`);
        if (v) return v;
        const idx = parseInt(s, 10);
        if (transformerData && transformerData.data && transformerData.data[idx]) {
            const nm = transformerData.data[idx][0];
            return importFindVertexByTransformerName(grafka, parent, nm);
        }
    }
    return null;
}

/**
 * Bus name string as used on imported busbars (matches switch ``bus`` column after numeric resolve).
 */
function importBusNameFromSwitchRow(busNameImported, busData) {
    let busKey = String(busNameImported).trim();
    if (/^\d+$/.test(busKey) && busData?.data?.[parseInt(busKey, 10)]) {
        busKey = String(busData.data[parseInt(busKey, 10)][0]);
    }
    return busKey;
}

function importResolveTwoWTrafoRowIndex(elementRef, transformerData) {
    if (!transformerData?.data) return -1;
    const el = String(elementRef).trim();
    if (/^\d+$/.test(el)) {
        const idx = parseInt(el, 10);
        return idx >= 0 && idx < transformerData.data.length ? idx : -1;
    }
    const byName = transformerData.data.findIndex((t) => String(t[0]) === el);
    if (byName >= 0) return byName;
    const m = el.match(/^Trafo_(\d+)$/);
    if (m) {
        const idx = parseInt(m[1], 10);
        return idx >= 0 && idx < transformerData.data.length ? idx : -1;
    }
    return -1;
}

function importResolveThreeWTrafoRowIndex(elementRef, trafo3wData) {
    if (!trafo3wData?.data) return -1;
    const el = String(elementRef).trim();
    if (/^\d+$/.test(el)) {
        const idx = parseInt(el, 10);
        return idx >= 0 && idx < trafo3wData.data.length ? idx : -1;
    }
    const byName = trafo3wData.data.findIndex((t) => String(t[0]) === el);
    if (byName >= 0) return byName;
    return -1;
}

/**
 * Row index → Set of bus names that already have an ``et=='t'`` / ``et=='t3'`` switch to that transformer.
 * Omitting matching trafo↔bus import edges avoids 4-way (duplicate) connections on the symbol.
 */
function importBuildTrafoSwitchBusSets(switchData, transformerData, threeWindingTransformerData, busData) {
    const twoW = [];
    const threeW = [];
    (switchData.data || []).forEach((row) => {
        if (!Array.isArray(row) || row.length < 8) return;
        const [, busNameImported, elementRef, etRaw] = row;
        const et = String(etRaw || 'l');
        if (et !== 't' && et !== 't3') return;
        const busKey = importBusNameFromSwitchRow(busNameImported, busData);
        if (et === 't') {
            const ti = importResolveTwoWTrafoRowIndex(elementRef, transformerData);
            if (ti < 0) return;
            if (!twoW[ti]) twoW[ti] = new Set();
            twoW[ti].add(busKey);
        } else {
            const ti = importResolveThreeWTrafoRowIndex(elementRef, threeWindingTransformerData);
            if (ti < 0) return;
            if (!threeW[ti]) threeW[ti] = new Set();
            threeW[ti].add(busKey);
        }
    });
    return { twoW, threeW };
}

function importCellIs2WTransformer(c) {
    if (!c?.style) return false;
    const s = String(c.style);
    return s.includes('shapeELXXX=Transformer') && !s.includes('Three Winding');
}

function importCellIs3WTransformer(c) {
    return Boolean(c?.style && String(c.style).includes('shapeELXXX=Three Winding Transformer'));
}

function importCellIsLineGraphVertex(c) {
    return Boolean(c?.style && !c.edge && String(c.style).includes('shapeELXXX=Line'));
}

/** Electrical midpoint of horizontal imported busbar. */
function importBusbarElectricalY(busVertex) {
    if (!busVertex?.geometry) return 0;
    return busVertex.geometry.y + busVertex.geometry.height / 2;
}

/**
 * Edge bus → switch: dock on busbar; enter switch at side pins (horizontal SLD) or top/bottom (vertical SLD).
 */
function importBusToSwitchEdgeStyle(busVertex, swVertex, verticalSld) {
    if (verticalSld && !window._elxxxRadialImport) {
        const busY = importBusbarElectricalY(busVertex);
        const swY = swVertex.geometry.y + swVertex.geometry.height / 2;
        const swX = swVertex.geometry.x + swVertex.geometry.width / 2;
        const below = swY >= busY;
        const pin = importBusbarPinXFromPeerX(busVertex, swX);
        return (
            'edgeStyle=none;rounded=0;orthogonalLoop=0;jettySize=0;html=1;endArrow=none;' +
            `exitX=${pin};exitY=0.5;exitDx=0;exitDy=0;exitPerimeter=0;` +
            `entryX=0.5;entryY=${below ? 0 : 1};entryDx=0;entryDy=0;entryPerimeter=0;shapeELXXX=NotEditableLine`
        );
    }
    if (verticalSld) {
        const busY = importBusbarElectricalY(busVertex);
        const swY = swVertex.geometry.y + swVertex.geometry.height / 2;
        const swX = swVertex.geometry.x + swVertex.geometry.width / 2;
        const below = swY >= busY;
        const pin = importBusbarPinXFromPeerX(busVertex, swX);
        return (
            'edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=0;html=1;endArrow=none;' +
            `exitX=${pin};exitY=0.5;exitDx=0;exitDy=0;exitPerimeter=0;` +
            `entryX=0.5;entryY=${below ? 0 : 1};entryDx=0;entryDy=0;entryPerimeter=0;shapeELXXX=NotEditableLine`
        );
    }
    const bcy = importBusbarElectricalY(busVertex);
    const swCy = swVertex.geometry.y + swVertex.geometry.height / 2;
    const bcx = busVertex.geometry.x + IMPORT_BUSBAR_W / 2;
    const swcx = swVertex.geometry.x + swVertex.geometry.width / 2;
    const dy = bcy - swCy;

    let exitX = 0.5;
    let exitY = 1;
    let entryX = 0;
    let entryY = SWITCH_EDGE_PIN_Y;

    if (Math.abs(dy) <= 3) {
        if (bcx < swcx - 8) {
            exitX = 1;
            exitY = 0.5;
            entryX = 0;
            entryY = SWITCH_EDGE_PIN_Y;
        } else if (bcx > swcx + 8) {
            exitX = 0;
            exitY = 0.5;
            entryX = 1;
            entryY = SWITCH_EDGE_PIN_Y;
        } else if (dy <= 0) {
            exitY = 1;
            entryX = 0;
        } else {
            exitY = 0;
            entryX = 1;
        }
    } else if (dy < 0) {
        exitY = 1;
        entryX = 0;
    } else {
        exitY = 0;
        entryX = 1;
    }

    return (
        'edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;' +
        `exitX=${exitX};exitY=${exitY};exitDx=0;exitDy=0;exitPerimeter=0;` +
        `entryX=${entryX};entryY=${entryY};entryDx=0;entryDy=0;entryPerimeter=0;;shapeELXXX=NotEditableLine`
    );
}

/**
 * Edge switch → peer: exit switch at opposite pin; enter 2W trafo on HV/LV winding points (or top/bottom when vertical).
 */
function importSwitchToPeerEdgeStyle(swVertex, peerCell, busVertex, verticalSld) {
    if (verticalSld && !window._elxxxRadialImport) {
        const swY = swVertex.geometry.y + swVertex.geometry.height / 2;
        const swX = swVertex.geometry.x + swVertex.geometry.width / 2;
        const peerY = peerCell.geometry.y + (peerCell.geometry.height || 0) / 2;
        const peerBelow = peerY >= swY;
        let entryX = 0.5;
        let entryY = peerBelow ? 0 : 1;
        // A wide peer is another busbar, so enter it along the bar, not at a corner.
        if (peerCell.geometry && peerCell.geometry.width > 80) {
            entryX = importBusbarPinXFromPeerX(peerCell, swX);
            entryY = 0.5;
        }
        return (
            'edgeStyle=none;rounded=0;orthogonalLoop=0;jettySize=0;html=1;endArrow=none;' +
            `exitX=0.5;exitY=${peerBelow ? 1 : 0};exitDx=0;exitDy=0;exitPerimeter=0;` +
            `entryX=${entryX};entryY=${entryY};entryDx=0;entryDy=0;entryPerimeter=0;shapeELXXX=NotEditableLine`
        );
    }
    if (verticalSld) {
        const swY = swVertex.geometry.y + swVertex.geometry.height / 2;
        const peerY = peerCell.geometry.y + peerCell.geometry.height / 2;
        const peerBelow = peerY >= swY;
        return (
            'edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=0;html=1;endArrow=none;' +
            `exitX=0.5;exitY=${peerBelow ? 1 : 0};exitDx=0;exitDy=0;exitPerimeter=0;` +
            `entryX=0.5;entryY=0.5;entryDx=0;entryDy=0;entryPerimeter=0;shapeELXXX=NotEditableLine`
        );
    }
    const bcy = importBusbarElectricalY(busVertex);
    const swCy = swVertex.geometry.y + swVertex.geometry.height / 2;
    const bcx = busVertex.geometry.x + IMPORT_BUSBAR_W / 2;
    const swcx = swVertex.geometry.x + swVertex.geometry.width / 2;
    const dy = bcy - swCy;

    let exitX = 1;
    let exitY = SWITCH_EDGE_PIN_Y;

    if (Math.abs(dy) <= 3) {
        if (bcx < swcx - 8) {
            exitX = 1;
        } else if (bcx > swcx + 8) {
            exitX = 0;
        } else if (dy <= 0) {
            exitX = 1;
        } else {
            exitX = 0;
        }
    } else if (dy < 0) {
        exitX = 1;
    } else {
        exitX = 0;
    }

    const peerCy = peerCell.geometry.y + peerCell.geometry.height / 2;
    const peerBelow = peerCy > swCy + 2;

    let entryX = 0.5;
    let entryY = 0.5;
    if (importCellIs2WTransformer(peerCell)) {
        if (peerBelow) {
            entryX = TRANSFORMER_EDGE_PIN_X_HV;
            entryY = TRANSFORMER_EDGE_PIN_Y;
        } else {
            entryX = TRANSFORMER_EDGE_PIN_X_LV;
            entryY = TRANSFORMER_EDGE_PIN_Y;
        }
    } else if (importCellIs3WTransformer(peerCell)) {
        entryX = 0.5;
        entryY = peerBelow ? 0 : 1;
    } else if (importCellIsLineGraphVertex(peerCell)) {
        entryX = 0.5;
        entryY = 0.5;
    } else {
        entryX = 0.5;
        entryY = peerBelow ? 0 : 1;
    }

    return (
        'edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;' +
        `exitX=${exitX};exitY=${exitY};exitDx=0;exitDy=0;exitPerimeter=0;` +
        `entryX=${entryX};entryY=${entryY};entryDx=0;entryDy=0;entryPerimeter=0;;shapeELXXX=NotEditableLine`
    );
}

/** Trafo → bus: winding pins (horizontal SLD) or top/bottom (vertical SLD). */
function importTrafoToBusEdgeStyle(trafoVertex, busVertex, isHvWinding, verticalSld, allocateBusPin) {
    const tcx = trafoVertex.geometry.x + trafoVertex.geometry.width / 2;
    const tcy = trafoVertex.geometry.y + trafoVertex.geometry.height / 2;
    const bcy = importBusbarElectricalY(busVertex);
    const busAbove = bcy < tcy - 2;
    const preferred = importBusbarPinXFromPeerX(busVertex, tcx);
    const side = busAbove ? 'above' : 'below';
    const entryX = allocateBusPin
        ? allocateBusPin(busVertex, preferred, side)
        : preferred;
    const entryY = IMPORT_BUSBAR_EDGE_Y;
    if (verticalSld) {
        // sym-transformer-v: HV at top, LV at bottom — inset pins match Graph constraints (4/90, 86/90).
        const exitX = 0.5;
        const exitY = isHvWinding ? 4 / 90 : 86 / 90;
        return (
            `${IMPORT_VERTICAL_SLD_EDGE_BASE}` +
            `exitX=${exitX};exitY=${exitY};exitDx=0;exitDy=0;exitPerimeter=0;` +
            `entryX=${entryX};entryY=${entryY};entryDx=0;entryDy=0;entryPerimeter=0;;shapeELXXX=NotEditableLine`
        );
    }
    const exitX = isHvWinding ? TRANSFORMER_EDGE_PIN_X_HV : TRANSFORMER_EDGE_PIN_X_LV;
    const exitY = TRANSFORMER_EDGE_PIN_Y;
    return (
        'edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;' +
        `exitX=${exitX};exitY=${exitY};exitDx=0;exitDy=0;exitPerimeter=0;` +
        `entryX=${entryX};entryY=${entryY};entryDx=0;entryDy=0;entryPerimeter=0;;shapeELXXX=NotEditableLine`
    );
}

/** Line between two busbars: dock along each bar toward the peer, on the stroke (Y=0.5). */
function importBusToBusLineEdgeStyle(fromBusVertex, toBusVertex, allocateBusPin) {
    const fromC = importBusbarCenterXY(fromBusVertex);
    const toC = importBusbarCenterXY(toBusVertex);
    // Orthogonal routing with pin allocation does not scale to thousands of
    // lines; fall back to a straight edge with jumps.
    if (window._elxxxLargeImport) {
        return 'edgeStyle=none;rounded=0;orthogonalLoop=0;jettySize=0;jumpStyle=arc;jumpSize=12;html=1;endArrow=none;noEdgeStyle=1;exitX=0.5;exitY=0.5;entryX=0.5;entryY=0.5;exitPerimeter=0;entryPerimeter=0;shapeELXXX=Line';
    }
    const fromPreferred = importBusbarPinXFromPeerX(fromBusVertex, toC.x);
    const toPreferred = importBusbarPinXFromPeerX(toBusVertex, fromC.x);
    const fromSide = toC.y >= fromC.y ? 'below' : 'above';
    const toSide = fromC.y >= toC.y ? 'below' : 'above';
    const exitX = allocateBusPin
        ? allocateBusPin(fromBusVertex, fromPreferred, fromSide)
        : fromPreferred;
    const entryX = allocateBusPin
        ? allocateBusPin(toBusVertex, toPreferred, toSide)
        : toPreferred;
    return (
        'edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;' +
        `exitX=${exitX};exitY=${IMPORT_BUSBAR_EDGE_Y};exitDx=0;exitDy=0;exitPerimeter=0;` +
        `entryX=${entryX};entryY=${IMPORT_BUSBAR_EDGE_Y};entryDx=0;entryDy=0;entryPerimeter=0;;shapeELXXX=Line`
    );
}

/** Device (ext grid / sgen / shunt / capacitor) → bus: centre of device to a free pin on the bar. */
function importDeviceToBusEdgeStyle(deviceVertex, busVertex, allocateBusPin, verticalSld) {
    const dcx = deviceVertex.geometry.x + deviceVertex.geometry.width / 2;
    const dcy = deviceVertex.geometry.y + deviceVertex.geometry.height / 2;
    const bcy = importBusbarElectricalY(busVertex);
    const busAbove = bcy < dcy - 2;
    const preferred = importBusbarPinXFromPeerX(busVertex, dcx);
    const side = busAbove ? 'above' : 'below';
    const entryX = allocateBusPin
        ? allocateBusPin(busVertex, preferred, side)
        : preferred;
    const exitY = busAbove ? 0 : 1;
    const base = verticalSld
        ? 'edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;'
        : 'edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;';
    return (
        `${base}` +
        `exitX=0.5;exitY=${exitY};exitDx=0;exitDy=0;exitPerimeter=0;` +
        `entryX=${entryX};entryY=${IMPORT_BUSBAR_EDGE_Y};entryDx=0;entryDy=0;entryPerimeter=0;;shapeELXXX=NotEditableLine`
    );
}

/** Three-winding trafo → bus for vertical SLD (approximate top/bottom docking). */
/** Straight drop from a shunt-like device down (or up) onto its busbar. */
function importStraightShuntDropStyle(deviceVertex, busVertex) {
    const dg = deviceVertex?.geometry;
    const bg = busVertex?.geometry;
    if (!dg || !bg) {
        return 'edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=none;jettySize=0;orthogonalLoop=0;exitX=0.5;exitY=0;entryX=0.5;entryY=0.5;exitPerimeter=0;entryPerimeter=0;shapeELXXX=NotEditableLine';
    }
    const cx = dg.x + dg.width / 2;
    const busAbove = importBusbarElectricalY(busVertex) <= dg.y + dg.height / 2;
    const entryX = Math.max(0.08, Math.min(0.92, (cx - bg.x) / (bg.width || 1)));
    return `edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=none;jettySize=0;orthogonalLoop=0;exitX=0.5;exitY=${busAbove ? 0 : 1};exitDx=0;exitDy=0;exitPerimeter=0;entryX=${entryX};entryY=0.5;entryDx=0;entryDy=0;entryPerimeter=0;shapeELXXX=NotEditableLine`;
}

/** Fan successive devices on the same bus sideways so they do not overlap. */
/** Next x offset along a bus for a device hung under it: 0, +step, -step, +2 step... */
function importDeviceSlotX(busVertex, step = 52) {
    const key = busVertex ? String(busVertex.id) : '';
    const slots = window._elxxxDevSlot || (window._elxxxDevSlot = new Map());
    const n = slots.get(key) || 0;
    slots.set(key, n + 1);
    return n === 0 ? 0 : (n % 2 ? 1 : -1) * Math.ceil(n / 2) * step;
}

function importTrafo3wToBusEdgeStyle(trafoVertex, busVertex, allocateBusPin) {
    const tcx = trafoVertex.geometry.x + trafoVertex.geometry.width / 2;
    const tcy = trafoVertex.geometry.y + trafoVertex.geometry.height / 2;
    const bcy = importBusbarElectricalY(busVertex);
    const busAbove = bcy < tcy - 2;
    const preferred = importBusbarPinXFromPeerX(busVertex, tcx);
    const side = busAbove ? 'above' : 'below';
    const entryX = allocateBusPin
        ? allocateBusPin(busVertex, preferred, side)
        : preferred;
    return (
        'edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;jettySize=0;orthogonalLoop=1;' +
        `exitX=0.5;exitY=${busAbove ? 0 : 1};exitDx=0;exitDy=0;exitPerimeter=0;` +
        `entryX=${entryX};entryY=${IMPORT_BUSBAR_EDGE_Y};entryDx=0;entryDy=0;entryPerimeter=0;shapeELXXX=NotEditableLine`
    );
}

function importResolveBusRowIndex(ref, busData) {
    if (!busData?.data) return -1;
    const s = String(ref).trim();
    if (/^\d+$/.test(s)) {
        const i = parseInt(s, 10);
        if (i >= 0 && i < busData.data.length) return i;
    }
    const byName = busData.data.findIndex((row) => String(row[0]) === s);
    return byName;
}

function importAllBusesHaveGeo(busData) {
    if (!busData?.data?.length) return false;
    for (let r = 0; r < busData.data.length; r++) {
        const row = busData.data[r];
        const gx = row.length > 4 ? row[4] : null;
        const gy = row.length > 5 ? row[5] : null;
        if (gx == null || gy == null) return false;
        const x = Number(gx);
        const y = Number(gy);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    }
    return true;
}

/** Map pandapower geo coordinates to canvas (Y grows downward; geo often uses Y up). */
/**
 * Bus positions from the file's own geo coordinates.
 *
 * Reproduced from the committed HEAD bytes: rewritten by hand inside the
 * minified file, so this IS the source. Only `!0`/`!1` are spelled out.
 *
 * Beyond the original centre-and-scale, it now: derives the scale from the
 * 20th-percentile nearest-neighbour distance (so dense and sparse networks
 * both land at a usable size, clamped between a floor and a cap); snaps
 * mid-size networks onto a coarse grid to stop busbars overlapping; and fans
 * buses that share identical coordinates out beneath the first one.
 */
function importBusPositionsFromGeo(busData, anchorX, anchorY, scaleHint) {
    const o = [], pts = [];
    let i = 1 / 0, a = -1 / 0, s = 1 / 0, l = -1 / 0;
    for (let k = 0; k < busData.data.length; k++) {
        const x = Number(busData.data[k][4]), y = Number(busData.data[k][5]);
        pts.push([ x, y ]);
        i = Math.min(i, x), a = Math.max(a, x), s = Math.min(s, y), l = Math.max(l, y);
    }
    const c = (i + a) / 2, u = (s + l) / 2, nBus = pts.length, spanX = Math.max(a - i, 1e-6), spanY = Math.max(l - s, 1e-6);
    let scale = Number(scaleHint) || 88;
    if (nBus > 1) {
        const step = Math.max(1, Math.floor(nBus / 280)), dists = [];
        for (let p = 0; p < nBus; p += step) {
            let best = 1e12;
            for (let q = 0; q < nBus; q++) {
                if (p === q) continue;
                const dx = pts[p][0] - pts[q][0], dy = pts[p][1] - pts[q][1], d = dx * dx + dy * dy;
                if (d > 1e-12 && d < best) best = d;
            }
            if (best < 1e12) dists.push(Math.sqrt(best));
        }
        dists.sort((A, B) => A - B);
        const pivot = dists.length ? dists[Math.min(dists.length - 1, Math.floor(dists.length * .2))] : .001;
        const target = nBus > 4e3 ? 150 : nBus > 800 ? 220 : nBus > 80 ? 400 : 480;
        let sc = target / Math.max(pivot, 1e-6);
        const span = Math.max(spanX, spanY);
        let long = span * sc;
        const cap = nBus > 2e3 ? 28e3 : nBus > 200 ? 16e3 : 8e3;
        const floor = nBus > 80 ? 4800 : nBus > 12 ? 2400 : 1100;
        if (long > cap) sc *= cap / long;
        long = span * sc;
        if (long < floor) sc *= floor / long;
        scale = sc;
    }
    for (let p = 0; p < nBus; p++) o[p] = {
        x: anchorX + (pts[p][0] - c) * scale - IMPORT_BUSBAR_W / 2,
        y: anchorY - (pts[p][1] - u) * scale
    };
    const preSnap = o.map(function(p) {
        return p ? {
            x: p.x,
            y: p.y
        } : null;
    });
    if (nBus > 40 && nBus <= 350) {
        const cellW = 340, cellH = 210, taken = new Set;
        let bx = 1 / 0, by = 1 / 0;
        for (let p = 0; p < nBus; p++) bx = Math.min(bx, o[p].x), by = Math.min(by, o[p].y);
        const key = (gx, gy) => gx + ":" + gy;
        for (let p = 0; p < nBus; p++) {
            let gx = Math.round((o[p].x - bx) / cellW), gy = Math.round((o[p].y - by) / cellH), found = !taken.has(key(gx, gy));
            if (!found) {
                for (let rad = 1; rad < 40 && !found; rad++) {
                    for (let dy = -rad; dy <= rad && !found; dy++) {
                        for (let dx = -rad; dx <= rad; dx++) {
                            if (Math.max(Math.abs(dx), Math.abs(dy)) !== rad) continue;
                            if (!taken.has(key(gx + dx, gy + dy))) {
                                gx += dx;
                                gy += dy;
                                found = !0;
                                break;
                            }
                        }
                    }
                }
            }
            taken.add(key(gx, gy));
            o[p].x = bx + gx * cellW;
            o[p].y = by + gy * cellH;
        }
    }
    const coinc = new Map;
    for (let p = 0; p < nBus; p++) {
        const key = pts[p][0].toFixed(4) + "," + pts[p][1].toFixed(4);
        coinc.has(key) || coinc.set(key, []);
        coinc.get(key).push(p);
    }
    coinc.forEach(function(group) {
        if (group.length < 2) return;
        const main = group[0], anchor = preSnap[main] || o[main], x0 = anchor.x, y0 = anchor.y, peers = group.slice(1), mw = Math.min(420, 160 + peers.length * 100), pw = 108, gap = 20, total = peers.length * pw + (peers.length - 1) * gap, left = x0 + Math.max(8, (mw - total) / 2);
        o[main].x = x0;
        o[main].y = y0;
        o[main].w = mw;
        for (let k = 0; k < peers.length; k++) {
            const idx = peers[k];
            o[idx].x = left + k * (pw + gap);
            o[idx].y = y0 + 96;
            o[idx].w = pw;
        }
    });
    return o;
}

function importBuildBusAdjacencyForLayout(busCount, lineData, transformerData, switchData, busData,
    threeWindingTransformerData) {
    const adj = Array.from({ length: busCount }, () => []);
    const add = (a, b) => {
        if (a < 0 || b < 0 || a >= busCount || b >= busCount || a === b) return;
        adj[a].push(b);
        adj[b].push(a);
    };
    (lineData.data || []).forEach((line) => {
        const [, , from_bus, to_bus] = line;
        add(from_bus, to_bus);
    });
    (transformerData.data || []).forEach((t) => {
        const [, , hv, lv] = t;
        add(hv, lv);
    });
    // Without these, every bus behind a three-winding transformer looks
    // disconnected and the whole import drops to the voltage-band layout.
    ((threeWindingTransformerData && threeWindingTransformerData.data) || []).forEach((t) => {
        const [, , hv, mv, lv] = t;
        add(hv, mv);
        add(hv, lv);
    });
    (switchData.data || []).forEach((row) => {
        if (!Array.isArray(row) || row.length < 8) return;
        if (String(row[3] || 'l') !== 'b') return;
        const u = importResolveBusRowIndex(row[1], busData);
        const v = importResolveBusRowIndex(row[2], busData);
        add(u, v);
    });
    return adj;
}

/**
 * BFS from slack bus: vertical spine for radial feeders; siblings spread on X.
 * Returns null if the graph is disconnected.
 */
function importLayoutBfsVerticalFeeder(busCount, adj, rootIdx, anchorX, anchorY, yStep, siblingGap) {
    if (rootIdx < 0 || rootIdx >= busCount) return null;
    const depth = new Array(busCount).fill(-1);
    const q = [rootIdx];
    depth[rootIdx] = 0;
    while (q.length) {
        const u = q.shift();
        const neigh = [...new Set(adj[u])].sort((a, b) => a - b);
        for (let i = 0; i < neigh.length; i++) {
            const v = neigh[i];
            if (depth[v] >= 0) continue;
            depth[v] = depth[u] + 1;
            q.push(v);
        }
    }
    if (depth.some((d) => d < 0)) return null;

    const byDepth = new Map();
    let maxD = 0;
    for (let i = 0; i < busCount; i++) {
        const d = depth[i];
        maxD = Math.max(maxD, d);
        if (!byDepth.has(d)) byDepth.set(d, []);
        byDepth.get(d).push(i);
    }
    for (const [, arr] of byDepth) {
        arr.sort((a, b) => a - b);
    }

    const positions = [];
    for (let i = 0; i < busCount; i++) {
        positions.push({ x: 0, y: 0 });
    }
    for (let d = 0; d <= maxD; d++) {
        const layer = byDepth.get(d) || [];
        const n = layer.length;
        const y = anchorY + d * yStep;
        for (let j = 0; j < n; j++) {
            const busIdx = layer[j];
            const offsetX = n === 1 ? 0 : (j - (n - 1) / 2) * siblingGap;
            positions[busIdx] = {
                x: anchorX + offsetX - IMPORT_BUSBAR_W / 2,
                y,
            };
        }
    }
    return positions;
}

// Optimized component insertion with proper batching and UI yielding
let componentInsertionQueue = [];
let isProcessingComponents = false;

// Component creation batch processor with UI yielding
// OPTIMIZED: Uses requestIdleCallback for better performance and prevents long tasks
async function processComponentBatches(componentTasks, batchSize = 3, yieldMs = 0) {
    const totalTasks = componentTasks.length;
    let processedCount = 0;
    
    // Show progress for large batches
    const showProgress = totalTasks > 50;
    if (showProgress) {
        console.log(`🚀 Processing ${totalTasks} component tasks in batches of ${batchSize}`);
    }
    
    for (let i = 0; i < totalTasks; i += batchSize) {
        const batch = componentTasks.slice(i, i + batchSize);
        const batchNum = Math.floor(i / batchSize) + 1;

        // Process batch synchronously for better performance
        batch.forEach(task => {
            try {
                task();
                processedCount++;
            } catch (error) {
                console.error('Error processing component task:', error);
            }
        });

        // Yield to UI thread between batches using requestIdleCallback when available
        if (i + batchSize < totalTasks) {
            if (typeof requestIdleCallback !== 'undefined') {
                await new Promise(resolve => {
                    requestIdleCallback(() => {
                        resolve();
                    }, { timeout: 50 }); // Force execution after 50ms max
                });
            } else {
                // Fallback to setTimeout
                if (yieldMs > 0) {
                    await new Promise(resolve => setTimeout(resolve, yieldMs));
                }
            }
        }
        
        // Log progress periodically
        if (showProgress && (batchNum % 10 === 0 || i + batchSize >= totalTasks)) {
            console.log(`   Progress: ${processedCount}/${totalTasks} (${((processedCount/totalTasks)*100).toFixed(1)}%)`);
        }
    }
    
    if (showProgress) {
        console.log(`✅ Completed processing ${processedCount} component tasks`);
    }
    
    return processedCount;
}

// Enhanced debounced component insertion
const debouncedComponentInsertion = (() => {
    let timeoutId = null;
    return (grafka, a, target, point, data) => {
        // Add to queue
        componentInsertionQueue.push({ grafka, a, target, point, data });

        // Clear existing timeout
        if (timeoutId) {
            clearTimeout(timeoutId);
        }

        // Shorter debounce for better responsiveness
        timeoutId = setTimeout(async () => {
            if (isProcessingComponents) return;

            isProcessingComponents = true;
            try {
                const batchSize = componentInsertionQueue.length > 20 ? 3 : 5; // Smaller batches for large operations
                while (componentInsertionQueue.length > 0) {
                    const items = componentInsertionQueue.splice(0, batchSize);

                    for (const item of items) {
                        await insertComponentsForData(item.grafka, item.a, item.target, item.point, item.data);
                    }

                    // Yield between items for very large operations
                    if (componentInsertionQueue.length > 0) {
                        await new Promise(resolve => setTimeout(resolve, 1));
                    }
                }
            } finally {
                isProcessingComponents = false;
            }
        }, 50); // Reduced from 100ms to 50ms for better responsiveness
    };
})();

/**
 * Called from app (import .py / .dss) after backend returns pandapower-compatible JSON.
 * Uses the same insertion path as dropping a "Pandapower Network" shape.
 */
/** Layout names a caller may pass, mapped onto the importer's internal choice. */
const IMPORT_LAYOUT_ALIASES = {
    transmission: 'vertical',
    radial: 'radial',
};

/**
 * Resolve a caller-supplied layout ('transmission' | 'radial' | 'auto') the same
 * way the prompt would: 'auto' takes the guess the "Other" button takes.
 * Returns null for anything else.
 */
function resolveImportLayout(layout, model) {
    const key = String(layout || '').trim().toLowerCase();
    if (key === 'auto') return elSuggestSystem(model);
    return IMPORT_LAYOUT_ALIASES[key] || null;
}

/**
 * @param graph     the editor graph
 * @param jsonText  the model JSON, as text or already parsed
 * @param layout    optional. When given ('transmission' | 'radial' | 'auto') the
 *                  layout prompt is skipped and drawing is awaited rather than
 *                  debounced, so the caller learns when it finished and what it
 *                  produced. The menu import passes nothing and behaves as before.
 * @returns         with a layout: { layout, cellsAdded }. Without: undefined.
 */
window.buildDiagramFromModelJson = async function (graph, jsonText, layout) {
    if (!graph || !graph.view) {
        console.error('buildDiagramFromModelJson: invalid graph');
        if (layout) throw new Error('No editor graph to draw into.');
        return;
    }
    let parsed;
    try {
        parsed = typeof jsonText === 'string' ? JSON.parse(jsonText) : jsonText;
    } catch (e) {
        // A programmatic caller gets the reason back instead of a modal.
        if (layout) throw new Error('Invalid model JSON: ' + e.message);
        if (typeof mxUtils !== 'undefined' && mxUtils.alert) {
            mxUtils.alert('Invalid JSON from import: ' + e.message);
        } else {
            console.error('Invalid JSON from import:', e);
        }
        return;
    }
    if (parsed && typeof parsed.error === 'string') {
        const msg = parsed.error;
        if (layout) throw new Error('Import failed: ' + msg);
        if (typeof mxUtils !== 'undefined' && mxUtils.alert) {
            mxUtils.alert('Import failed: ' + msg);
        } else {
            console.error('Import failed:', msg);
        }
        return;
    }
    if (!parsed || !parsed._object) {
        if (layout) throw new Error('Model JSON has no _object network model.');
        if (typeof mxUtils !== 'undefined' && mxUtils.alert) {
            mxUtils.alert('Import response missing network model.');
        }
        return;
    }
    const scale = graph.view.scale;
    const tr = graph.view.translate;
    let ip;
    if (typeof graph.getFreeInsertPoint === 'function') {
        ip = graph.getFreeInsertPoint();
    } else {
        ip = { x: 100, y: 100 };
    }
    const point = { x: (ip.x + tr.x) * scale, y: (ip.y + tr.y) * scale };

    if (layout) {
        const resolved = resolveImportLayout(layout, parsed);
        if (!resolved) {
            throw new Error(`Unknown layout '${layout}'. Use transmission, radial or auto.`);
        }
        parsed._object._import_layout = resolved;
        const parent = graph.getDefaultParent();
        const before = graph.getChildCells(parent, true, true).length;
        window._elxxxRadialUnplaced = [];
        await insertComponentsForData(graph, null, null, point, parsed);
        return {
            layout: resolved,
            cellsAdded: graph.getChildCells(parent, true, true).length - before,
            // Non-empty only for a radial layout that did not fit the network.
            unplaced: (window._elxxxRadialUnplaced || []).slice(),
        };
    }

    const chosen = await promptImportNetworkLayout(parsed);
    if (!chosen) {
        return;
    }
    parsed._object._import_layout = chosen;

    debouncedComponentInsertion(graph, null, null, point, parsed);
};

// Extract component insertion logic into separate function
function parseImportTable(objWrapper, fallback = { data: [] }) {
    try {
        if (objWrapper?._object) {
            return JSON.parse(objWrapper._object);
        }
        if (typeof objWrapper === 'string') {
            return JSON.parse(objWrapper);
        }
    } catch (e) {
        console.warn('JSON parse failed:', e);
    }
    return fallback;
}

/** Layout constants for OpenDSS 1ph radial feeder import (one row/column per cabinet). */
const OPENDSS_1PH_BUS_W = 120;
const OPENDSS_1PH_BUS_H = 10;
const OPENDSS_1PH_ROW_HEIGHT = 260;
const OPENDSS_1PH_COL_WIDTH = 260;
const OPENDSS_1PH_FEEDER_X_OFFSET = -300;
const OPENDSS_1PH_TAP_GAP = 56;
const OPENDSS_1PH_LV_GAP = 56;
const OPENDSS_1PH_LOAD_BELOW_LV = 48;
const OPENDSS_1PH_SOURCE_ABOVE = 110;
const OPENDSS_1PH_EDGE_BASE =
    'edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;';
const OPENDSS_1PH_LINE_EDGE_STYLE =
    OPENDSS_1PH_EDGE_BASE +
    'exitX=0.5;exitY=1;exitDx=0;exitDy=0;exitPerimeter=0;' +
    'entryX=0.5;entryY=0;entryDx=0;entryDy=0;entryPerimeter=0;shapeELXXX=Line 1ph';
/** Horizontal backbone segment between HV junctions (left → right). */
const OPENDSS_1PH_LINE_EDGE_STYLE_H =
    OPENDSS_1PH_EDGE_BASE +
    'exitX=1;exitY=0.5;exitDx=0;exitDy=0;exitPerimeter=0;' +
    'entryX=0;entryY=0.5;entryDx=0;entryDy=0;entryPerimeter=0;shapeELXXX=Line 1ph';
/** HV bus (right side) → transformer (left winding pin). */
const OPENDSS_1PH_EDGE_HV_TO_TRAFO =
    OPENDSS_1PH_EDGE_BASE +
    'exitX=1;exitY=0.5;exitDx=0;exitDy=0;exitPerimeter=0;' +
    'entryX=0;entryY=0.5;entryDx=0;entryDy=0;entryPerimeter=0;shapeELXXX=NotEditableLine';
/** Transformer (right winding pin) → LV bus (left side). */
const OPENDSS_1PH_EDGE_TRAFO_TO_LV =
    OPENDSS_1PH_EDGE_BASE +
    'exitX=1;exitY=0.5;exitDx=0;exitDy=0;exitPerimeter=0;' +
    'entryX=0;entryY=0.5;entryDx=0;entryDy=0;entryPerimeter=0;shapeELXXX=NotEditableLine';
/** LV bus (bottom) → Load 1ph top connection pin. */
const OPENDSS_1PH_EDGE_LV_TO_LOAD =
    OPENDSS_1PH_EDGE_BASE +
    'exitX=0.5;exitY=1;exitDx=0;exitDy=0;exitPerimeter=0;' +
    'entryX=0.5;entryY=' + (2 / 64) + ';entryDx=0;entryDy=0;entryPerimeter=0;shapeELXXX=NotEditableLine';
const OPENDSS_1PH_EDGE_SOURCE =
    OPENDSS_1PH_EDGE_BASE +
    'exitX=0.5;exitY=1;exitDx=0;exitDy=0;exitPerimeter=0;' +
    'entryX=0.5;entryY=0;entryDx=0;entryDy=0;entryPerimeter=0;shapeELXXX=NotEditableLine';
/** HV junction (bottom) → transformer HV pin (left) on a downward branch (horizontal layout). */
const OPENDSS_1PH_EDGE_HV_TO_TRAFO_H =
    OPENDSS_1PH_EDGE_BASE +
    'exitX=0.5;exitY=1;exitDx=0;exitDy=0;exitPerimeter=0;' +
    'entryX=0;entryY=0.5;entryDx=0;entryDy=0;entryPerimeter=0;shapeELXXX=NotEditableLine';
/** Transformer 1ph LV pin (rotated 90°) → LV bus (top), horizontal layout branch. */
const OPENDSS_1PH_EDGE_TRAFO_TO_LV_H =
    OPENDSS_1PH_EDGE_BASE +
    'exitX=1;exitY=0.5;exitDx=0;exitDy=0;exitPerimeter=0;' +
    'entryX=0.5;entryY=0;entryDx=0;entryDy=0;entryPerimeter=0;shapeELXXX=NotEditableLine';

/**
 * Ask the user how to lay out an imported network (.dss / .py).
 * @returns {Promise<'vertical'|'horizontal'|null>}
 */
function promptImportNetworkLayout(model) {
    return new Promise((resolve) => {
        const guess = elSuggestSystem(model);
        const overlay = document.createElement('div');
        overlay.style.cssText =
            'position:fixed;inset:0;background:rgba(0,0,0,0.35);z-index:100000;' +
            'display:flex;align-items:center;justify-content:center;';
        const box = document.createElement('div');
        box.style.cssText =
            'background:#fff;padding:24px 28px;border-radius:8px;' +
            'box-shadow:0 4px 24px rgba(0,0,0,0.2);max-width:520px;' +
            'font-family:Helvetica,Arial,sans-serif;';
        const hint = guess === 'radial' ? 'radial plant' : 'transmission grid';
        box.innerHTML =
            '<h3 style="margin:0 0 10px;font-size:18px;">What system are you importing?</h3>' +
            '<p style="margin:0 0 14px;color:#444;line-height:1.45;font-size:14px;">Transmission keeps the existing meshed-network layout. Radial draws a plant single-line: grid at the top, feeders in columns.</p>' +
            '<ul style="margin:0 0 20px 18px;padding:0;color:#555;font-size:13px;line-height:1.5;">' +
            '<li><strong>Transmission</strong> — meshed grid (IEEE-style), unchanged.</li>' +
            '<li><strong>Radial</strong> — feeder / wind plant single-line.</li>' +
            '<li><strong>Other</strong> — detect from the file (' + hint + ').</li></ul>' +
            '<div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;"><button type="button" data-layout="cancel" style="padding:8px 14px;">Cancel</button><button type="button" data-layout="other" style="padding:8px 14px;">Other</button><button type="button" data-layout="radial" style="padding:8px 14px;">Radial</button><button type="button" data-layout="vertical" style="padding:8px 14px;">Transmission</button></div>';
        const finish = (layout) => {
            if (overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
            resolve(layout);
        };
        box.addEventListener('click', (evt) => {
            const btn = evt.target.closest('[data-layout]');
            if (!btn) {
                return;
            }
            const choice = btn.getAttribute('data-layout');
            if (choice === 'cancel') {
                finish(null);
            } else if (choice === 'other') {
                finish(guess);
            } else if (choice === 'vertical' || choice === 'radial') {
                finish(choice);
            }
        });
        overlay.appendChild(box);
        document.body.appendChild(overlay);
    });
}

function importOpenDss1phJunctionBusStyle() {
    return vertexStyleImportedBusbar('Bus');
}

/**
 * Build a single-phase radial network using OpenDSS-only palette elements.
 * Vertical: main path top-to-bottom with branches to the right.
 * @param {'vertical'|'horizontal'} layout
 */
function insertOpenDss1phFeederImport(grafka, parent, layoutCenterX, startY, bundle, layout = 'vertical') {
    if (layout === 'horizontal') {
        insertOpenDss1phFeederImportHorizontal(grafka, parent, layoutCenterX, startY, bundle);
        return;
    }
    const lineRows = bundle.line_1ph?.data || [];
    const trafoRows = bundle.trafo_1ph?.data || [];
    const loadRows = bundle.load_1ph?.data || [];
    const sourceRows = bundle.source_1ph?.data || [];
    const feederNodes = bundle.feeder_nodes?.data || [];

    const feedLeft = layoutCenterX + OPENDSS_1PH_FEEDER_X_OFFSET - OPENDSS_1PH_BUS_W / 2;
    const [trW, trH] = vertexSizeFromElectrisimSymbol('sym-transformer', 40, 60);
    const [ldW, ldH] = vertexSizeFromElectrisimSymbol('sym-load', 44, 56);
    const tapBlockW = OPENDSS_1PH_TAP_GAP + trW + OPENDSS_1PH_LV_GAP + OPENDSS_1PH_BUS_W;
    const trafoLeft = feedLeft + OPENDSS_1PH_BUS_W + OPENDSS_1PH_TAP_GAP;
    const lvLeft = trafoLeft + trW + OPENDSS_1PH_LV_GAP;

    const junctionByBusName = Object.create(null);
    const rowByHvBus = Object.create(null);

    feederNodes.forEach(([busName, orderIdx]) => {
        const row = Number(orderIdx);
        const rowY = startY + OPENDSS_1PH_SOURCE_ABOVE + row * OPENDSS_1PH_ROW_HEIGHT;
        const junction = grafka.insertVertex(
            parent,
            null,
            '',
            feedLeft,
            rowY,
            OPENDSS_1PH_BUS_W,
            OPENDSS_1PH_BUS_H,
            importOpenDss1phJunctionBusStyle(),
        );
        configureBusAttributes(grafka, junction, {
            name: String(busName),
            vn_kv: '3',
        });
        junctionByBusName[String(busName)] = junction;
        rowByHvBus[String(busName)] = rowY;
    });

    lineRows.forEach((row) => {
        const [name, fromBus, toBus, lengthKm, rOhm, xOhm, cNf] = row;
        const fromVertex = junctionByBusName[String(fromBus)];
        const toVertex = junctionByBusName[String(toBus)];
        if (!fromVertex || !toVertex) {
            console.warn(`Skipping Line 1ph ${name}: junction not found`, { fromBus, toBus });
            return;
        }
        const lineEdge = grafka.insertEdge(
            parent,
            null,
            String(name),
            fromVertex,
            toVertex,
            OPENDSS_1PH_LINE_EDGE_STYLE,
        );
        if (typeof window.configureLine1phAttributes === 'function') {
            window.configureLine1phAttributes(grafka, lineEdge, {
                name: String(name),
                length_km: String(lengthKm),
                r_ohm_per_km: String(rOhm),
                x_ohm_per_km: String(xOhm),
                c_nf_per_km: String(cNf),
                phase: 1,
                conn: 'wye',
                in_service: true,
            });
        }
    });

    const lvBusByName = Object.create(null);
    const trafoByHv = Object.create(null);
    const trStyle = vertexStyleFromElectrisimSymbol('sym-transformer', 'Transformer 1ph');

    trafoRows.forEach((row) => {
        const [
            name, hvBus, lvBusName, snKva, vnHvKv, vnLvKv, vkPercent, vkrPercent, inService,
        ] = row;
        const hvVertex = junctionByBusName[String(hvBus)];
        const rowY = rowByHvBus[String(hvBus)];
        if (!hvVertex || rowY == null) {
            console.warn(`Skipping Transformer 1ph ${name}: HV junction ${hvBus} not found`);
            return;
        }

        const trafoY = rowY + OPENDSS_1PH_BUS_H / 2 - trH / 2;
        const trafoVertex = grafka.insertVertex(
            parent,
            null,
            '',
            trafoLeft,
            trafoY,
            trW,
            trH,
            trStyle,
        );
        if (typeof window.configureTransformer1phAttributes === 'function') {
            window.configureTransformer1phAttributes(grafka, trafoVertex, {
                name: String(name),
                sn_kva: String(snKva),
                vn_hv_kv: String(vnHvKv),
                vn_lv_kv: String(vnLvKv),
                vk_percent: String(vkPercent),
                vkr_percent: String(vkrPercent),
                phase: 1,
                conn: 'wye',
                in_service: inService !== false,
            });
        }
        grafka.insertEdge(parent, null, '', hvVertex, trafoVertex, OPENDSS_1PH_EDGE_HV_TO_TRAFO);

        const lvBusVertex = grafka.insertVertex(
            parent,
            null,
            '',
            lvLeft,
            rowY,
            OPENDSS_1PH_BUS_W,
            OPENDSS_1PH_BUS_H,
            importOpenDss1phJunctionBusStyle(),
        );
        configureBusAttributes(grafka, lvBusVertex, {
            name: String(lvBusName),
            vn_kv: String(vnLvKv),
        });
        lvBusByName[String(lvBusName)] = lvBusVertex;
        trafoByHv[String(hvBus)] = { trafoVertex, lvBus: lvBusVertex, lvBusName: String(lvBusName) };

        grafka.insertEdge(parent, null, '', trafoVertex, lvBusVertex, OPENDSS_1PH_EDGE_TRAFO_TO_LV);
    });

    const loadStyle = vertexStyleFromElectrisimSymbol('sym-load', 'Load 1ph');
    loadRows.forEach((row) => {
        const [name, lvBusName, pKw, qKvar, kv, pf, conn, inService] = row;
        let lvBusVertex = lvBusByName[String(lvBusName)];
        if (!lvBusVertex) {
            const trafoEntry = Object.values(trafoByHv).find((t) => t.lvBusName === String(lvBusName));
            lvBusVertex = trafoEntry?.lvBus;
        }
        if (!lvBusVertex) {
            console.warn(`Skipping Load 1ph ${name}: LV bus ${lvBusName} not found`);
            return;
        }
        const loadX = lvBusVertex.geometry.x + OPENDSS_1PH_BUS_W / 2 - ldW / 2;
        const loadY = lvBusVertex.geometry.y + OPENDSS_1PH_BUS_H + OPENDSS_1PH_LOAD_BELOW_LV;
        const loadVertex = grafka.insertVertex(
            parent,
            null,
            '',
            loadX,
            loadY,
            ldW,
            ldH,
            loadStyle,
        );
        if (typeof window.configureLoad1phAttributes === 'function') {
            window.configureLoad1phAttributes(grafka, loadVertex, {
                name: String(name),
                p_kw: String(pKw),
                q_kvar: String(qKvar),
                kv: String(kv),
                pf: String(pf),
                phase: 1,
                conn: conn || 'wye',
                in_service: inService !== false,
            });
        }
        // LV bus → load top pin (child terminal at relative y=0)
        grafka.insertEdge(parent, null, '', lvBusVertex, loadVertex, OPENDSS_1PH_EDGE_LV_TO_LOAD);
    });

    sourceRows.forEach((row) => {
        const [name, busName, vmPu, vaDegree, sScMax, inService] = row;
        const junction = junctionByBusName[String(busName)];
        if (!junction) {
            console.warn(`Skipping Source 1ph ${name}: junction ${busName} not found`);
            return;
        }
        const [srcW, srcH] = vertexSizeFromElectrisimSymbol('sym-ext-grid', 56, 56);
        const anchorX = junction.geometry.x + OPENDSS_1PH_BUS_W / 2 - srcW / 2;
        const anchorY = junction.geometry.y - OPENDSS_1PH_SOURCE_ABOVE;
        const srcStyle = vertexStyleFromElectrisimSymbol('sym-ext-grid', 'Source 1ph');
        const srcVertex = grafka.insertVertex(
            parent,
            null,
            '',
            anchorX,
            anchorY,
            srcW,
            srcH,
            srcStyle,
        );
        if (typeof window.configureSource1phAttributes === 'function') {
            window.configureSource1phAttributes(grafka, srcVertex, {
                name: String(name),
                vm_pu: String(vmPu),
                va_degree: String(vaDegree),
                s_sc_max_mva: String(sScMax),
                phase: 1,
                conn: 'wye',
                in_service: inService !== false,
            });
        }
        grafka.insertEdge(parent, null, '', srcVertex, junction, OPENDSS_1PH_EDGE_SOURCE);
    });

    // Frame imported network so the full diagram is visible after drop.
    try {
        if (typeof grafka.fitWindow === 'function') {
            const n = feederNodes.length || 1;
            const totalH = OPENDSS_1PH_SOURCE_ABOVE + n * OPENDSS_1PH_ROW_HEIGHT + ldH + 80;
            const totalW = tapBlockW + OPENDSS_1PH_BUS_W + 80;
            grafka.fitWindow(
                new mxRectangle(feedLeft - 60, startY - 20, totalW, totalH),
                30,
            );
        }
    } catch (e) {
        console.warn('Could not auto-fit OpenDSS 1ph import:', e);
    }
}

/**
 * Horizontal layout: main path left-to-right with branches downward:
 *   Source 1ph (above first bus) — HV bus — … — Transformer 1ph — LV bus — Load 1ph.
 */
function insertOpenDss1phFeederImportHorizontal(grafka, parent, layoutCenterX, startY, bundle) {
    const lineRows = bundle.line_1ph?.data || [];
    const trafoRows = bundle.trafo_1ph?.data || [];
    const loadRows = bundle.load_1ph?.data || [];
    const sourceRows = bundle.source_1ph?.data || [];
    const feederNodes = bundle.feeder_nodes?.data || [];

    const feedTop = startY + OPENDSS_1PH_SOURCE_ABOVE;
    const feedStartX = layoutCenterX + OPENDSS_1PH_FEEDER_X_OFFSET;
    const [trW, trH] = vertexSizeFromElectrisimSymbol('sym-transformer', 40, 60);
    const [ldW, ldH] = vertexSizeFromElectrisimSymbol('sym-load', 44, 56);
    let trafoStyle = vertexStyleFromElectrisimSymbol('sym-transformer', 'Transformer 1ph');
    let trafoW = trW;
    let trafoH = trH;
    [trafoW, trafoH] = [trafoH, trafoW];
    trafoStyle = `${trafoStyle};rotation=${IMPORT_SLD_VERTICAL_ROTATION}`;
    const tapBlockH = OPENDSS_1PH_TAP_GAP + trafoH + OPENDSS_1PH_LV_GAP + OPENDSS_1PH_BUS_H;

    const junctionByBusName = Object.create(null);
    const colByHvBus = Object.create(null);

    feederNodes.forEach(([busName, orderIdx]) => {
        const col = Number(orderIdx);
        const colX = feedStartX + col * OPENDSS_1PH_COL_WIDTH;
        const junction = grafka.insertVertex(
            parent,
            null,
            '',
            colX,
            feedTop,
            OPENDSS_1PH_BUS_W,
            OPENDSS_1PH_BUS_H,
            importOpenDss1phJunctionBusStyle(),
        );
        configureBusAttributes(grafka, junction, {
            name: String(busName),
            vn_kv: '3',
        });
        junctionByBusName[String(busName)] = junction;
        colByHvBus[String(busName)] = colX;
    });

    lineRows.forEach((row) => {
        const [name, fromBus, toBus, lengthKm, rOhm, xOhm, cNf] = row;
        const fromVertex = junctionByBusName[String(fromBus)];
        const toVertex = junctionByBusName[String(toBus)];
        if (!fromVertex || !toVertex) {
            console.warn(`Skipping Line 1ph ${name}: junction not found`, { fromBus, toBus });
            return;
        }
        const lineEdge = grafka.insertEdge(
            parent,
            null,
            String(name),
            fromVertex,
            toVertex,
            OPENDSS_1PH_LINE_EDGE_STYLE_H,
        );
        if (typeof window.configureLine1phAttributes === 'function') {
            window.configureLine1phAttributes(grafka, lineEdge, {
                name: String(name),
                length_km: String(lengthKm),
                r_ohm_per_km: String(rOhm),
                x_ohm_per_km: String(xOhm),
                c_nf_per_km: String(cNf),
                phase: 1,
                conn: 'wye',
                in_service: true,
            });
        }
    });

    const lvBusByName = Object.create(null);
    const trafoByHv = Object.create(null);

    trafoRows.forEach((row) => {
        const [
            name, hvBus, lvBusName, snKva, vnHvKv, vnLvKv, vkPercent, vkrPercent, inService,
        ] = row;
        const hvVertex = junctionByBusName[String(hvBus)];
        const colX = colByHvBus[String(hvBus)];
        if (!hvVertex || colX == null) {
            console.warn(`Skipping Transformer 1ph ${name}: HV junction ${hvBus} not found`);
            return;
        }

        const trafoX = colX + OPENDSS_1PH_BUS_W / 2 - trafoW / 2;
        const trafoY = feedTop + OPENDSS_1PH_BUS_H + OPENDSS_1PH_TAP_GAP;
        const trafoVertex = grafka.insertVertex(
            parent,
            null,
            '',
            trafoX,
            trafoY,
            trafoW,
            trafoH,
            trafoStyle,
        );
        if (typeof window.configureTransformer1phAttributes === 'function') {
            window.configureTransformer1phAttributes(grafka, trafoVertex, {
                name: String(name),
                sn_kva: String(snKva),
                vn_hv_kv: String(vnHvKv),
                vn_lv_kv: String(vnLvKv),
                vk_percent: String(vkPercent),
                vkr_percent: String(vkrPercent),
                phase: 1,
                conn: 'wye',
                in_service: inService !== false,
            });
        }
        grafka.insertEdge(parent, null, '', hvVertex, trafoVertex, OPENDSS_1PH_EDGE_HV_TO_TRAFO_H);

        const lvY = trafoY + trafoH + OPENDSS_1PH_LV_GAP;
        const lvBusVertex = grafka.insertVertex(
            parent,
            null,
            '',
            colX,
            lvY,
            OPENDSS_1PH_BUS_W,
            OPENDSS_1PH_BUS_H,
            importOpenDss1phJunctionBusStyle(),
        );
        configureBusAttributes(grafka, lvBusVertex, {
            name: String(lvBusName),
            vn_kv: String(vnLvKv),
        });
        lvBusByName[String(lvBusName)] = lvBusVertex;
        trafoByHv[String(hvBus)] = { trafoVertex, lvBus: lvBusVertex, lvBusName: String(lvBusName) };

        grafka.insertEdge(parent, null, '', trafoVertex, lvBusVertex, OPENDSS_1PH_EDGE_TRAFO_TO_LV_H);
    });

    const loadStyle = vertexStyleFromElectrisimSymbol('sym-load', 'Load 1ph');
    loadRows.forEach((row) => {
        const [name, lvBusName, pKw, qKvar, kv, pf, conn, inService] = row;
        let lvBusVertex = lvBusByName[String(lvBusName)];
        if (!lvBusVertex) {
            const trafoEntry = Object.values(trafoByHv).find((t) => t.lvBusName === String(lvBusName));
            lvBusVertex = trafoEntry?.lvBus;
        }
        if (!lvBusVertex) {
            console.warn(`Skipping Load 1ph ${name}: LV bus ${lvBusName} not found`);
            return;
        }
        const loadX = lvBusVertex.geometry.x + OPENDSS_1PH_BUS_W / 2 - ldW / 2;
        const loadY = lvBusVertex.geometry.y + OPENDSS_1PH_BUS_H + OPENDSS_1PH_LOAD_BELOW_LV;
        const loadVertex = grafka.insertVertex(
            parent,
            null,
            '',
            loadX,
            loadY,
            ldW,
            ldH,
            loadStyle,
        );
        if (typeof window.configureLoad1phAttributes === 'function') {
            window.configureLoad1phAttributes(grafka, loadVertex, {
                name: String(name),
                p_kw: String(pKw),
                q_kvar: String(qKvar),
                kv: String(kv),
                pf: String(pf),
                phase: 1,
                conn: conn || 'wye',
                in_service: inService !== false,
            });
        }
        grafka.insertEdge(parent, null, '', lvBusVertex, loadVertex, OPENDSS_1PH_EDGE_LV_TO_LOAD);
    });

    sourceRows.forEach((row) => {
        const [name, busName, vmPu, vaDegree, sScMax, inService] = row;
        const junction = junctionByBusName[String(busName)];
        if (!junction) {
            console.warn(`Skipping Source 1ph ${name}: junction ${busName} not found`);
            return;
        }
        const [srcW, srcH] = vertexSizeFromElectrisimSymbol('sym-ext-grid', 56, 56);
        const anchorX = junction.geometry.x + OPENDSS_1PH_BUS_W / 2 - srcW / 2;
        const anchorY = junction.geometry.y - OPENDSS_1PH_SOURCE_ABOVE;
        const srcStyle = vertexStyleFromElectrisimSymbol('sym-ext-grid', 'Source 1ph');
        const srcVertex = grafka.insertVertex(
            parent,
            null,
            '',
            anchorX,
            anchorY,
            srcW,
            srcH,
            srcStyle,
        );
        if (typeof window.configureSource1phAttributes === 'function') {
            window.configureSource1phAttributes(grafka, srcVertex, {
                name: String(name),
                vm_pu: String(vmPu),
                va_degree: String(vaDegree),
                s_sc_max_mva: String(sScMax),
                phase: 1,
                conn: 'wye',
                in_service: inService !== false,
            });
        }
        grafka.insertEdge(parent, null, '', srcVertex, junction, OPENDSS_1PH_EDGE_SOURCE);
    });

    try {
        if (typeof grafka.fitWindow === 'function') {
            const n = feederNodes.length || 1;
            const totalW = n * OPENDSS_1PH_COL_WIDTH + OPENDSS_1PH_BUS_W + 80;
            const totalH = OPENDSS_1PH_SOURCE_ABOVE + OPENDSS_1PH_BUS_H + tapBlockH +
                OPENDSS_1PH_LOAD_BELOW_LV + ldH + 80;
            grafka.fitWindow(
                new mxRectangle(feedStartX - 60, startY - 20, totalW, totalH),
                30,
            );
        }
    } catch (e) {
        console.warn('Could not auto-fit OpenDSS 1ph horizontal import:', e);
    }
}

async function insertComponentsForData(grafka, a, target, point, data) {
    // Show progress indicator for large component sets
    const totalComponents = Object.values(data._object).reduce((sum, obj) => {
        try {
            const parsed = JSON.parse(obj._object);
            return sum + (parsed.data ? parsed.data.length : 0);
        } catch {
            return sum;
        }
    }, 0);

    if (totalComponents > 50) {
        if (window.performanceOptimizer) {
            console.log(`🚀 Processing ${totalComponents} components with optimizations...`);
        }
    }

    const externalGridData = safeJsonParse(data?._object?.ext_grid?._object);
    const generatorData = JSON.parse(data._object.gen._object);
    const staticGeneratorData = JSON.parse(data._object.sgen._object);
    const asymmetricStaticGeneratorData = JSON.parse(data._object.asymmetric_sgen._object);
    let pvSystemData = { data: [] };
    try {
        if (data._object?.pvsystems?._object) {
            pvSystemData = JSON.parse(data._object.pvsystems._object);
        }
    } catch (e) {
        console.warn('Could not parse pvsystems bundle from OpenDSS import:', e);
    }

    const lineData = JSON.parse(data._object.line._object);
    const busData = JSON.parse(data._object.bus._object);

    const transformerData = JSON.parse(data._object.trafo._object);
    const threeWindingTransformerData = JSON.parse(data._object.trafo3w._object);
    const shuntReactorData = JSON.parse(data._object.shunt._object);
    //const capacitorData = JSON.parse(data._object.capacitor._object);
    const loadData = JSON.parse(data._object.load._object);
    const asymmetricLoadData = JSON.parse(data._object.asymmetric_load._object);
    const impedanceData = JSON.parse(data._object.impedance._object);
    const wardData = JSON.parse(data._object.ward._object);
    const extendedWardData = JSON.parse(data._object.xward._object);
    const motorData = JSON.parse(data._object.motor._object);
    const storageData = JSON.parse(data._object.storage._object);
    const regControlData = parseImportTable(data?._object?.regcontrol, { data: [] });
    const capControlData = parseImportTable(data?._object?.capcontrol, { data: [] });
    const storageControllerData = parseImportTable(data?._object?.storagecontroller, { data: [] });
    const svcData = JSON.parse(data._object.svc._object);
    const tcscData = JSON.parse(data._object.tcsc._object);
    //const sscData = JSON.parse(data._object.ssc._object); //to be added
    const dcLineData = JSON.parse(data._object.dcline._object);


    var scale = grafka.view.scale;
    var tr = grafka.view.translate;
    var x = point.x / scale - tr.x;
    var y = point.y / scale - tr.y;

    var parent = grafka.getDefaultParent();
    if (parent) parent._elBusByName = null;
    grafka.getModel().beginUpdate();

    try {
        const importMeta = parseImportTable(data?._object?.meta, {});
        if (importMeta.single_phase && importMeta.import_mode === 'opendss_1ph') {
            const layoutCenterX = x;
            const startY = y;
            const layout = data?._object?._import_layout === 'horizontal'
                || data?._object?._import_layout === 'radial'
                ? 'horizontal'
                : 'vertical';
            insertOpenDss1phFeederImport(grafka, parent, layoutCenterX, startY, {
                line_1ph: parseImportTable(data?._object?.line_1ph),
                trafo_1ph: parseImportTable(data?._object?.trafo_1ph),
                load_1ph: parseImportTable(data?._object?.load_1ph),
                source_1ph: parseImportTable(data?._object?.source_1ph),
                feeder_nodes: parseImportTable(data?._object?.feeder_nodes),
            }, layout);
            grafka.getModel().endUpdate();
            return;
        }

        let switchData = { data: [] };
        try {
            if (data._object?.switch?._object) {
                switchData = JSON.parse(data._object.switch._object);
            }
        } catch (e) {
            console.warn('Could not parse switch bundle from pandapower import:', e);
        }
        const lineNamesNeedingVertex = new Set();
        (switchData.data || []).forEach((row) => {
            if (!Array.isArray(row) || row.length < 8) return;
            const et = String(row[3] || 'l');
            if (et !== 'l') return;
            const el = String(row[2]);
            lineNamesNeedingVertex.add(el);
            if (/^\d+$/.test(el)) {
                lineNamesNeedingVertex.add(`Line_${el}`);
            }
        });
        const importLineVertexByName = Object.create(null);
        const trafoSwitchBusSets = importBuildTrafoSwitchBusSets(
            switchData,
            transformerData,
            threeWindingTransformerData,
            busData,
        );

        // First pass - identify bus-transformer connections with progress tracking
        const busCount = busData.data.length;
        const busToTransformerMap = new Array(busCount).fill().map(() => []);
        const trafoCount = transformerData.data.length;

        // Build transformer mappings efficiently
        for (let trafoIndex = 0; trafoIndex < trafoCount; trafoIndex++) {
            const trafo = transformerData.data[trafoIndex];
            const [name, std_type, hv_bus_no, lv_bus_no] = trafo;

            if (hv_bus_no < busCount && hv_bus_no >= 0) {
                busToTransformerMap[hv_bus_no].push(trafoIndex);
            }
            if (lv_bus_no < busCount && lv_bus_no >= 0) {
                busToTransformerMap[lv_bus_no].push(trafoIndex);
            }
        }

        // Create adjacency matrix more efficiently
        const busAdjacencyMatrix = Array.from({ length: busCount },
            () => new Array(busCount).fill(0));

        // Build adjacency matrix from lines
        lineData.data.forEach(line => {
            const [name, std_type, from_bus, to_bus] = line;
            if (from_bus < busCount && from_bus >= 0 && to_bus < busCount && to_bus >= 0) {
                busAdjacencyMatrix[from_bus][to_bus] = 1;
                busAdjacencyMatrix[to_bus][from_bus] = 1;
            }
        });

        // Add transformer connections
        transformerData.data.forEach(trafo => {
            const [name, std_type, hv_bus_no, lv_bus_no] = trafo;
            if (hv_bus_no < busCount && hv_bus_no >= 0 && lv_bus_no < busCount && lv_bus_no >= 0) {
                busAdjacencyMatrix[hv_bus_no][lv_bus_no] = 2;
                busAdjacencyMatrix[lv_bus_no][hv_bus_no] = 2;
            }
        });

        // Bus placement: pandapower geo (preferred) → vertical BFS feeder → legacy voltage bands
        // A large network needs the bands pulled apart, or the bars overlap.
        const levelHeight = busCount > 40 ? 480 : 200;
        const busSpacing = busCount > 40 ? 400 : IMPORT_BUSBAR_W + 60;
        const startX = x + 100;
        const startY = y + 100;
        const layoutCenterX = startX + IMPORT_BUSBAR_W / 2;

        let busPositions = null;
        let importPandapowerVerticalSld = false;
        const _importLayout = data?._object?._import_layout;
        const importLayoutChoice = _importLayout === 'horizontal'
            ? 'horizontal'
            : (_importLayout === 'radial' ? 'radial' : 'vertical');
        const allocateBusPin = importCreateBusbarPinAllocator();

        window._elxxxRadialImport = false;
        window._elxxxRadialLeaves = new Set();
        window._elxxxRadialSides = new Set();
        // Buses the radial layout could not reach, reported back to a caller
        // that asked for a layout (the MCP bridge) so it can say so.
        window._elxxxRadialUnplaced = [];
        window._elxxxUfn = {};

        // An import without coordinates of its own is laid out again once drawn
        // (sldAutoLayout.js); one with geo keeps its map.
        grafka._elxxxRelayoutSld = false;
        if (importLayoutChoice === 'radial') {
            try {
                const rawUfn = data._object.user_friendly_names && data._object.user_friendly_names._object;
                window._elxxxUfn = typeof rawUfn === 'string' ? JSON.parse(rawUfn) : (rawUfn || {});
            } catch (e) {
                window._elxxxUfn = {};
            }
            try {
                busPositions = elLayoutRadial(
                    busData.data,
                    lineData.data,
                    transformerData.data,
                    (externalGridData && externalGridData.data) || [],
                    layoutCenterX,
                    startY,
                );
                importPandapowerVerticalSld = true;
                window._elxxxRadialImport = true;
                grafka._elxxxRelayoutSld = busCount <= IMPORT_MAX_BUSES_VERTICAL_FEEDER;
                busPositions.forEach((pos, busIndex) => {
                    if (!pos || !busData.data[busIndex]) return;
                    if (pos.leaf) window._elxxxRadialLeaves.add(String(busData.data[busIndex][0]));
                    if (pos.side) window._elxxxRadialSides.add(String(busData.data[busIndex][0]));
                    if (pos.unplaced) window._elxxxRadialUnplaced.push(String(busData.data[busIndex][0]));
                });
            } catch (err) {
                console.warn('Radial layout failed', err);
                busPositions = null;
            }
        }
        let importUsedGeo = false;
        if (importLayoutChoice === 'vertical') {
            if (importAllBusesHaveGeo(busData) && importGeoCanvasOk(busData)) {
                busPositions = importBusPositionsFromGeo(busData, layoutCenterX, startY, IMPORT_GEO_SCALE);
                importPandapowerVerticalSld = true;
                importUsedGeo = true;
            } else if (
                busCount > 0 &&
                busCount <= IMPORT_MAX_BUSES_VERTICAL_FEEDER &&
                externalGridData &&
                Array.isArray(externalGridData.data) &&
                externalGridData.data.length > 0
            ) {
                const rootRow = externalGridData.data[0];
                const rootSlack = parseInt(String(rootRow[1]), 10);
                if (Number.isFinite(rootSlack) && rootSlack >= 0 && rootSlack < busCount) {
                    const adj = importBuildBusAdjacencyForLayout(
                        busCount,
                        lineData,
                        transformerData,
                        switchData,
                        busData,
                        threeWindingTransformerData,
                    );
                    busPositions = importLayoutBfsVerticalFeeder(
                        busCount,
                        adj,
                        rootSlack,
                        layoutCenterX,
                        startY,
                        IMPORT_VERTICAL_FEEDER_STEP,
                        IMPORT_SIBLING_BUS_GAP,
                    );
                    if (busPositions) {
                        importPandapowerVerticalSld = true;
                    }
                }
            }
            grafka._elxxxRelayoutSld = !importUsedGeo && busCount > 0
                && busCount <= IMPORT_MAX_BUSES_VERTICAL_FEEDER;
        }

        if (!busPositions) {
            importPandapowerVerticalSld = false;
            const voltageGroups = {};
            for (let index = 0; index < busData.data.length; index++) {
                const bus = busData.data[index];
                const [name, vn_kv, type, inService] = bus;
                const voltage = parseFloat(vn_kv);

                if (!voltageGroups[voltage]) {
                    voltageGroups[voltage] = [];
                }
                voltageGroups[voltage].push({ index, name, voltage });
            }

            const sortedVoltages = Object.keys(voltageGroups).map((v) => parseFloat(v)).sort((a, b) => b - a);

            busPositions = [];
            for (let i = 0; i < busCount; i++) {
                busPositions[i] = { x: 0, y: 0 };
            }

            let rowBase = 0;
            sortedVoltages.forEach((voltage) => {
                const busesAtLevel = voltageGroups[voltage];
                // Wrap a wide level onto several rows rather than one long line.
                const cols = busesAtLevel.length > 10
                    ? Math.max(4, Math.round(Math.sqrt(busesAtLevel.length * levelHeight / busSpacing)))
                    : busesAtLevel.length;
                const rows = Math.ceil(busesAtLevel.length / Math.max(1, cols));

                const totalWidth = (Math.min(cols, busesAtLevel.length) - 1) * busSpacing;
                const levelStartX = startX - totalWidth / 2;

                busesAtLevel.forEach((busInfo, busIndex) => {
                    const col = busIndex % cols;
                    const row = Math.floor(busIndex / cols);
                    busPositions[busInfo.index] = {
                        x: levelStartX + col * busSpacing,
                        y: startY + (rowBase + row) * levelHeight,
                    };
                });

                rowBase += rows;
            });

            // Pulling transformer ends onto a shared x only helps a small diagram;
            // on a large one it collapses the grid built above.
            if (!(busCount > 40)) transformerData.data.forEach((trafo) => {
                const [, , hv_bus_no, lv_bus_no] = trafo;

                if (hv_bus_no < busCount && hv_bus_no >= 0 && lv_bus_no < busCount && lv_bus_no >= 0) {
                    const hvBus = busData.data[hv_bus_no];
                    const lvBus = busData.data[lv_bus_no];
                    const hvVoltage = parseFloat(hvBus[1]);
                    const lvVoltage = parseFloat(lvBus[1]);

                    if (hvVoltage !== lvVoltage) {
                        const avgX = (busPositions[hv_bus_no].x + busPositions[lv_bus_no].x) / 2;
                        busPositions[hv_bus_no].x = avgX;
                        busPositions[lv_bus_no].x = avgX;
                    }
                }
            });

            // That pulling can land two bars of one row on top of each other;
            // walk each row left to right and push any overlap clear.
            const rowsByY = new Map();
            busPositions.forEach((pos, index) => {
                if (!rowsByY.has(pos.y)) rowsByY.set(pos.y, []);
                rowsByY.get(pos.y).push(index);
            });
            const minGap = Math.min(busSpacing, IMPORT_BUSBAR_W + 60);
            rowsByY.forEach((row) => {
                row.sort((a, b) => busPositions[a].x - busPositions[b].x || a - b);
                for (let k = 1; k < row.length; k++) {
                    const prev = busPositions[row[k - 1]];
                    const cur = busPositions[row[k]];
                    if (cur.x < prev.x + minGap) cur.x = prev.x + minGap;
                }
            });
        }

        // Past this many buses the import takes its cheaper paths: straight
        // line edges rather than pin-allocated orthogonal ones, thin bars, and
        // no placeholder vertices.
        grafka._elxxxSkipPlaceholders = busCount > 40;
        window._elxxxLargeImport = busCount > 40;
        window._elxxxOrthoLane = 0;
        window._elxxxGenSlot = new Map();
        window._elxxxDevSlot = new Map();
        window._elxxxLineTap = new Map();
        window._elxxxTrafoTap = new Map();
            // Create vertices using the calculated positions
            busData.data.forEach((bus, index) => {
                const [name, vn_kv, type, inService] = bus;

                // Get the optimized position for this bus
                const vertexX = busPositions[index].x;
                const vertexY = busPositions[index].y;

                // Svg busbar stretched to cell; points= restore edge docking along the bar (Graph.js)
                // Radial layouts size each bar individually; big imports use thin bars.
                const busW = (busPositions[index] && busPositions[index].w)
                    || (busCount > 4000 ? 56 : busCount > 800 ? 110 : IMPORT_BUSBAR_W);
                const busStyle = vertexStyleImportedBusbar('Bus')
                    + (window._elxxxRadialImport ? ';strokeColor=#1B7A1B;strokeWidth=3' : '');

                const vertex = grafka.insertVertex(
                    parent,
                    null,
                    ``,
                    vertexX,
                    vertexY,
                    busW,
                    // A large import draws hairline bars.
                    busCount > 40 ? 2 : IMPORT_BUSBAR_H,
                    busStyle
                );

                const friendlyBusName = window._elxxxRadialImport
                    && window._elxxxUfn && window._elxxxUfn[name];
                configureBusAttributes(grafka, vertex, {
                    name: friendlyBusName ? String(friendlyBusName) : `${name}`,
                    vn_kv: `${vn_kv}`
                });

                // Keep the pandapower name even when a friendly name replaces it,
                // so later lookups by bus name still resolve.
                if (window._elxxxRadialImport && vertex.value && vertex.value.setAttribute) {
                    vertex.value.setAttribute('pp_bus_name', String(name));
                    if (friendlyBusName) {
                        vertex.value.setAttribute('name', String(friendlyBusName));
                        vertex.value.setAttribute('userFriendlyName', String(friendlyBusName));
                    }
                }
            });

            // Now place transformers based on the positions of connected buses
            transformerData.data.forEach((trafo, index) => {
                const [name, std_type, hv_bus_no, lv_bus_no, sn_mva, vn_hv_kv, vn_lv_kv,
                    vk_percent, vkr_percent, pfe_kw, i0_percent, shift_degree,
                    tap_side, tap_neutral, tap_min, tap_max, tap_step_percent,
                    tap_step_degree, tap_pos, tap_phase_shifter, parallel, df, in_service] = trafo;

                // Verify indices are valid before proceeding
                if (hv_bus_no >= busData.data.length || hv_bus_no < 0 ||
                    lv_bus_no >= busData.data.length || lv_bus_no < 0) {
                    console.warn(`Skipping transformer ${index} due to invalid bus indices: hv=${hv_bus_no}, lv=${lv_bus_no}`);
                    return;
                }

                let hv_bus = busData.data[hv_bus_no];
                let hv_bus_name = hv_bus[0];

                let lv_bus = busData.data[lv_bus_no];
                let lv_bus_name = lv_bus[0];

                // Find the vertices for the connected buses
                const hvBusVertex = findVertexByBusId(grafka, parent, hv_bus_name);
                const lvBusVertex = findVertexByBusId(grafka, parent, lv_bus_name);

                if (hvBusVertex && lvBusVertex) {
                    // Orientation follows the buses themselves: stack vertically when
                    // they are separated mostly in y, and rotate when HV is the far side.
                    const hvCx = hvBusVertex.geometry.x + hvBusVertex.geometry.width / 2;
                    const hvCy = hvBusVertex.geometry.y + hvBusVertex.geometry.height / 2;
                    const lvCx = lvBusVertex.geometry.x + lvBusVertex.geometry.width / 2;
                    const lvCy = lvBusVertex.geometry.y + lvBusVertex.geometry.height / 2;
                    const stackVertically = Math.abs(lvCy - hvCy) >= Math.abs(lvCx - hvCx);

                    let trafoStyle;
                    let trafoW;
                    let trafoH;
                    if (stackVertically) {
                        trafoStyle = vertexStyleFromElectrisimSymbol('sym-transformer-v', 'Transformer');
                        [trafoW, trafoH] = vertexSizeFromElectrisimSymbol('sym-transformer-v', 72, 108);
                        if (hvCy > lvCy) trafoStyle += ';rotation=180';
                    } else {
                        trafoStyle = vertexStyleFromElectrisimSymbol('sym-transformer', 'Transformer');
                        [trafoW, trafoH] = vertexSizeFromElectrisimSymbol('sym-transformer', 40, 60);
                        if (hvCx > lvCx) trafoStyle += ';rotation=180';
                    }

                    // Place transformer between busbar centers (palette SVG)
                    const vertexCenterX = (hvCx + lvCx) / 2;
                    const vertexCenterY = (hvCy + lvCy) / 2;

                    const vertex = grafka.insertVertex(
                        parent,
                        null,
                        ``,
                        vertexCenterX - trafoW / 2,
                        vertexCenterY - trafoH / 2,
                        trafoW,
                        trafoH,
                        trafoStyle
                    );

                    // Configure transformer attributes
                    configureTransformerAttributes(grafka, vertex, {
                        name: `${name}`,
                        std_type: `${std_type}`,
                        sn_mva: `${sn_mva}`,
                        vn_hv_kv: `${vn_hv_kv}`,
                        vn_lv_kv: `${vn_lv_kv}`,
                        vk_percent: `${vk_percent}`,
                        vkr_percent: `${vkr_percent}`,
                        pfe_kw: `${pfe_kw}`,
                        i0_percent: `${i0_percent}`,
                        shift_degree: `${shift_degree}`,
                        tap_side: `${tap_side}`,
                        tap_neutral: `${tap_neutral}`,
                        tap_min: `${tap_min}`,
                        tap_max: `${tap_max}`,
                        tap_step_percent: `${tap_step_percent}`,
                        tap_step_degree: `${tap_step_degree}`,
                        tap_pos: `${tap_pos}`,
                        tap_phase_shifter: `${tap_phase_shifter}`,
                        parallel: `${parallel}`,
                        df: `${df}`,
                        in_service: `${in_service}`
                    });

                    elRadialLabel(grafka, vertex, name);

                    // loadFlow falls back to these when the edge walk cannot
                    // resolve the two windings.
                    if (vertex.value && vertex.value.setAttribute) {
                        const hvId = hvBusVertex && hvBusVertex.mxObjectId ? String(hvBusVertex.mxObjectId).replace(/#/g, '_') : '';
                        const lvId = lvBusVertex && lvBusVertex.mxObjectId ? String(lvBusVertex.mxObjectId).replace(/#/g, '_') : '';
                        if (hvId) vertex.value.setAttribute('pp_hv_bus', hvId);
                        if (lvId) vertex.value.setAttribute('pp_lv_bus', lvId);
                    }

                    const switchedBuses = trafoSwitchBusSets.twoW[index];
                    const skipHvEdge = switchedBuses && switchedBuses.has(String(hv_bus_name));
                    const skipLvEdge = switchedBuses && switchedBuses.has(String(lv_bus_name));

                    // Stub out of the winding pin, run clear of the bar, then tap down.
                    [[hvBusVertex, true, skipHvEdge], [lvBusVertex, false, skipLvEdge]]
                        .forEach(([busV, isHvWinding, hasSwitch]) => {
                            // A switched winding connects through its switch; a direct
                            // edge as well drew the breaker bypassed (the transmission
                            // tidy-up removed it again, the radial one did not).
                            if (!busV || !vertex.geometry || hasSwitch) return;
                            const tg = vertex.geometry;
                            const bg = busV.geometry;
                            const cx = tg.x + tg.width / 2;
                            const cy = tg.y + tg.height / 2;
                            const bx = bg.x + bg.width / 2;
                            const by = bg.y + bg.height / 2;
                            const rotated = /rotation=180/.test(String(vertex.style || ''));
                            const vertical = /transformer-v/.test(String(vertex.style || ''));

                            // Decimals rather than 4/90, 86/90 and 30/58: terser keeps the
                            // shorter fraction, and HEAD was minified with these folded.
                            let exitX;
                            let exitY;
                            if (vertical) {
                                exitX = 0.5;
                                exitY = isHvWinding ? 0.044444444444444446 : 0.9555555555555556;
                            } else {
                                exitX = isHvWinding ? 0.044444444444444446 : 0.9555555555555556;
                                exitY = 0.5172413793103449;
                            }

                            let px = tg.x + tg.width * exitX;
                            let py = tg.y + tg.height * exitY;
                            if (rotated) {
                                px = 2 * cx - px;
                                py = 2 * cy - py;
                            }

                            const vx = px - cx;
                            const vy = py - cy;
                            const len = Math.hypot(vx, vy) || 1;
                            const sx = px + (vx / len) * 22;
                            const sy = py + (vy / len) * 22;
                            const yRun = cy < by ? Math.min(sy, by - 36) : Math.max(sy, by + 36);
                            const tapX = Math.max(bg.x + 16, Math.min(bg.x + (bg.width || 260) - 16, sx));
                            const entryX = Math.max(0.08, Math.min(0.92, (tapX - bg.x) / (bg.width || 1)));
                            // A short radial drop is already straight.
                            const points = window._elxxxRadialImport && Math.abs(cy - by) < 48
                                ? []
                                : [new mxPoint(sx, yRun), new mxPoint(tapX, yRun)];

                            const edge = grafka.insertEdge(parent, null, '', vertex, busV,
                                'edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=0;html=1;endArrow=none;'
                                + `exitX=${exitX};exitY=${exitY};exitDx=0;exitDy=0;exitPerimeter=0;`
                                + `entryX=${entryX};entryY=0.5;entryDx=0;entryDy=0;entryPerimeter=0;shapeELXXX=NotEditableLine`);
                            if (!edge || !edge.geometry || typeof mxPoint === 'undefined') return;
                            const geo = edge.geometry.clone();
                            geo.points = points;
                            grafka.getModel().setGeometry(edge, geo);
                        });
                } else {
                    console.warn(`Could not place transformer ${name}: One or both bus vertices not found`, {
                        hv_bus: hv_bus_name,
                        lv_bus: lv_bus_name,
                        hvBusVertex: !!hvBusVertex,
                        lvBusVertex: !!lvBusVertex
                    });
                }
            });

            
            lineData.data.forEach((line, index) => {
                const [name, std_type, from_bus, to_bus, length_km, r_ohm_per_km,
                    x_ohm_per_km, c_nf_per_km, g_us_per_km, max_i_ka, df,
                    parallel, type, in_service] = line;

                // A line can name a bus the import did not place.
                if (!(busData.data[from_bus] && busData.data[to_bus])) return;

                // Get bus data for from and to buses
                const fromBus = busData.data[from_bus];
                const fromBusName = fromBus[0];

                const toBus = busData.data[to_bus];
                const toBusName = toBus[0];

                // Find the vertices for the from and to buses
                const fromBusVertex = findVertexByBusId(grafka, parent, fromBusName);
                const toBusVertex = findVertexByBusId(grafka, parent, toBusName);

                if (fromBusVertex && toBusVertex) {
                    const lineAttr = {
                        name: `${name}`,
                        std_type: `${std_type}`,
                        from_bus: `${from_bus}`,
                        to_bus: `${to_bus}`,
                        length_km: `${length_km}`,
                        r_ohm_per_km: `${r_ohm_per_km}`,
                        x_ohm_per_km: `${x_ohm_per_km}`,
                        c_nf_per_km: `${c_nf_per_km}`,
                        g_us_per_km: `${g_us_per_km}`,
                        max_i_ka: `${max_i_ka}`,
                        df: `${df}`,
                        parallel: `${parallel}`,
                        type: `${type}`,
                        in_service: `${in_service}`,
                        pp_import_from_bus: `${fromBusName}`,
                        pp_import_to_bus: `${toBusName}`,
                    };
                    const useLineVertex =
                        lineNamesNeedingVertex.has(String(name)) ||
                        lineNamesNeedingVertex.has(String(index));
                    if (useLineVertex) {
                        const fc = importBusbarCenterXY(fromBusVertex);
                        const tc = importBusbarCenterXY(toBusVertex);
                        const useVertical = Math.abs(fc.y - tc.y) > Math.abs(fc.x - tc.x);
                        const lvW = useVertical
                            ? IMPORT_LINE_VERTEX_THICKNESS
                            : IMPORT_LINE_VERTEX_LENGTH;
                        const lvH = useVertical
                            ? IMPORT_LINE_VERTEX_LENGTH
                            : IMPORT_LINE_VERTEX_THICKNESS;
                        const lvStyle = useVertical
                            ? IMPORT_LINE_VERTEX_STYLE_VERTICAL
                            : IMPORT_LINE_VERTEX_STYLE_HORIZONTAL;
                        // Radial: hang the line symbol just above the lower bus rather
                        // than halfway up the drop, where it collides with the feeder.
                        const radialDrop = window._elxxxRadialImport && Math.abs(fc.y - tc.y) > 36;
                        const lowerBusC = fc.y <= tc.y ? tc : fc;
                        const mx = radialDrop ? lowerBusC.x - lvW / 2 : (fc.x + tc.x) / 2 - lvW / 2;
                        const my = radialDrop ? lowerBusC.y - 78 - lvH / 2 : (fc.y + tc.y) / 2 - lvH / 2;
                        const lineVertex = grafka.insertVertex(
                            parent,
                            null,
                            ``,
                            mx,
                            my,
                            lvW,
                            lvH,
                            lvStyle,
                        );
                        configureLineAttributes(grafka, lineVertex, lineAttr);
                        const fromC = importBusbarCenterXY(fromBusVertex);
                        const toC = importBusbarCenterXY(toBusVertex);
                        const fromPin = allocateBusPin(
                            fromBusVertex,
                            importBusbarPinXFromPeerX(fromBusVertex, toC.x),
                            toC.y >= fromC.y ? 'below' : 'above',
                        );
                        const toPin = allocateBusPin(
                            toBusVertex,
                            importBusbarPinXFromPeerX(toBusVertex, fromC.x),
                            fromC.y >= toC.y ? 'below' : 'above',
                        );
                        const stubExit = (
                            `edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=${window._elxxxRadialImport ? 0 : 'auto'};html=1;` +
                            `exitX=${fromPin};exitY=${IMPORT_BUSBAR_EDGE_Y};exitDx=0;exitDy=0;exitPerimeter=0;` +
                            `entryX=0.5;entryY=0.5;entryDx=0;entryDy=0;entryPerimeter=0;;shapeELXXX=NotEditableLine`
                        );
                        const stubEntry = (
                            `edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=${window._elxxxRadialImport ? 0 : 'auto'};html=1;` +
                            `exitX=0.5;exitY=0.5;exitDx=0;exitDy=0;exitPerimeter=0;` +
                            `entryX=${toPin};entryY=${IMPORT_BUSBAR_EDGE_Y};entryDx=0;entryDy=0;entryPerimeter=0;;shapeELXXX=NotEditableLine`
                        );
                        const stubEdgeFrom = grafka.insertEdge(parent, null, '', fromBusVertex, lineVertex, stubExit);
                        const stubEdgeTo = grafka.insertEdge(parent, null, '', lineVertex, toBusVertex, stubEntry);

                        if (window._elxxxRadialImport) {
                            [stubEdgeFrom, stubEdgeTo].forEach((ed) => {
                                if (!ed || !ed.geometry) return;
                                const aC = importBusbarCenterXY(ed.source);
                                const bC = importBusbarCenterXY(ed.target);
                                const upper = aC.y <= bC.y ? ed.source : ed.target;
                                const lower = aC.y <= bC.y ? ed.target : ed.source;
                                const pin = importBusbarPinXFromPeerX(upper, importBusbarCenterXY(lower).x);
                                const exitX = aC.y <= bC.y ? pin : 0.5;
                                const entryX = aC.y <= bC.y ? 0.5 : pin;
                                grafka.getModel().setStyle(ed, `edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=0;html=1;endArrow=none;exitX=${exitX};exitY=0.5;exitPerimeter=0;entryX=${entryX};entryY=0.5;entryPerimeter=0;shapeELXXX=NotEditableLine`);
                                const geo = ed.geometry.clone();
                                geo.points = null;
                                grafka.getModel().setGeometry(ed, geo);
                            });

                            // A bus-switch already provides the connection on its side,
                            // so the matching stub would double it up.
                            (switchData.data || []).forEach((row) => {
                                if (!Array.isArray(row) || String(row[3] || 'l') !== 'l') return;
                                const el = String(row[2]);
                                if (el !== String(name) && el !== String(index) && el !== 'Line_' + index) return;
                                const bus = String(row[1]);
                                if ((bus === String(fromBusName) || bus === String(from_bus)) && stubEdgeFrom) {
                                    grafka.getModel().remove(stubEdgeFrom);
                                }
                                if ((bus === String(toBusName) || bus === String(to_bus)) && stubEdgeTo) {
                                    grafka.getModel().remove(stubEdgeTo);
                                }
                            });
                        }
                        importLineVertexByName[String(name)] = lineVertex;
                        importLineVertexByName[String(index)] = lineVertex;
                    } else {
                        const lineStyle = importBusToBusLineEdgeStyle(
                            fromBusVertex,
                            toBusVertex,
                            allocateBusPin,
                        );
                        const edge = grafka.insertEdge(
                            parent,
                            null,
                            name,
                            fromBusVertex,
                            toBusVertex,
                            lineStyle
                        );
                        if (window._elxxxRadialImport && edge && typeof mxPoint !== 'undefined') {
                            const aC = importBusbarCenterXY(fromBusVertex);
                            const bC = importBusbarCenterXY(toBusVertex);
                            if (Math.abs(aC.y - bC.y) > 36) {
                                const geo = edge.geometry.clone();
                                geo.points = null;
                                grafka.getModel().setGeometry(edge, geo);
                                const upper = aC.y <= bC.y ? fromBusVertex : toBusVertex;
                                const lower = aC.y <= bC.y ? toBusVertex : fromBusVertex;
                                const ux = importBusbarPinXFromPeerX(upper, importBusbarCenterXY(lower).x);
                                grafka.getModel().setStyle(edge, `edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=0;html=1;endArrow=none;exitX=${aC.y <= bC.y ? ux : 0.5};exitY=0.5;exitPerimeter=0;entryX=${aC.y <= bC.y ? 0.5 : ux};entryY=0.5;entryPerimeter=0;shapeELXXX=Line`);
                            }
                        }

                        // Large import: send every line through one of eight shared
                        // horizontal lanes, tapping each busbar at a spread-out x.
                        if (window._elxxxLargeImport && edge && fromBusVertex.geometry && toBusVertex.geometry && typeof mxPoint !== 'undefined') {
                            const fromGeo = fromBusVertex.geometry;
                            const toGeo = toBusVertex.geometry;
                            const lane = (window._elxxxOrthoLane = (window._elxxxOrthoLane | 0) + 1) % 8;
                            const dy = toGeo.y - fromGeo.y;
                            const sameRow = Math.abs(dy) < 90;
                            const slot = Math.floor(lane / 2);
                            let laneY;
                            let srcDown;
                            let dstDown;
                            if (sameRow) {
                                laneY = Math.max(fromGeo.y, toGeo.y) + fromGeo.height + 220 + 18 * slot;
                                srcDown = true;
                                dstDown = true;
                            } else if (dy > 0) {
                                laneY = fromGeo.y + fromGeo.height + 220 + 18 * slot;
                                srcDown = true;
                                dstDown = false;
                            } else {
                                laneY = fromGeo.y - 250 - 18 * slot;
                                srcDown = false;
                                dstDown = true;
                            }
                            const tap = (cell, geo, down) => {
                                const key = String(cell.id || '');
                                const map = window._elxxxLineTap || (window._elxxxLineTap = new Map());
                                const n = (map.get(key) || 0) + 1;
                                map.set(key, n);
                                const span = Math.max(40, geo.width - 48);
                                const steps = Math.max(1, Math.floor(span / 22));
                                const x = geo.x + 24 + ((n - 1) % steps) * (span / steps);
                                return {
                                    x,
                                    y: geo.y + geo.height / 2 + (down ? 28 : -28),
                                    fx: Math.max(0.08, Math.min(0.92, (x - geo.x) / (geo.width || 1))),
                                };
                            };
                            const ps = tap(fromBusVertex, fromGeo, srcDown);
                            const pg = tap(toBusVertex, toGeo, dstDown);
                            const geo = edge.geometry.clone();
                            geo.points = [
                                new mxPoint(ps.x, ps.y),
                                new mxPoint(ps.x, laneY),
                                new mxPoint(pg.x, laneY),
                                new mxPoint(pg.x, pg.y),
                            ];
                            grafka.getModel().setGeometry(edge, geo);
                            grafka.getModel().setStyle(edge, `edgeStyle=none;rounded=0;orthogonalLoop=0;jettySize=0;jumpStyle=arc;jumpSize=12;html=1;endArrow=none;noEdgeStyle=1;exitX=${ps.fx};exitY=0.5;exitDx=0;exitDy=0;exitPerimeter=0;entryX=${pg.fx};entryY=0.5;entryDx=0;entryDy=0;entryPerimeter=0;shapeELXXX=Line`);
                        }

                        configureLineAttributes(grafka, edge, lineAttr);
                    }
                } else {
                    console.warn(`Could not create line ${name}: Bus vertices not found`, {
                        from_bus: fromBusName,
                        to_bus: toBusName,
                        fromBusVertex,
                        toBusVertex
                    });
                }
            }); 

            // Pandapower switches: two incident edges (bus–line / bus–trafo / bus–bus) for export + layout.
            // ``verticalSwitchStackPerBusSide`` stacks switches close to the busbar in vertical SLD mode
            // (otherwise t-fraction places them mid-feeder, leaving a long disconnected-looking stub).
            const verticalSwitchStackPerBusSide = new Map();
            // Three-winding transformers are drawn after the switches, so a switch
            // on one cannot reach its transformer yet. Keep the switch here, keyed
            // "row index|bus name", and the transformer wires itself to it.
            const threeWSwitchVertex = new Map();
            (switchData.data || []).forEach((row, si) => {
                if (!Array.isArray(row) || row.length < 8) return;
                const [name, bus_name, element_name, etRaw, closed, type, z_ohm, in_ka] = row;
                const et = String(etRaw || 'l');
                const busVertex = importFindBusVertexByPandapowerRef(grafka, parent, bus_name, busData);
                if (!busVertex) {
                    console.warn(`Could not place switch ${name}: bus "${bus_name}" not found`);
                    return;
                }
                let [swW, swH] = vertexSizeFromElectrisimSymbol('sym-switch', 36, 42);
                let swStyle = vertexStyleFromElectrisimSymbol('sym-switch', 'Switch');
                if (importPandapowerVerticalSld) {
                    [swW, swH] = [swH, swW];
                    swStyle = `${swStyle};rotation=${IMPORT_SLD_VERTICAL_ROTATION}`;
                }

                let peerCell = null;
                if (et === 'l') {
                    peerCell = importFindLineVertexPeer(importLineVertexByName, lineData, element_name);
                } else if (et === 't') {
                    peerCell = importFindTrafoVertexForSwitch(
                        grafka,
                        parent,
                        element_name,
                        transformerData,
                    );
                } else if (et === 'b') {
                    peerCell = importFindBusVertexByPandapowerRef(grafka, parent, element_name, busData);
                }

                const B = importBusbarCenterXY(busVertex);
                let swCx;
                let swCy;
                if (!peerCell) {
                    if (et !== 't3') {
                        console.warn(`Could not place switch ${name}: peer for et=${et} element "${element_name}" not found — using single-bus overlay`);
                    }
                    const bx = busVertex.geometry.x;
                    const by = busVertex.geometry.y;
                    const topLX = bx + IMPORT_BUSBAR_W / 2 - swW / 2 + 48 + (si % 4) * 46;
                    const topLY = by - 60 - Math.floor(si / 4) * 52;
                    swCx = topLX + swW / 2;
                    swCy = topLY + swH / 2;
                } else {
                    let Px;
                    let Py;
                    if (peerCell.edge) {
                        const g = peerCell.geometry;
                        Px = g.x + g.width / 2;
                        Py = g.y + g.height / 2;
                    } else {
                        const g = peerCell.geometry;
                        Px = g.x + g.width / 2;
                        Py = g.y + g.height / 2;
                    }
                    let t = et === 'b' ? 0.5 : 0.34;
                    if (et === 'l') {
                        const lineRow = importResolveLineDataRow(lineData, element_name);
                        if (lineRow) {
                            const [, , fbIdx, tbIdx] = lineRow;
                            // The line may name a bus the import did not place.
                            if (!(busData.data[fbIdx] && busData.data[tbIdx])) return;
                            const fbNm = busData.data[fbIdx][0];
                            const tbNm = busData.data[tbIdx][0];
                            if (String(bus_name) === String(fbNm)
                                || String(bus_name) === String(tbNm)) t = 0.26;
                        }
                    } else if (et === 't' || et === 't3') {
                        t = 0.32;
                    }
                    swCx = B.x + t * (Px - B.x);
                    swCy = B.y + t * (Py - B.y);

                    if (importPandapowerVerticalSld && window._elxxxRadialImport) {
                        if (Math.abs(B.x - Px) <= IMPORT_VERTICAL_COLLINEAR_X_EPS) swCx = Px;
                        const sideKey = `${busVertex.id || ''}|${String(bus_name)}|${Py > B.y ? 'below' : 'above'}`;
                        const stackIdx = verticalSwitchStackPerBusSide.get(sideKey) || 0;
                        verticalSwitchStackPerBusSide.set(sideKey, stackIdx + 1);
                        const sign = Py > B.y ? 1 : -1;
                        const firstCenterOffset = swH / 2 + IMPORT_VERTICAL_SWITCH_GAP_FROM_BUS;
                        const stackStep = swH + IMPORT_VERTICAL_SWITCH_STACK_PADDING;
                        if (Math.abs(Py - B.y) > 40) {
                            // Long drop: sit on the drop itself, fanned by stack index.
                            swCx = Px;
                            swCy = (B.y + Py) / 2 + sign * stackIdx * 16;
                        } else {
                            swCx = B.x;
                            swCy = B.y + sign * (firstCenterOffset + stackIdx * stackStep);
                        }
                    } else if (importPandapowerVerticalSld) {
                        const dx = Px - B.x;
                        const dy = Py - B.y;
                        const dist = Math.hypot(dx, dy);
                        if (dist < 360 && Math.abs(dy) < 150 && Math.abs(dy) > 24) {
                            swCx = Px;
                            swCy = (B.y + Py) / 2;
                        } else if (dist < 360) {
                            swCx = (B.x + Px) / 2;
                            swCy = (B.y + Py) / 2;
                        } else {
                            const frac = Math.min(0.42, t || 0.34);
                            swCx = B.x + frac * dx;
                            swCy = B.y + frac * dy;
                        }
                    }
                }

                const swVertex = grafka.insertVertex(
                    parent,
                    null,
                    ``,
                    swCx - swW / 2,
                    swCy - swH / 2,
                    swW,
                    swH,
                    swStyle,
                );
                const closedBool = closed === true || closed === 'true';
                if (typeof window.configureSwitchAttributes === 'function') {
                    window.configureSwitchAttributes(grafka, swVertex, {
                        name: String(name),
                        et,
                        type: String(type || 'CB'),
                        closed: closedBool,
                        z_ohm: z_ohm != null && z_ohm !== '' ? String(z_ohm) : '0',
                        in_ka: in_ka != null && in_ka === in_ka ? String(in_ka) : '0',
                        pp_import_bus: String(bus_name),
                        pp_import_element: String(element_name),
                    });
                }
                grafka.insertEdge(
                    parent,
                    null,
                    '',
                    busVertex,
                    swVertex,
                    importBusToSwitchEdgeStyle(busVertex, swVertex, importPandapowerVerticalSld),
                );
                if (peerCell) {
                    grafka.insertEdge(
                        parent,
                        null,
                        '',
                        swVertex,
                        peerCell,
                        importSwitchToPeerEdgeStyle(swVertex, peerCell, busVertex, importPandapowerVerticalSld),
                    );
                }
                if (et === 't3') {
                    const ti = importResolveThreeWTrafoRowIndex(element_name, threeWindingTransformerData);
                    if (ti >= 0) {
                        threeWSwitchVertex.set(`${ti}|${importBusNameFromSwitchRow(bus_name, busData)}`,
                            { swVertex, busVertex });
                    }
                }
            });

            externalGridData.data.forEach((externalgrid, index) => {
                const [
                    name, bus_no, vm_pu, va_degree, slack_weight, in_service,
                    s_sc_max_mva, s_sc_min_mva, rx_max, rx_min, r0x0_max, x0x_max, r0x0_min, x0x_min,
                ] = externalgrid;

                let bus = busData.data[bus_no];
                let bus_name = bus[0];

                const busVertex = findVertexByBusId(grafka, parent, bus_name);

                const [egW, egH] = vertexSizeFromElectrisimSymbol('sym-ext-grid', 70, 58);
                const anchorX = busVertex.geometry.x + busVertex.geometry.width / 2;
                const anchorY = busVertex.geometry.y - 90;
                const styleExternalGrid = vertexStyleFromElectrisimSymbol('sym-ext-grid', 'External Grid');

                const vertex = grafka.insertVertex(
                    parent,
                    null,
                    ``,
                    anchorX - egW / 2,
                    anchorY - egH / 2,
                    egW,
                    egH,
                    styleExternalGrid
                );
                configureExternalGridAttributes(grafka, vertex, {                    
                    name: `${name}`,
                    vm_pu: `${vm_pu}`,
                    va_degree: `${va_degree}`,
                    slack_weight: `${slack_weight}`,
                    in_service: `${in_service}`,
                    s_sc_max_mva: s_sc_max_mva,
                    s_sc_min_mva: s_sc_min_mva,
                    rx_max: rx_max,
                    rx_min: rx_min,
                    r0x0_max: r0x0_max,
                    x0x_max: x0x_max,
                    r0x0_min: r0x0_min != null ? r0x0_min : r0x0_max,
                    x0x_min: x0x_min != null ? x0x_min : x0x_max,
                })
                elRadialLabel(grafka, vertex, name);

                const edgeStyle = importDeviceToBusEdgeStyle(vertex, busVertex, allocateBusPin);

                if (busVertex) {
                    grafka.insertEdge(parent, null, "", vertex, busVertex, edgeStyle);
                }

            });
            generatorData.data.forEach((generator, index) => {
                const [name, bus_no, p_mw, vm_pu, sn_mva, min_q_mvar, max_q_mvar, scaling, slack, in_service, slack_weight, type] = generator;

                let bus = busData.data[bus_no];
                let bus_name = bus[0];

                const busVertex = findVertexByBusId(grafka, parent, bus_name);

                const slotKey = busVertex ? String(busVertex.id) : '';
                const nSlot = window._elxxxGenSlot && busVertex
                    ? (window._elxxxGenSlot.get(slotKey) || 0)
                    : 0;
                if (busVertex && window._elxxxGenSlot) window._elxxxGenSlot.set(slotKey, nSlot + 1);
                const generatorOffset = nSlot === 0
                    ? 0
                    : (nSlot % 2 ? 1 : -1) * Math.ceil(nSlot / 2) * 48;

                const [genW, genH] = vertexSizeFromElectrisimSymbol('sym-generator', 45, 45);
                const genLeaf = window._elxxxRadialImport
                    && window._elxxxRadialLeaves
                    && window._elxxxRadialLeaves.has(String(bus_name));
                const anchorX = (window._elxxxRadialImport && !genLeaf)
                    ? busVertex.geometry.x - 150 + generatorOffset
                    : busVertex.geometry.x + busVertex.geometry.width / 2 + generatorOffset;
                const anchorY = genLeaf
                    ? busVertex.geometry.y + (busVertex.geometry.height || 12) + 70
                    : (window._elxxxRadialImport ? busVertex.geometry.y - 70 : busVertex.geometry.y - 130);
                const styleGenerator = vertexStyleFromElectrisimSymbol('sym-generator', 'Generator')
                    .replace('sym-generator.svg', 'sym-generator-down.svg') + ';portConstraint=south';

                const vertex = grafka.insertVertex(
                    parent,
                    null,
                    ``,
                    anchorX - genW / 2,
                    anchorY - genH / 2,
                    genW,
                    genH,
                    styleGenerator
                );
                configureGeneratorAttributes(grafka, vertex, {
                    name: `${name}`,
                    bus_no: `${bus_no}`,
                    p_mw: `${p_mw}`,
                    vm_pu: `${vm_pu}`,
                    sn_mva: `${sn_mva}`,
                    min_q_mvar: `${min_q_mvar}`,
                    max_q_mvar: `${max_q_mvar}`,
                    scaling: `${scaling}`,
                    slack: `${slack}`,
                    in_service: `${in_service}`,
                    slack_weight: `${slack_weight}`,
                    type: `${type}`
                })
                elRadialLabel(grafka, vertex, name);

                if (busVertex) {
                    const mg = vertex.geometry;
                    const bg = busVertex.geometry;
                    const mcx = mg.x + mg.width / 2;
                    const entryX = Math.max(0.05, Math.min(0.95, (mcx - bg.x) / (bg.width || 1)));
                    const dropEdge = grafka.insertEdge(parent, null, "", vertex, busVertex,
                        'edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=0;html=1;endArrow=none;'
                        + `exitX=0.5;exitY=1;exitDx=0;exitDy=0;exitPerimeter=0;`
                        + `entryX=${entryX};entryY=0.5;entryDx=0;entryDy=0;entryPerimeter=0;`
                        + 'jettySize=0;orthogonalLoop=0;shapeELXXX=NotEditableLine');
                    if (dropEdge && dropEdge.geometry) {
                        // Straight down onto the bar — drop any routed waypoints.
                        const geo = dropEdge.geometry.clone();
                        geo.points = null;
                        grafka.getModel().setGeometry(dropEdge, geo);
                    }
                    if (typeof mxPoint !== 'undefined') {
                        const kids = grafka.getChildCells(vertex, true, false);
                        const label = kids && kids.length ? kids[kids.length - 1] : null;
                        if (label && label.geometry) {
                            const geo = label.geometry.clone();
                            geo.offset = new mxPoint(42, 0);
                            grafka.getModel().setGeometry(label, geo);
                        }
                    }
                }

            });
            staticGeneratorData.data.forEach((staticgenerator, index) => {
                const [name, bus_no, p_mw, q_mvar, sn_mva, scaling, in_service, type, current_source] = staticgenerator;

                let bus = busData.data[bus_no];
                let bus_name = bus[0];

                const busVertex = findVertexByBusId(grafka, parent, bus_name);

                const staticGenOffset = 0;
                // A radial import names its machines, so a wind plant can be drawn
                // with turbine symbols rather than the generic static-generator one.
                const sgFriendly = (window._elxxxUfn && (window._elxxxUfn[name] || window._elxxxUfn[bus_name])) || '';
                const isWind = window._elxxxRadialImport && /wind|turbine/i.test(String(sgFriendly) + ' ' + name);
                const sgSymbol = isWind ? 'sym-wind-turbine' : 'sym-static-gen';
                const sgLeaf = window._elxxxRadialImport
                    && window._elxxxRadialLeaves
                    && window._elxxxRadialLeaves.has(String(bus_name));
                const [sgW, sgH] = vertexSizeFromElectrisimSymbol(sgSymbol, isWind ? 58 : 45, isWind ? 58 : 45);
                const anchorX = busVertex.geometry.x + busVertex.geometry.width / 2 + staticGenOffset;
                const belowY = busVertex.geometry.y + (busVertex.geometry.height || 12) + 70;
                const aboveY = busVertex.geometry.y - 200;
                // Above the bus unless its stem would cross another busbar there and
                // the side below is clear - a crossing reads as a connection. Below,
                // it takes the next device slot along the bar, like loads and shunts,
                // so it does not land on a battery or load hung from the same bus.
                const sgBelow = sgLeaf || (stemCrossesBusbar(grafka, parent, busVertex, anchorX, aboveY)
                    && !stemCrossesBusbar(grafka, parent, busVertex, anchorX, belowY));
                const anchorY = sgBelow ? belowY : aboveY;
                const sgX = sgBelow ? anchorX + importDeviceSlotX(busVertex, 64) : anchorX;
                const styleStaticGenerator = (isWind
                    ? vertexStyleFromElectrisimSymbol(sgSymbol, 'Wind Turbine')
                    : vertexStyleFromElectrisimSymbol('sym-static-gen', 'Static Generator')
                        .replace('sym-static-gen.svg', 'sym-static-gen-down.svg'))
                    + (sgBelow ? ';portConstraint=north' : ';portConstraint=south');

                const vertex = grafka.insertVertex(
                    parent,
                    null,
                    ``,
                    sgX - sgW / 2,
                    anchorY - sgH / 2,
                    sgW,
                    sgH,
                    styleStaticGenerator
                );
                configureStaticGeneratorAttributes(grafka, vertex, {
                    name: `${name}`,
                    p_mw: `${p_mw}`,
                    q_mvar: `${q_mvar}`,
                    sn_mva: `${sn_mva}`,
                    scaling: `${scaling}`,
                    in_service: `${in_service}`,
                    type: `${type}`,
                    current_source: `${current_source}`
                })
                elRadialLabel(grafka, vertex, name);

                if (busVertex) {
                    const mg = vertex.geometry;
                    const bg = busVertex.geometry;
                    const mcx = mg.x + mg.width / 2;
                    const entryX = Math.max(0.05, Math.min(0.95, (mcx - bg.x) / (bg.width || 1)));
                    const dropEdge = grafka.insertEdge(parent, null, "", vertex, busVertex,
                        'edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=0;html=1;endArrow=none;'
                        + `exitX=0.5;exitY=${sgBelow ? 0 : 1};exitDx=0;exitDy=0;exitPerimeter=0;`
                        + `entryX=${entryX};entryY=0.5;entryDx=0;entryDy=0;entryPerimeter=0;`
                        + 'jettySize=0;orthogonalLoop=0;shapeELXXX=NotEditableLine');
                    if (dropEdge && dropEdge.geometry) {
                        // Straight down onto the bar — drop any routed waypoints.
                        const geo = dropEdge.geometry.clone();
                        geo.points = null;
                        grafka.getModel().setGeometry(dropEdge, geo);
                    }
                }

            });
            asymmetricStaticGeneratorData.data.forEach((asymmetricstaticgenerator, index) => {
                const [name, bus_no, p_a_mw, q_a_mvar, p_b_mw, q_b_mvar, p_c_mw, q_c_mvar, sn_mva, scaling, in_service, type, current_source] = asymmetricstaticgenerator;

                let bus = busData.data[bus_no];
                let bus_name = bus[0];

                const busVertex = findVertexByBusId(grafka, parent, bus_name);

                const [asgW, asgH] = vertexSizeFromElectrisimSymbol('sym-asym-static-gen', 45, 45);
                const anchorX = busVertex.geometry.x + IMPORT_BUSBAR_W / 2 + 60;
                const anchorY = busVertex.geometry.y + 60;
                const styleAsymmetricStaticGenerator = vertexStyleFromElectrisimSymbol('sym-asym-static-gen', 'Asymmetric Static Generator');

                const vertex = grafka.insertVertex(
                    parent,
                    null,
                    ``,
                    anchorX - asgW / 2,
                    anchorY - asgH / 2,
                    asgW,
                    asgH,
                    styleAsymmetricStaticGenerator
                );
                configureStaticGeneratorAttributes(grafka, vertex, {
                    name: `${name}`,
                    p_a_mw: `${p_a_mw}`,
                    q_a_mvar: `${q_a_mvar}`,
                    p_b_mw: `${p_b_mw}`,
                    q_b_mvar: `${q_b_mvar}`,
                    p_c_mw: `${p_c_mw}`,
                    q_c_mvar: `${q_c_mvar}`,
                    sn_mva: `${sn_mva}`,
                    scaling: `${scaling}`,
                    in_service: `${in_service}`,
                    type: `${type}`,
                    current_source: `${current_source}`
                })

                const edgeStyle = "edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;exitX=0.5;exitY=0;exitDx=0;exitDy=0;exitPerimeter=0;entryX=0.3;entryY=0.5;entryDx=0;entryDy=0;entryPerimeter=0;;shapeELXXX=NotEditableLine";

                if (busVertex) {
                    grafka.insertEdge(parent, null, "", vertex, busVertex, edgeStyle);
                }

            });

            (pvSystemData.data || []).forEach((pvsystem, index) => {
                const [
                    name, bus_no, irradiance, pmpp, temperature, phases, kv,
                    pf, kvar, kva, cutin, cutout, in_service,
                ] = pvsystem;

                const bus = busData.data[bus_no];
                const bus_name = bus[0];
                const busVertex = findVertexByBusId(grafka, parent, bus_name);
                if (!busVertex) {
                    return;
                }

                const pvOffset = index * 48;
                const [pvW, pvH] = vertexSizeFromElectrisimSymbol('sym-pv', 68, 104);
                const anchorX = busVertex.geometry.x + IMPORT_BUSBAR_W / 2 + pvOffset;
                const anchorY = busVertex.geometry.y + 130;
                const stylePVSystem = vertexStyleFromElectrisimSymbol('sym-pv', 'PVSystem');

                const vertex = grafka.insertVertex(
                    parent,
                    null,
                    ``,
                    anchorX - pvW / 2,
                    anchorY - pvH / 2,
                    pvW,
                    pvH,
                    stylePVSystem,
                );

                configurePVSystemAttributes(grafka, vertex, {
                    name: `${name}`,
                    irradiance,
                    pmpp,
                    temperature,
                    phases,
                    kv,
                    pf,
                    kvar,
                    kva,
                    cutin,
                    cutout,
                    in_service,
                });

                const pvEdgeStyle =
                    'edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;' +
                    'exitX=0.5;exitY=1;exitDx=0;exitDy=0;exitPerimeter=0;entryX=0.3;entryY=0.5;entryDx=0;entryDy=0;entryPerimeter=0;;' +
                    'shapeELXXX=NotEditableLine';

                grafka.insertEdge(parent, null, '', vertex, busVertex, pvEdgeStyle);
            });


            /*
            transformerData.data.forEach((trafo, index) => {
                const [name, std_type, hv_bus_no, lv_bus_no, sn_mva, vn_hv_kv, vn_lv_kv,
                    vk_percent, vkr_percent, pfe_kw, i0_percent, shift_degree,
                    tap_side, tap_neutral, tap_min, tap_max, tap_step_percent,
                    tap_step_degree, tap_pos, tap_phase_shifter, parallel, df, in_service] = trafo;

                hv_bus = busData.data[hv_bus_no]
                hv_bus_name = hv_bus[0]

                lv_bus = busData.data[lv_bus_no]
                lv_bus_name = lv_bus[0]

                // Add edges to connect transformer to the HV and LV buses
                const hvBusVertex = findVertexByBusId(grafka, parent, hv_bus_name);
                const lvBusVertex = findVertexByBusId(grafka, parent, lv_bus_name);


                // Calculate positions for the transformer
                //const vertexXHV = hvBusVertex.geometry.x // + (hv_bus_no * 150);  // Position based on hv_bus index
                const vertexX = hvBusVertex.geometry.x + 60//(lv_bus_no * 150);  // Position based on lv_bus index
                const vertexY = lvBusVertex.geometry.y - 120;  // Position between buses


                // Use transformer symbol style
                const trafoStyle = "shapeELXXX=Transformer; verticalLabelPosition=bottom;shadow=0;dashed=0;align=center;html=1;verticalAlign=top;strokeWidth=1;shape=mxgraph.electrical.signal_sources.current_source;";

                // Insert the transformer vertex
                const vertex = grafka.insertVertex(
                    parent,
                    null,
                    ``,
                    vertexX,  // Center between the two buses
                    vertexY,
                    40,  // width
                    60,  // height
                    trafoStyle
                );

                // Configure transformer attributes
                configureTransformerAttributes(grafka, vertex, {
                    name: `${name}`,
                    std_type: `${std_type}`,

                    sn_mva: `${sn_mva}`,
                    vn_hv_kv: `${vn_hv_kv}`,
                    vn_lv_kv: `${vn_lv_kv}`,
                    vk_percent: `${vk_percent}`,
                    vkr_percent: `${vkr_percent}`,
                    pfe_kw: `${pfe_kw}`,
                    i0_percent: `${i0_percent}`,
                    shift_degree: `${shift_degree}`,
                    tap_side: `${tap_side}`,
                    tap_neutral: `${tap_neutral}`,
                    tap_min: `${tap_min}`,
                    tap_max: `${tap_max}`,
                    tap_step_percent: `${tap_step_percent}`,
                    tap_step_degree: `${tap_step_degree}`,
                    tap_pos: `${tap_pos}`,
                    tap_phase_shifter: `${tap_phase_shifter}`,
                    parallel: `${parallel}`,
                    df: `${df}`,
                    in_service: `${in_service}`
                });

                // Create edges connecting transformer to buses
                const edgeStyleHV = "edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;exitX=0.5;exitY=0;exitDx=0;exitDy=0;exitPerimeter=0;entryX=0.3;entryY=0.5;entryDx=0;entryDy=0;entryPerimeter=0;;shapeELXXX=NotEditableLine";
                const edgeStyleLV = "edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;exitX=0.5;exitY=1;exitDx=0;exitDy=0;exitPerimeter=0;entryX=0.4;entryY=0.5;entryDx=0;entryDy=0;entryPerimeter=0;;shapeELXXX=NotEditableLine";

                if (hvBusVertex) {
                    grafka.insertEdge(parent, null, "", vertex, hvBusVertex, edgeStyleHV);
                }

                if (lvBusVertex) {
                    grafka.insertEdge(parent, null, "", vertex, lvBusVertex, edgeStyleLV);
                }
            }); */
            threeWindingTransformerData.data.forEach((threewindingtransformer, index) => {
                const [name, std_type, hv_bus_no, mv_bus_no, lv_bus_no, sn_hv_mva, sn_mv_mva, sn_lv_mva,
                    vn_hv_kv, vn_mv_kv, vn_lv_kv, vk_hv_percent, vk_mv_percent,
                    vk_lv_percent, vkr_hv_percent, vkr_mv_percent, vkr_lv_percent, pfe_kw,
                    i0_percent, shift_mv_degree, tap_side, tap_neutral, tap_min, tap_max, tap_step_percent, tap_step_degree, tap_pos, tap_at_star_point, in_service] = threewindingtransformer;

                let hv_bus = busData.data[hv_bus_no];
                let hv_bus_name = hv_bus[0];

                let mv_bus = busData.data[mv_bus_no];
                let mv_bus_name = mv_bus[0];

                let lv_bus = busData.data[lv_bus_no];
                let lv_bus_name = lv_bus[0];

                // Add edges to connect transformer to the HV and LV buses
                const hvBusVertex = findVertexByBusId(grafka, parent, hv_bus_name);
                const mvBusVertex = findVertexByBusId(grafka, parent, mv_bus_name);
                const lvBusVertex = findVertexByBusId(grafka, parent, lv_bus_name);


                // Calculate positions for the transformer
                //const vertexXHV = hvBusVertex.geometry.x // + (hv_bus_no * 150);  // Position based on hv_bus index
                const vertexCenterX = hvBusVertex.geometry.x + 60;
                const vertexCenterY = lvBusVertex.geometry.y - 120;

                const threewindingtrafoStyleBase = vertexStyleFromElectrisimSymbol('sym-3w-transformer', 'Three Winding Transformer');
                let [twW, twH] = vertexSizeFromElectrisimSymbol('sym-3w-transformer', 40, 60);
                let threewindingtrafoStyle = threewindingtrafoStyleBase;
                if (importPandapowerVerticalSld) {
                    [twW, twH] = [twH, twW];
                    threewindingtrafoStyle = `${threewindingtrafoStyleBase};rotation=${IMPORT_SLD_VERTICAL_ROTATION}`;
                }

                const vertex = grafka.insertVertex(
                    parent,
                    null,
                    ``,
                    vertexCenterX - twW / 2,
                    vertexCenterY - twH / 2,
                    twW,
                    twH,
                    threewindingtrafoStyle
                );

                // The three-winding configurer: the two-winding one used to be called
                // here, which kept none of the 3W ratings, MV voltage or pair
                // impedances and filled in two-winding defaults instead.
                configureThreeWindingTransformerAttributes(grafka, vertex, {
                    name: `${name}`,
                    std_type: `${std_type}`,
                    sn_hv_mva: `${sn_hv_mva}`,
                    sn_mv_mva: `${sn_mv_mva}`,
                    sn_lv_mva: `${sn_lv_mva}`,
                    vn_hv_kv: `${vn_hv_kv}`,
                    vn_mv_kv: `${vn_mv_kv}`,
                    vn_lv_kv: `${vn_lv_kv}`,
                    vk_hv_percent: `${vk_hv_percent}`,
                    vk_mv_percent: `${vk_mv_percent}`,
                    vk_lv_percent: `${vk_lv_percent}`,
                    vkr_hv_percent: `${vkr_hv_percent}`,
                    vkr_mv_percent: `${vkr_mv_percent}`,
                    vkr_lv_percent: `${vkr_lv_percent}`,
                    pfe_kw: `${pfe_kw}`,
                    i0_percent: `${i0_percent}`,
                    shift_mv_degree: `${shift_mv_degree}`,
                    tap_side: `${tap_side}`,
                    tap_neutral: `${tap_neutral}`,
                    tap_min: `${tap_min}`,
                    tap_max: `${tap_max}`,
                    tap_step_percent: `${tap_step_percent}`,
                    tap_step_degree: `${tap_step_degree}`,
                    tap_pos: `${tap_pos}`,
                    tap_at_star_point: `${tap_at_star_point}`,
                    in_service: `${in_service}`
                });

                // Create edges connecting transformer to buses
                const edgeStyleHV = "edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;exitX=0.5;exitY=0;exitDx=0;exitDy=0;exitPerimeter=0;entryX=0.3;entryY=0.5;entryDx=0;entryDy=0;entryPerimeter=0;;shapeELXXX=NotEditableLine";
                const edgeStyleMV = "edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;exitX=0.5;exitY=1;exitDx=0;exitDy=0;exitPerimeter=0;entryX=0.4;entryY=0.5;entryDx=0;entryDy=0;entryPerimeter=0;;shapeELXXX=NotEditableLine";
                const edgeStyleLV = "edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;exitX=0.5;exitY=1;exitDx=0;exitDy=0;exitPerimeter=0;entryX=0.4;entryY=0.5;entryDx=0;entryDy=0;entryPerimeter=0;;shapeELXXX=NotEditableLine";

                const switchedBuses3w = trafoSwitchBusSets.threeW[index];
                // A switched winding connects through its switch instead of
                // straight to the bus - or straight to the bus after all if the
                // switch was never drawn, so no winding is left hanging.
                const viaSwitch = (busName) => {
                    if (!(switchedBuses3w && switchedBuses3w.has(String(busName)))) return false;
                    const sw = threeWSwitchVertex.get(`${index}|${String(busName)}`);
                    if (!sw) return false;
                    grafka.insertEdge(parent, null, '', sw.swVertex, vertex,
                        importSwitchToPeerEdgeStyle(sw.swVertex, vertex, sw.busVertex,
                            importPandapowerVerticalSld));
                    return true;
                };
                const skipHv3 = viaSwitch(hv_bus_name);
                const skipMv3 = viaSwitch(mv_bus_name);
                const skipLv3 = viaSwitch(lv_bus_name);

                if (hvBusVertex && !skipHv3) {
                    grafka.insertEdge(
                        parent,
                        null,
                        '',
                        vertex,
                        hvBusVertex,
                        importPandapowerVerticalSld
                            ? importTrafo3wToBusEdgeStyle(vertex, hvBusVertex, allocateBusPin)
                            : edgeStyleHV,
                    );
                }
                if (mvBusVertex && !skipMv3) {
                    grafka.insertEdge(
                        parent,
                        null,
                        '',
                        vertex,
                        mvBusVertex,
                        importPandapowerVerticalSld
                            ? importTrafo3wToBusEdgeStyle(vertex, mvBusVertex, allocateBusPin)
                            : edgeStyleMV,
                    );
                }
                if (lvBusVertex && !skipLv3) {
                    grafka.insertEdge(
                        parent,
                        null,
                        '',
                        vertex,
                        lvBusVertex,
                        importPandapowerVerticalSld
                            ? importTrafo3wToBusEdgeStyle(vertex, lvBusVertex, allocateBusPin)
                            : edgeStyleLV,
                    );
                }
            });
            shuntReactorData.data.forEach((shuntreactor, index) => {
                const [bus_no, name, q_mvar, p_mw, vn_kv, step, max_step, in_service] = shuntreactor;
                let bus = busData.data[bus_no];
                let bus_name = bus[0];
                const busVertex = findVertexByBusId(grafka, parent, bus_name);
                const asCapacitor = importShuntLooksLikeCapacitor(name, q_mvar);
                const symbolKey = asCapacitor ? 'sym-capacitor' : 'sym-shunt';
                const shapeName = asCapacitor ? 'Capacitor' : 'Shunt Reactor';
                const [shW, shH] = asCapacitor
                    ? vertexSizeFromElectrisimSymbol(symbolKey, 35, 56)
                    : [28, 56];
                const shuntXOffset = importDeviceSlotX(busVertex);
                const sideShunt = window._elxxxRadialSides && window._elxxxRadialSides.has(String(bus_name));
                const anchorX = sideShunt
                    ? busVertex.geometry.x + busVertex.geometry.width + 36
                    : busVertex.geometry.x + busVertex.geometry.width / 2 + shuntXOffset;
                // anchorY is the top edge here, not the centre.
                const anchorY = sideShunt
                    ? busVertex.geometry.y - 8
                    : busVertex.geometry.y + busVertex.geometry.height + 78;
                const styleShuntOrCap = asCapacitor
                    ? vertexStyleFromElectrisimSymbol(symbolKey, shapeName)
                    : 'pointerEvents=1;verticalLabelPosition=bottom;shadow=0;dashed=0;align=center;html=1;verticalAlign=top;shape=mxgraph.electrical.inductors.choke;shapeELXXX=Shunt Reactor';
                const vertex = grafka.insertVertex(
                    parent,
                    null,
                    ``,
                    anchorX - shW / 2,
                    anchorY,
                    shW,
                    shH,
                    styleShuntOrCap
                );
                if (asCapacitor) {
                    // Electrisim Capacitor uses q_mvar > 0; pandapower capacitive shunt is q_mvar < 0.
                    const qAbs = Math.abs(Number(q_mvar));
                    configureCapacitorAttributes(grafka, vertex, {
                        name: `${name}`,
                        q_mvar: `${Number.isFinite(qAbs) ? qAbs : q_mvar}`,
                        vn_kv: `${vn_kv}`,
                        step: `${step}`,
                        max_step: `${max_step}`,
                        in_service: `${in_service}`,
                    });
                } else {
                    configureShuntReactorAttributes(grafka, vertex, {
                        name: `${name}`,
                        q_mvar: `${q_mvar}`,
                        p_mw: `${p_mw}`,
                        vn_kv: `${vn_kv}`,
                        step: `${step}`,
                        max_step: `${max_step}`,
                        in_service: `${in_service}`,
                    });
                }
                if (busVertex && vertex) {
                    const dropEdge = grafka.insertEdge(parent, null, '', vertex, busVertex,
                        importStraightShuntDropStyle(vertex, busVertex));
                    if (dropEdge && dropEdge.geometry && typeof mxPoint !== 'undefined') {
                        // Hold the drop under the device until it is clear of the bar.
                        const geo = dropEdge.geometry.clone();
                        geo.points = [new mxPoint(anchorX, busVertex.geometry.y + busVertex.geometry.height + 28)];
                        grafka.getModel().setGeometry(dropEdge, geo);
                    }
                }
            });
            /*
            capacitorData.data.forEach((capacitor, index) => {
                const [name, bus_no, q_mvar, p_mw, vn_kv, step, max_step, in_service] = capacitor;
                bus = busData.data[bus_no]
                bus_name = bus[0]
                const busVertex = findVertexByBusId(grafka, parent, bus_name);
                const vertexX = busVertex.geometry.x + 60  // Position based on bus index
                const vertexY = busVertex.geometry.y + 60;  // Position below buses
                const styleCapacitor = "pointerEvents=1;verticalLabelPosition=bottom;shadow=0;dashed=0;align=center;html=1;verticalAlign=top;shape=mxgraph.electrical.capacitors.capacitor_4;shapeELXXX=Capacitor"
                const vertex = grafka.insertVertex(
                    parent,
                    null,
                    ``,
                    vertexX,
                    vertexY,
                    30,  // width
                    20,   // height
                    styleCapacitor
                );
                configureCapacitorAttributes(grafka, vertex,{
                    name: `${name}`,                    
                    q_mvar: `${q_mvar}`,
                    p_mw: `${p_mw}`,
                    vn_kv: `${vn_kv}`,
                    step: `${step}`,
                    max_step: `${max_step}`,
                    in_service: `${in_service}`                 
                })
                const edgeStyle = "edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;exitX=0.5;exitY=0;exitDx=0;exitDy=0;exitPerimeter=0;entryX=0.3;entryY=0.5;entryDx=0;entryDy=0;entryPerimeter=0;;shapeELXXX=NotEditableLine";
                if (busVertex) {
                    grafka.insertEdge(parent, null, "", vertex, busVertex, edgeStyle);
                }
            });      */
            loadData.data.forEach((load, index) => {
                const [name, bus_no, p_mw, q_mvar, const_z_percent, const_i_percent, sn_mva, scaling, type] = load;

                let bus = busData.data[bus_no];
                let bus_name = bus[0];

                const busVertex = findVertexByBusId(grafka, parent, bus_name);

                const loadOffset = importDeviceSlotX(busVertex);
                const [ldW, ldH] = vertexSizeFromElectrisimSymbol('sym-load', 30, 20);
                const anchorX = busVertex.geometry.x + busVertex.geometry.width / 2 + loadOffset;
                // anchorY is the top edge here, not the centre.
                const anchorY = busVertex.geometry.y + busVertex.geometry.height + 78;
                const loadStyle = vertexStyleFromElectrisimSymbol('sym-load', 'Load');

                const vertex = grafka.insertVertex(
                    parent,
                    null,
                    ``,
                    anchorX - ldW / 2,
                    anchorY,
                    ldW,
                    ldH,
                    loadStyle
                );
                configureLoadAttributes(grafka, vertex, {
                    name: `${name}`,
                    p_mw: `${p_mw}`,
                    q_mvar: `${q_mvar}`,
                    const_z_percent: `${const_z_percent}`,
                    const_i_percent: `${const_i_percent}`,
                    sn_mva: `${sn_mva}`,
                    scaling: `${scaling}`,
                    type: `${type}`
                })

                if (busVertex && vertex) {
                    const dropEdge = grafka.insertEdge(parent, null, "", vertex, busVertex,
                        importStraightShuntDropStyle(vertex, busVertex));
                    if (dropEdge && dropEdge.geometry && typeof mxPoint !== 'undefined') {
                        // Hold the drop under the device until it is clear of the bar.
                        const geo = dropEdge.geometry.clone();
                        geo.points = [new mxPoint(anchorX, busVertex.geometry.y + busVertex.geometry.height + 28)];
                        grafka.getModel().setGeometry(dropEdge, geo);
                    }
                }
            });
            asymmetricLoadData.data.forEach((asymmetricload, index) => {
                const [name, bus_no, p_a_mw, q_a_mvar, p_b_mw, q_b_mvar, p_c_mw, q_c_mvar, sn_mva, scaling, in_service, type] = asymmetricload;

                let bus = busData.data[bus_no];
                let bus_name = bus[0];

                const busVertex = findVertexByBusId(grafka, parent, bus_name);

                const [alW, alH] = vertexSizeFromElectrisimSymbol('sym-asym-load', 30, 20);
                const anchorX = busVertex.geometry.x + IMPORT_BUSBAR_W / 2 + 60;
                const anchorY = busVertex.geometry.y + 60;
                const asymmetricloadStyle = vertexStyleFromElectrisimSymbol('sym-asym-load', 'Asymmetric Load');

                const vertex = grafka.insertVertex(
                    parent,
                    null,
                    ``,
                    anchorX - alW / 2,
                    anchorY - alH / 2,
                    alW,
                    alH,
                    asymmetricloadStyle
                );
                configureAsymmetricLoadAttributes(grafka, vertex, {
                    name: `${name}`,
                    p_a_mw: `${p_a_mw}`,
                    q_a_mvar: `${q_a_mvar}`,
                    p_b_mw: `${p_b_mw}`,
                    q_b_mvar: `${q_b_mvar}`,
                    p_c_mw: `${p_c_mw}`,
                    q_c_mvar: `${q_c_mvar}`,
                    sn_mva: `${sn_mva}`,
                    scaling: `${scaling}`,
                    in_service: `${in_service}`,
                    type: `${type}`
                })

                const edgeStyle = "edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;exitX=0.5;exitY=0;exitDx=0;exitDy=0;exitPerimeter=0;entryX=0.3;entryY=0.5;entryDx=0;entryDy=0;entryPerimeter=0;;shapeELXXX=NotEditableLine";

                if (busVertex) {
                    grafka.insertEdge(parent, null, "", vertex, busVertex, edgeStyle);
                }
            }
            );
            impedanceData.data.forEach((impedance, index) => {
                const [name, from_bus_no, to_bus_no, rft_pu, xft_pu, rtf_pu, xtf_pu, sn_mva, in_service] = impedance;
                // Get bus data for from and to buses
                const fromBus = busData.data[from_bus_no];
                const fromBusName = fromBus[0];
                const toBus = busData.data[to_bus_no];
                const toBusName = toBus[0];

                // Find the vertices for the from and to buses
                const fromBusVertex = findVertexByBusId(grafka, parent, fromBusName);
                const toBusVertex = findVertexByBusId(grafka, parent, toBusName);


                if (fromBusVertex && toBusVertex) {
                    let impedanceStyle = "pointerEvents=1;verticalLabelPosition=bottom;shadow=0;dashed=0;align=center;html=1;verticalAlign=top;shape=mxgraph.electrical.miscellaneous.impedance;shapeELXXX=Impedance";

                    // Insert the edge for the line
                    const edge = grafka.insertEdge(
                        parent,
                        null,
                        name,
                        fromBusVertex,
                        toBusVertex,
                        impedanceStyle
                    );
                    // Configure line attributes
                    configureImpedanceAttributes(grafka, edge, {
                        name: `${name}`,
                        from_bus: `${from_bus_no}`,
                        to_bus: `${to_bus_no}`,
                        rft_pu: `${rft_pu}`,
                        xft_pu: `${xft_pu}`,
                        rtf_pu: `${rtf_pu}`,
                        xtf_pu: `${xtf_pu}`,
                        sn_mva: `${sn_mva}`,
                        in_service: `${in_service}`,
                    });
                } else {
                    console.warn(`Could not create impedance ${name}: Bus vertices not found`, {
                        from_bus: fromBusName,
                        to_bus: toBusName,
                        fromBusVertex,
                        toBusVertex
                    });
                }
            });
            wardData.data.forEach((ward, index) => {
                const [name, bus_no, ps_mw, qs_mvar, qz_mvar, pz_mw, in_service] = ward;
                let bus = busData.data[bus_no];
                let bus_name = bus[0];
                const busVertex = findVertexByBusId(grafka, parent, bus_name);
                const [wW, wH] = vertexSizeFromElectrisimSymbol('sym-ward', 30, 20);
                const anchorX = busVertex.geometry.x + IMPORT_BUSBAR_W / 2 + 60;
                const anchorY = busVertex.geometry.y + 60;
                const styleWard = vertexStyleFromElectrisimSymbol('sym-ward', 'Ward');
                const vertex = grafka.insertVertex(
                    parent,
                    null,
                    ``,
                    anchorX - wW / 2,
                    anchorY - wH / 2,
                    wW,
                    wH,
                    styleWard
                );
                configureWardAttributes(grafka, vertex, {
                    name: `${name}`,
                    ps_mw: `${ps_mw}`,
                    qs_mvar: `${qs_mvar}`,
                    qz_mvar: `${qz_mvar}`,
                    pz_mw: `${pz_mw}`,
                    in_service: `${in_service}`
                })
                const edgeStyle = "edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;exitX=0.5;exitY=0;exitDx=0;exitDy=0;exitPerimeter=0;entryX=0.3;entryY=0.5;entryDx=0;entryDy=0;entryPerimeter=0;;shapeELXXX=NotEditableLine";
                if (busVertex) {
                    grafka.insertEdge(parent, null, "", vertex, busVertex, edgeStyle);
                }
            });
            extendedWardData.data.forEach((extendedward, index) => {
                const [name, bus_no, ps_mw, qs_mvar, qz_mvar, pz_mw, r_ohm, x_ohm, vm_pu, slack_weight, in_service] = extendedward;
                let bus = busData.data[bus_no];
                let bus_name = bus[0];
                const busVertex = findVertexByBusId(grafka, parent, bus_name);
                const [ewW, ewH] = vertexSizeFromElectrisimSymbol('sym-ext-ward', 30, 20);
                const anchorX = busVertex.geometry.x + IMPORT_BUSBAR_W / 2 + 60;
                const anchorY = busVertex.geometry.y + 60;
                const styleExtendedWard = vertexStyleFromElectrisimSymbol('sym-ext-ward', 'Extended Ward');
                const vertex = grafka.insertVertex(
                    parent,
                    null,
                    ``,
                    anchorX - ewW / 2,
                    anchorY - ewH / 2,
                    ewW,
                    ewH,
                    styleExtendedWard
                );
                configureExtendedWardAttributes(grafka, vertex, {
                    name: `${name}`,
                    ps_mw: `${ps_mw}`,
                    qs_mvar: `${qs_mvar}`,
                    qz_mvar: `${qz_mvar}`,
                    pz_mw: `${pz_mw}`,
                    r_ohm: `${r_ohm}`,
                    x_ohm: `${x_ohm}`,
                    vm_pu: `${vm_pu}`,
                    slack_weight: `${slack_weight}`,
                    in_service: `${in_service}`
                })
                const edgeStyle = "edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;exitX=0.5;exitY=0;exitDx=0;exitDy=0;exitPerimeter=0;entryX=0.3;entryY=0.5;entryDx=0;entryDy=0;entryPerimeter=0;;shapeELXXX=NotEditableLine";
                if (busVertex) {
                    grafka.insertEdge(parent, null, "", vertex, busVertex, edgeStyle);
                }
            });
            motorData.data.forEach((motor, index) => {
                const [name, bus_no, pn_mech_mw, loading_percent, cos_phi, cos_phi_n, efficiency_percent, efficiency_n_percent, lrc_pu, vn_kv, scaling, in_service, rx] = motor;
                let bus = busData.data[bus_no];
                let bus_name = bus[0];
                const busVertex = findVertexByBusId(grafka, parent, bus_name);
                const [mW, mH] = vertexSizeFromElectrisimSymbol('sym-motor', 30, 20);
                const anchorX = busVertex.geometry.x + IMPORT_BUSBAR_W / 2 + 60;
                const anchorY = busVertex.geometry.y + 60;
                const styleMotor = vertexStyleFromElectrisimSymbol('sym-motor', 'Motor');
                const vertex = grafka.insertVertex(
                    parent,
                    null,
                    ``,
                    anchorX - mW / 2,
                    anchorY - mH / 2,
                    mW,
                    mH,
                    styleMotor
                );
                configureMotorAttributes(grafka, vertex, {
                    name: `${name}`,
                    bus_no: `${bus_no}`,
                    pn_mech_mw: `${pn_mech_mw}`,
                    loading_percent: `${loading_percent}`,
                    cos_phi: `${cos_phi}`,
                    cos_phi_n: `${cos_phi_n}`,
                    efficiency_percent: `${efficiency_percent}`,
                    efficiency_n_percent: `${efficiency_n_percent}`,
                    lrc_pu: `${lrc_pu}`,
                    vn_kv: `${vn_kv}`,
                    scaling: `${scaling}`,
                    in_service: `${in_service}`,
                    rx: `${rx}`

                })
                const edgeStyle = "edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;exitX=0.5;exitY=0;exitDx=0;exitDy=0;exitPerimeter=0;entryX=0.3;entryY=0.5;entryDx=0;entryDy=0;entryPerimeter=0;;shapeELXXX=NotEditableLine";
                if (busVertex) {
                    grafka.insertEdge(parent, null, "", vertex, busVertex, edgeStyle);
                }
            });
            storageData.data.forEach((storage, index) => {
                const [name, bus_no, p_mw, q_mvar, sn_mva, soc_percent, min_e_mwh, max_e_mwh, scaling, in_service, type] = storage;
                let bus = busData.data[bus_no];
                let bus_name = bus[0];
                const busVertex = findVertexByBusId(grafka, parent, bus_name);
                const [stW, stH] = vertexSizeFromElectrisimSymbol('sym-storage', 30, 20);
                const stSide = window._elxxxRadialSides && window._elxxxRadialSides.has(String(bus_name));
                const anchorX = stSide
                    ? busVertex.geometry.x + busVertex.geometry.width + 100
                    : (window._elxxxRadialImport
                        // Hung under the bus: the next device slot, not the centre a
                        // generator may already hold.
                        ? busVertex.geometry.x + busVertex.geometry.width / 2 + importDeviceSlotX(busVertex, 64)
                        : busVertex.geometry.x + IMPORT_BUSBAR_W / 2 + 60);
                const anchorY = stSide
                    ? busVertex.geometry.y - 6
                    : (window._elxxxRadialImport
                        ? busVertex.geometry.y + (busVertex.geometry.height || 12) + 80
                        : busVertex.geometry.y + 60);
                const styleStorage = vertexStyleFromElectrisimSymbol('sym-storage', 'Storage');
                const vertex = grafka.insertVertex(
                    parent,
                    null,
                    ``,
                    anchorX - stW / 2,
                    anchorY - stH / 2,
                    stW,
                    stH,
                    styleStorage
                );
                configureStorageAttributes(grafka, vertex, {
                    name: `${name}`,
                    bus_no: `${bus_no}`,
                    p_mw: `${p_mw}`,
                    q_mvar: `${q_mvar}`,
                    sn_mva: `${sn_mva}`,
                    soc_percent: `${soc_percent}`,
                    min_e_mwh: `${min_e_mwh}`,
                    max_e_mwh: `${max_e_mwh}`,
                    scaling: `${scaling}`,
                    in_service: `${in_service}`,
                    type: `${type}`

                })
                elRadialLabel(grafka, vertex, name);
                const edgeStyle = "edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;exitX=0.5;exitY=0;exitDx=0;exitDy=0;exitPerimeter=0;entryX=0.3;entryY=0.5;entryDx=0;entryDy=0;entryPerimeter=0;;shapeELXXX=NotEditableLine";
                if (busVertex) {
                    grafka.insertEdge(parent, null, "", vertex, busVertex, edgeStyle);
                }
            });
            const insertOpenDssControl = (shape, label, xOffset, configure, values) => {
                const vertex = grafka.insertVertex(
                    parent, null, label, x + xOffset, y - 80, 130, 36,
                    `rounded=1;whiteSpace=wrap;html=1;fillColor=#f3f6fc;strokeColor=#5f6368;shapeELXXX=${shape}`
                );
                configure(grafka, vertex, values);
            };
            (regControlData.data || []).forEach((row, index) => {
                const [name, transformer, winding, vreg, band, ptratio, ctprim, delaying, enabled] = row;
                insertOpenDssControl('RegControl', name || 'RegControl', index * 145,
                    window.configureRegControlAttributes, { name, transformer, winding, vreg, band, ptratio, ctprim, delaying, enabled: String(enabled).toLowerCase() !== 'no' });
            });
            (capControlData.data || []).forEach((row, index) => {
                const [name, capacitor, type, on_setting, off_setting, ctratio, ptratio, delay, enabled] = row;
                insertOpenDssControl('CapControl', name || 'CapControl', 450 + index * 145,
                    window.configureCapControlAttributes, { name, capacitor, type, on_setting, off_setting, ctratio, ptratio, delay, enabled: String(enabled).toLowerCase() !== 'no' });
            });
            (storageControllerData.data || []).forEach((row, index) => {
                const [name, elementList, element, mode, kwtarget, pct_reserve, enabled] = row;
                insertOpenDssControl('StorageController', name || 'StorageController', 900 + index * 145,
                    window.configureStorageControllerAttributes, { name, element: elementList || element, mode, kwtarget, pct_reserve, enabled: String(enabled).toLowerCase() !== 'no' });
            });
            svcData.data.forEach((svc, index) => {
                const [name, bus_no, x_l_ohm, x_cvar_ohm, set_vm_pu, thyristor_firing_angle_degree, controllable, in_service, min_angle_degree, max_angle_degree, type] = svc;
                let bus = busData.data[bus_no];
                let bus_name = bus[0];
                const busVertex = findVertexByBusId(grafka, parent, bus_name);
                const [svcW, svcH] = vertexSizeFromElectrisimSymbol('sym-svc', 30, 20);
                const anchorX = busVertex.geometry.x + IMPORT_BUSBAR_W / 2 + 60;
                const anchorY = busVertex.geometry.y + 60;
                const styleSVC = vertexStyleFromElectrisimSymbol('sym-svc', 'SVC');
                const vertex = grafka.insertVertex(
                    parent,
                    null,
                    ``,
                    anchorX - svcW / 2,
                    anchorY - svcH / 2,
                    svcW,
                    svcH,
                    styleSVC
                );
                configureSVCAttributes(grafka, vertex, {
                    name: `${name}`,
                    bus_no: `${bus_no}`,
                    x_l_ohm: `${x_l_ohm}`,
                    x_cvar_ohm: `${x_cvar_ohm}`,
                    set_vm_pu: `${set_vm_pu}`,
                    thyristor_firing_angle_degree: `${thyristor_firing_angle_degree}`,
                    controllable: `${controllable}`,
                    in_service: `${in_service}`,
                    min_angle_degree: `${min_angle_degree}`,
                    max_angle_degree: `${max_angle_degree}`,
                    type: `${type}`

                })
                const edgeStyle = "edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;exitX=0.5;exitY=0;exitDx=0;exitDy=0;exitPerimeter=0;entryX=0.3;entryY=0.5;entryDx=0;entryDy=0;entryPerimeter=0;;shapeELXXX=NotEditableLine";
                if (busVertex) {
                    grafka.insertEdge(parent, null, "", vertex, busVertex, edgeStyle);
                }
            });
            tcscData.data.forEach((tcsc, index) => {
                const [name, from_bus_no, to_bus_no, x_l_ohm, x_cvar_ohm, set_p_to_mw,
                    thyristor_firing_angle_degree, controllable, in_service] = tcsc;
                let from_bus = busData.data[from_bus_no];
                let from_bus_name = from_bus[0];

                let to_bus = busData.data[to_bus_no];
                let to_bus_name = to_bus[0];

                const hvBusVertex = findVertexByBusId(grafka, parent, from_bus_name);
                const lvBusVertex = findVertexByBusId(grafka, parent, to_bus_name);

                const hvCx = hvBusVertex.geometry.x + IMPORT_BUSBAR_W / 2;
                const lvCx = lvBusVertex.geometry.x + IMPORT_BUSBAR_W / 2;
                const vertexCenterX = (hvCx + lvCx) / 2;
                const vertexCenterY = (hvBusVertex.geometry.y + lvBusVertex.geometry.y) / 2 - 40;

                const tcscStyle = vertexStyleFromElectrisimSymbol('sym-tcsc', 'TCSC');
                const [tcscW, tcscH] = vertexSizeFromElectrisimSymbol('sym-tcsc', 40, 60);

                const vertex = grafka.insertVertex(
                    parent,
                    null,
                    ``,
                    vertexCenterX - tcscW / 2,
                    vertexCenterY - tcscH / 2,
                    tcscW,
                    tcscH,
                    tcscStyle
                );

                // Configure transformer attributes
                configureTCSCAttributes(grafka, vertex, {
                    name: `${name}`,
                    from_bus_no: `${from_bus_no}`,
                    to_bus_no: `${to_bus_no}`,
                    x_l_ohm: `${x_l_ohm}`,
                    x_cvar_ohm: `${x_cvar_ohm}`,
                    set_p_to_mw: `${set_p_to_mw}`,
                    thyristor_firing_angle_degree: `${thyristor_firing_angle_degree}`,
                    controllable: `${controllable}`,
                    in_service: `${in_service}`
                });

                // Create edges connecting transformer to buses
                const edgeStyleHV = "edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;exitX=0.5;exitY=0;exitDx=0;exitDy=0;exitPerimeter=0;entryX=0.3;entryY=0.5;entryDx=0;entryDy=0;entryPerimeter=0;;shapeELXXX=NotEditableLine";
                const edgeStyleLV = "edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;exitX=0.5;exitY=1;exitDx=0;exitDy=0;exitPerimeter=0;entryX=0.4;entryY=0.5;entryDx=0;entryDy=0;entryPerimeter=0;;shapeELXXX=NotEditableLine";

                if (hvBusVertex) {
                    grafka.insertEdge(parent, null, "", vertex, hvBusVertex, edgeStyleHV);
                }

                if (lvBusVertex) {
                    grafka.insertEdge(parent, null, "", vertex, lvBusVertex, edgeStyleLV);
                }
            });

            //ssc to be added

            dcLineData.data.forEach((dcline, index) => {
                const [name, from_bus, to_bus, p_mw, loss_percent,
                    loss_mw, vm_from_pu, vm_to_pu, max_p_mw, min_q_from_mvar,
                    min_q_to_mvar, max_q_from_mvar, max_q_to_mvar, in_service] = dcline;

                // Get bus data for from and to buses
                const fromBus = busData.data[from_bus];
                const fromBusName = fromBus[0];

                const toBus = busData.data[to_bus];
                const toBusName = toBus[0];

                // Find the vertices for the from and to buses
                const fromBusVertex = findVertexByBusId(grafka, parent, fromBusName);
                const toBusVertex = findVertexByBusId(grafka, parent, toBusName);

                if (fromBusVertex && toBusVertex) {
                    // Define line style based on type (cs for cable, ol for overhead line)


                    let dclineStyle = "shapeELXXX=DC Line;text;html=1;strokeColor=black;fillColor=white;overflow=fill;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;";


                    // Insert the edge for the line
                    const edge = grafka.insertEdge(
                        parent,
                        null,
                        name,
                        fromBusVertex,
                        toBusVertex,
                        dclineStyle
                    );

                    // Configure line attributes
                    configureDCLineAttributes(grafka, edge, {
                        name: `${name}`,
                        from_bus: `${from_bus}`,
                        to_bus: `${to_bus}`,
                        p_mw: `${p_mw}`,
                        loss_percent: `${loss_percent}`,
                        loss_mw: `${loss_mw}`,
                        vm_from_pu: `${vm_from_pu}`,
                        vm_to_pu: `${vm_to_pu}`,
                        max_p_mw: `${max_p_mw}`,
                        min_q_from_mvar: `${min_q_from_mvar}`,
                        min_q_to_mvar: `${min_q_to_mvar}`,
                        max_q_from_mvar: `${max_q_from_mvar}`,
                        max_q_to_mvar: `${max_q_to_mvar}`,
                        in_service: `${in_service}`

                    });
                } else {
                    console.warn(`Could not create line ${name}: Bus vertices not found`, {
                        from_bus: fromBusName,
                        to_bus: toBusName,
                        fromBusVertex,
                        toBusVertex
                    });
                }
            });

        if (typeof mxPoint !== 'undefined') {
            // Boxes to avoid, padded a little beyond the symbol itself.
            const machineBoxes = [];
            grafka.getChildCells(parent, true, false).forEach((cell) => {
                if (!cell || cell.edge || !cell.geometry || !cell.style
                    || !/shapeELXXX=Generator|shapeELXXX=Static Generator/.test(cell.style)) return;
                const g = cell.geometry;
                machineBoxes.push({ cell, x: g.x - 14, y: g.y - 14, w: g.width + 28, h: g.height + 28 });
            });

            if (machineBoxes.length) {
                grafka.getChildCells(parent, false, true).forEach((edge) => {
                    // An edge that belongs to a machine is meant to touch it.
                    if (!edge || !edge.geometry || /NotEditableLine/.test(edge.style || '')
                        || machineBoxes.some((b) => edge.source === b.cell || edge.target === b.cell)) return;

                    const style = edge.style || '';
                    const frac = (key, fallback) => {
                        const m = new RegExp(key + '=([0-9.]+)').exec(style);
                        return m ? parseFloat(m[1]) : fallback;
                    };
                    const pointAt = (cell, fx, fy) => (cell && cell.geometry
                        ? { x: cell.geometry.x + cell.geometry.width * fx, y: cell.geometry.y + cell.geometry.height * fy }
                        : null);
                    const src = pointAt(edge.source, frac('exitX', 0.5), frac('exitY', 0.5));
                    const dst = pointAt(edge.target, frac('entryX', 0.5), frac('entryY', 0.5));
                    if (!src || !dst) return;

                    const pts = [src].concat(edge.geometry.points || [], [dst]);
                    const out = [src];
                    let changed = false;
                    for (let i = 0; i < pts.length - 1; i++) {
                        const a = pts[i];
                        const b = pts[i + 1];
                        // Only vertical runs are detoured.
                        if (Math.abs(a.x - b.x) < 4) {
                            const x = (a.x + b.x) / 2;
                            const top = Math.min(a.y, b.y);
                            const bottom = Math.max(a.y, b.y);
                            const hit = machineBoxes.find((box) =>
                                x > box.x && x < box.x + box.w && bottom > box.y && top < box.y + box.h);
                            if (hit) {
                                const sideX = x - hit.x < hit.w / 2 ? hit.x - 16 : hit.x + hit.w + 16;
                                const aboveY = hit.y - 12;
                                const belowY = hit.y + hit.h + 12;
                                if (a.y <= b.y) {
                                    out.push(new mxPoint(x, aboveY), new mxPoint(sideX, aboveY),
                                        new mxPoint(sideX, belowY), new mxPoint(x, belowY));
                                } else {
                                    out.push(new mxPoint(x, belowY), new mxPoint(sideX, belowY),
                                        new mxPoint(sideX, aboveY), new mxPoint(x, aboveY));
                                }
                                changed = true;
                            }
                        }
                        out.push(b);
                    }

                    if (changed) {
                        const geo = edge.geometry.clone();
                        geo.points = out.slice(1, -1);
                        grafka.getModel().setGeometry(edge, geo);
                        const next = String(edge.style || '').replace(/edgeStyle=[^;]*/, 'edgeStyle=orthogonalEdgeStyle');
                        grafka.getModel().setStyle(edge, /edgeStyle=/.test(next) ? next : 'edgeStyle=orthogonalEdgeStyle;' + next);
                    }
                });
            }
        }
        } catch (error) {
            console.error('Error during vertex insertion:', error);
        } finally {
            grafka._elxxxSkipPlaceholders = false;
            window._elxxxLargeImport = false;
            window._elxxxOrthoLane = 0;
            window._elxxxGenSlot = new Map();
            window._elxxxDevSlot = new Map();
            window._elxxxLineTap = new Map();
            window._elxxxTrafoTap = new Map();
            try {
                elRadialStraighten(grafka, parent);
                elRadialFixSwitchLinks(grafka, parent);
                elTransmissionFixCouplers(grafka, parent);
                elTransmissionFixLineSwitches(grafka, parent);
                elTransmissionFixTrafoSwitches(grafka, parent);
            } catch (_rt) { /* layout tidy-up must never block the import */ }
            try {
                // The spec's DC and microgrid layer (/build-model's electrisim_elements),
                // drawn before the layout below so it is laid out with the AC network:
                // drawn after, in a band of its own, its converters hung far from
                // their AC buses and its DC lines ran along its bars.
                const layer = safeJsonParse(data?._object?.electrisim_elements?._object);
                if (layer && !Array.isArray(layer) && (layer.elements?.length || layer.load_profiles)) {
                    parent._elBusByName = null;
                    elDrawElectrisimLayer(grafka, parent, layer, name => findVertexByBusId(grafka, parent, name));
                }
            } catch (_layerErr) {
                console.error('Drawing the DC and microgrid layer failed', _layerErr);
            }
            if (grafka._elxxxRelayoutSld) {
                grafka._elxxxRelayoutSld = false;
                try {
                    // Every bus has its place now, including any the radial
                    // layout could not reach.
                    if (elRelayoutSld(grafka, parent)) window._elxxxRadialUnplaced = [];
                } catch (_lay) {
                    console.warn('Single-line layout failed; keeping the import layout', _lay);
                }
            }
            try {
                // The sidecar belongs to the model being imported; globalPandaPowerData
                // only ever holds the bundled example network.
                const sidecarModel = data?._object ? data : globalPandaPowerData;
                if (sidecarModel) elApplySidecar(grafka, sidecarModel);
            } catch (_scErr) {
                console.warn('Sidecar apply failed', _scErr);
            }
            grafka.getModel().endUpdate();
        }

        //this.drop(grafka, a, target, x, y);

    }


// Debounced version of useDataToInsertOnGraph
function useDataToInsertOnGraph(grafka, a, target, point) {
    waitForData().then(data => {
        debouncedComponentInsertion(grafka, a, target, point, data);
    });
}