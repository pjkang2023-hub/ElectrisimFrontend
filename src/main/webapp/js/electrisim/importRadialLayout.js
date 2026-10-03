/**
 * Radial single-line layout for distribution / plant imports.
 * Grid and collector sit at the top. Each feeder chain runs horizontally
 * (left and right). Step-up LV buses hang under the MV bus they belong to.
 * Returns {x, y, w, leaf} per bus index. x/y are the busbar cell origin.
 */
export function layoutRadialSld(busRows, lineRows, trafoRows, extRows, originX, originY) {
    const n = busRows.length;
    const lineAdj = Array.from({ length: n }, () => []);
    const trafoDown = Array.from({ length: n }, () => []);
    (lineRows || []).forEach((r) => {
        const a = Number(r[2]);
        const b = Number(r[3]);
        if (a >= 0 && b >= 0 && a < n && b < n && a !== b) {
            lineAdj[a].push(b);
            lineAdj[b].push(a);
        }
    });
    (trafoRows || []).forEach((r) => {
        const hv = Number(r[2]);
        const lv = Number(r[3]);
        if (hv >= 0 && lv >= 0 && hv < n && lv < n) trafoDown[hv].push(lv);
    });

    let root = 0;
    if (extRows && extRows[0]) {
        const b = parseInt(String(extRows[0][1]), 10);
        if (Number.isFinite(b) && b >= 0 && b < n) root = b;
    }

    const parent = new Array(n).fill(-1);
    const queue = [root];
    parent[root] = root;
    while (queue.length) {
        const u = queue.shift();
        const nbrs = lineAdj[u].concat(trafoDown[u]);
        for (let i = 0; i < nbrs.length; i++) {
            const v = nbrs[i];
            if (parent[v] >= 0) continue;
            parent[v] = u;
            queue.push(v);
        }
    }

    const lineChildren = (u) => lineAdj[u].filter((v) => parent[v] === u);
    const trafoChildren = (u) => trafoDown[u].filter((v) => parent[v] === u);

    // Follow the single path from the grid down to the collector bus. A plant
    // connected above the collector voltage reaches it through one main
    // transformer, so the walk passes through a lone transformer as well as a
    // lone line. Stopping at the transformer left the collector unfound and every
    // feeder bus stacked in the fallback column below.
    const spine = [root];
    let cur = root;
    const guard = new Set([root]);
    for (;;) {
        const lc = lineChildren(cur);
        const tc = trafoChildren(cur);
        let next = null;
        if (lc.length === 1 && tc.length === 0) next = lc[0];
        else if (lc.length === 0 && tc.length === 1) next = tc[0];
        if (next == null || guard.has(next)) break;
        cur = next;
        guard.add(cur);
        spine.push(cur);
    }
    const collector = spine[spine.length - 1];
    const feeders = lineChildren(collector);
    const sideTrafos = trafoChildren(collector);

    const positions = new Array(n);
    const cx = originX;
    let y = originY;
    spine.forEach((b, i) => {
        const w = i === spine.length - 1 ? 280 : 200;
        positions[b] = { x: cx - w / 2, y, w, leaf: false };
        y += 170;
    });

    const collectorPos = positions[collector];
    const rowY = collectorPos.y + 280;
    const STEP = 280;
    const BW = 120;
    const LVW = 110;
    const DROP = 190;
    const colHalf = collectorPos.w / 2;

    const placeHorizontal = (start, dir, lane, centred = false) => {
        let u = start;
        let step = 1;
        const seen = new Set();
        const yRow = rowY + lane * (DROP + 220);
        while (u != null && !seen.has(u)) {
            seen.add(u);
            const x = centred && step === 1
                ? cx - BW / 2
                : cx + dir * (colHalf * 0.55 + (step - 1) * STEP) - BW / 2;
            if (!positions[u]) positions[u] = { x, y: yRow, w: BW, leaf: false };
            const tcs = trafoChildren(u);
            tcs.forEach((lv, k) => {
                if (!positions[lv]) {
                    positions[lv] = {
                        x: x + (BW - LVW) / 2,
                        y: yRow + DROP + k * 30,
                        w: LVW,
                        leaf: true,
                    };
                }
            });
            const next = lineChildren(u);
            if (!next.length) {
                if (positions[u] && tcs.length === 0) positions[u].leaf = true;
                break;
            }
            for (let k = 1; k < next.length; k++) {
                if (!positions[next[k]]) {
                    positions[next[k]] = {
                        x: x + dir * (k + 1) * 40,
                        y: yRow + DROP + 160,
                        w: BW,
                        leaf: false,
                    };
                }
            }
            u = next[0];
            step += 1;
        }
    };

    const left = [];
    const right = [];
    if (feeders.length <= 1) {
        feeders.forEach((f) => right.push(f));
    } else {
        feeders.forEach((f, i) => (i % 2 === 0 ? left : right).push(f));
    }
    // The first feeder each side takes the top row. Further feeders each take a
    // row of their own below; their connection drops from the collector, and in
    // the side column it ran straight through the first feeder's bus. The one
    // clear path down is the gap between the first left and right buses, so the
    // first extra feeder starts in the centre column. (Later ones keep their
    // side column, and may still cross the rows above.)
    if (left.length) placeHorizontal(left[0], -1, 0);
    if (right.length) placeHorizontal(right[0], 1, 0);
    const extra = [];
    for (let lane = 1; lane < Math.max(left.length, right.length); lane++) {
        if (lane < left.length) extra.push([left[lane], -1]);
        if (lane < right.length) extra.push([right[lane], 1]);
    }
    extra.forEach(([start, dir], i) => placeHorizontal(start, dir, i + 1, i === 0));

    sideTrafos.forEach((lv, k) => {
        if (positions[lv]) return;
        const base = positions[collector];
        positions[lv] = {
            x: base.x + base.w + 150 + k * 240,
            y: base.y,
            w: 120,
            leaf: true,
            side: true,
        };
    });

    // Anything the walk above did not reach is stacked in one column. Mark it, so
    // a caller can say the radial layout did not fit rather than report success.
    let uy = rowY + DROP + 280;
    for (let i = 0; i < n; i++) {
        if (!positions[i]) {
            positions[i] = { x: cx - 100, y: uy, w: 200, leaf: true, unplaced: true };
            uy += 180;
        }
    }
    return positions;
}

export function suggestImportSystem(model) {
    try {
        const buses = JSON.parse(model._object.bus._object).data || [];
        const lines = JSON.parse(model._object.line._object).data || [];
        const trafos = model._object.trafo ? (JSON.parse(model._object.trafo._object).data || []) : [];
        const n = buses.length;
        const m = lines.length + trafos.length;
        const extra = m - Math.max(0, n - 1);
        if (n > 60 || extra > Math.max(4, Math.round(n * 0.12))) return 'vertical';
        return 'radial';
    } catch (e) {
        return 'vertical';
    }
}
