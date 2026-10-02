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
        model.setStyle(ed, `edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=0;html=1;endArrow=none;exitX=${ex};exitY=${ey};exitDx=0;exitDy=0;exitPerimeter=0;entryX=${nx};entryY=${ny};entryDx=0;entryDy=0;entryPerimeter=0;shapeELXXX=NotEditableLine`);
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

