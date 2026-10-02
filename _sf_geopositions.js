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
