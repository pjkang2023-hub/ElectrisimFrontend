// Transformer HV/LV bus resolution.
//
// Reproduced from the committed HEAD bytes: commit 25edf9cb wrote this straight
// into the minified file, keeping full identifier names, so this IS the source
// rather than a reconstruction of it. Only `!0`/`!1` have been spelled out.
//
// It resolves each transformer's two buses by, in order: the payload's own
// hv_bus/lv_bus, the cell's pp_hv_bus/pp_lv_bus attributes, getTransformerConnections,
// an edge walk that hops through non-bus neighbours, and finally nearest-geometry
// matching on rated voltage. Then it orders them so hv is the higher kV side.
const updateTransformerBusConnections = (transformers, busbars, graph) => {
    let alerted = false;
    const keyOf = v => v == null ? "" : String(v);
    const findBus = (key, cellRef) => {
        const k = keyOf(key);
        if (k && k !== "undefined") {
            const hit = busbars.find(b => keyOf(b.name) === k || keyOf(b.id) === k || keyOf(b.userFriendlyName) === k);
            if (hit) return hit;
        }
        if (!cellRef) return null;
        const oid = cellRef.mxObjectId ? String(cellRef.mxObjectId).replace(/#/g, "_") : "";
        return busbars.find(b => b.id != null && b.id === cellRef.id || oid && b.name === oid) || null;
    };
    return transformers.map(transformer => {
        const label = transformer.userFriendlyName || transformer.name || transformer.id;
        try {
            const cell = graph.getModel().getCell(transformer.id);
            if (!cell) throw new Error("the transformer cell is not on the diagram");
            try {
                const style = graph.getModel().getStyle(cell);
                if (style && typeof mxUtils !== "undefined" && typeof mxConstants !== "undefined") {
                    const next = mxUtils.setStyle(style, mxConstants.STYLE_STROKECOLOR, "black");
                    if (next) graph.setCellStyle(next, [ cell ]);
                }
            } catch (styleErr) {
                console.warn("Could not restyle transformer " + label, styleErr);
            }
            const attrOf = name => {
                const a = cell.value && cell.value.attributes;
                if (!a) return "";
                for (let i = 0; i < a.length; i++) if (a[i].nodeName === name) return a[i].nodeValue || "";
                return "";
            };
            let hv = findBus(transformer.hv_bus, null), lv = findBus(transformer.lv_bus, null);
            if (!hv) hv = findBus(attrOf("pp_hv_bus"), null);
            if (!lv) lv = findBus(attrOf("pp_lv_bus"), null);
            if ((!hv || !lv) && typeof getTransformerConnections === "function") {
                const conn = getTransformerConnections(cell, true);
                if (!hv) hv = findBus(conn && conn.hv_bus, conn && conn.hv_cell);
                if (!lv) lv = findBus(conn && conn.lv_bus, conn && conn.lv_cell);
            }
            if (!hv || !lv) {
                const model = graph.getModel();
                const raw = (model.getEdges ? model.getEdges(cell) : []) || [];
                const styleOf = v => String((model.getStyle ? model.getStyle(v) : v && v.style) || "");
                const busCell = v => {
                    if (!v || v.edge) return false;
                    const s = styleOf(v);
                    if (s.includes("transmission.busbar")) return true;
                    const m = s.match(/shapeELXXX=([^;]+)/);
                    return !!(m && (m[1] === "Bus" || m[1] === "Busbar"));
                };
                const otherOf = ed => {
                    const s = model.getTerminal ? model.getTerminal(ed, true) : ed.source;
                    const g = model.getTerminal ? model.getTerminal(ed, false) : ed.target;
                    if (s && s !== cell) return s;
                    if (g && g !== cell) return g;
                    return null;
                };
                const seen = new Set;
                const found = [];
                const take = v => {
                    if (!v || seen.has(v.id)) return;
                    let b = busCell(v) ? v : v.parent && busCell(v.parent) ? v.parent : null;
                    if (!b) return;
                    seen.add(b.id);
                    found.push(b);
                };
                raw.forEach(ed => {
                    const o = otherOf(ed);
                    if (!o) return;
                    if (busCell(o) || o.parent && busCell(o.parent)) {
                        take(o);
                        return;
                    }
                    const eds = (model.getEdges ? model.getEdges(o) : o.edges) || [];
                    eds.forEach(ed2 => {
                        if (ed2 === ed) return;
                        const n = model.getTerminal(ed2, true) === o ? model.getTerminal(ed2, false) : model.getTerminal(ed2, true);
                        take(n);
                    });
                });
                found.forEach(b => {
                    const rec = findBus(b.mxObjectId && String(b.mxObjectId).replace(/#/g, "_"), b);
                    if (!rec) return;
                    if (!hv) hv = rec; else if (!lv && rec !== hv) lv = rec;
                });
            }
            if (!hv || !lv) {
                const have = hv || lv;
                const model = graph.getModel();
                const absBox = c => {
                    if (!c) return null;
                    let x = 0, y = 0, w = 0, h = 0, got = false, p = c;
                    const seen = new Set;
                    while (p && !seen.has(p)) {
                        seen.add(p);
                        const g = p.geometry;
                        if (g && g.relative !== true) {
                            x += Number(g.x) || 0;
                            y += Number(g.y) || 0;
                            if (!got) {
                                w = Number(g.width) || 0;
                                h = Number(g.height) || 0;
                                got = true;
                            }
                        }
                        p = p.parent;
                    }
                    return got ? {
                        x: x,
                        y: y,
                        w: w,
                        h: h
                    } : null;
                };
                const tb = absBox(cell);
                const knownKv = have ? parseFloat(have.vn_kv) : NaN;
                const wHv = parseFloat(transformer.vn_hv_kv), wLv = parseFloat(transformer.vn_lv_kv);
                let wantKv = NaN;
                if (Number.isFinite(knownKv)) {
                    const dH = Number.isFinite(wHv) ? Math.abs(knownKv - wHv) : Infinity;
                    const dL = Number.isFinite(wLv) ? Math.abs(knownKv - wLv) : Infinity;
                    wantKv = dH <= dL ? wLv : wHv;
                }
                const kvClose = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= Math.max(.5, .08 * Math.max(Math.abs(a), Math.abs(b)));
                let best = null, bestD = 1e12, any = null, anyD = 1e12;
                busbars.forEach(rec => {
                    if (!rec || rec === have) return;
                    const bb = absBox(model.getCell ? model.getCell(rec.id) : null);
                    if (!tb || !bb) return;
                    const tcx = tb.x + tb.w / 2, tcy = tb.y + tb.h / 2, midY = bb.y + bb.h / 2, x1 = bb.x, x2 = bb.x + (bb.w || 0);
                    const dx = tcx < x1 ? x1 - tcx : tcx > x2 ? tcx - x2 : 0, dy = tcy - midY, d = dx * dx + dy * dy;
                    if (kvClose(parseFloat(rec.vn_kv), wantKv) && d < bestD) {
                        bestD = d;
                        best = rec;
                    }
                    if (d < anyD) {
                        anyD = d;
                        any = rec;
                    }
                });
                const pick = best && bestD <= 4e3 * 4e3 ? best : any && anyD <= 800 * 800 ? any : null;
                if (pick) {
                    if (!hv) hv = pick; else lv = pick;
                }
            }
            if (!hv || !lv) throw new Error('not connected to two busbars (HV "' + (hv && hv.userFriendlyName || transformer.hv_bus || "—") + '", LV "' + (lv && lv.userFriendlyName || transformer.lv_bus || "—") + '")');
            const hvKv = parseFloat(hv.vn_kv), lvKv = parseFloat(lv.vn_kv);
            const swap = Number.isFinite(hvKv) && Number.isFinite(lvKv) && lvKv > hvKv;
            const high = swap ? lv : hv, low = swap ? hv : lv;
            return {
                ...transformer,
                hv_bus: high.name,
                lv_bus: low.name
            };
        } catch (err) {
            const msg = err && err.message ? err.message : String(err);
            console.error("Error processing transformer " + label + ":", err);
            if (!alerted) {
                alerted = true;
                alert("Error processing transformer " + label + ": " + msg);
            }
            return transformer;
        }
    });
};
