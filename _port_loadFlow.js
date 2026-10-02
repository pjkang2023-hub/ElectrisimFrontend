// Port loadFlow.js: re-apply the two commits that landed on the minified file
// (25edf9cb "new models", 6bf974df "animation") onto the readable source at
// 84a5eb6d.
//
// The replacement updateTransformerBusConnections in HEAD was written directly
// into the minified file - it keeps full identifier names and unmerged statements
// that terser would have rewritten - so it is reproduced here verbatim rather
// than reconstructed.
const fs = require('fs');
const P = 'src/main/webapp/js/electrisim/loadFlow.js';
let s = fs.readFileSync(P, 'utf8');
const NL = '\n';
const must = (c, m) => { if (!c) { console.error('ANCHOR FAILED: ' + m); process.exit(1); } };
const sub = (from, to, label) => { must(s.includes(from), label); s = s.replace(from, to); };

// --- 1. a bus is matched by shapeELXXX=Bus, not any style containing "Bus" ---
sub("               connectedCell.style.includes('Bus') ||" + NL +
    "               (connectedCell.value && connectedCell.value.nodeName && connectedCell.value.nodeName.includes('Bus'));" + NL +
    "    };" + NL + NL +
    "    /** Pandapower-style switches (``et='t'``) sit between the bus and trafo on the diagram, so",
    "               connectedCell.style.includes('shapeELXXX=Bus') ||" + NL +
    "               (connectedCell.value && connectedCell.value.nodeName && connectedCell.value.nodeName.includes('Bus'));" + NL +
    "    };" + NL + NL +
    "    /** Pandapower-style switches (``et='t'``) sit between the bus and trafo on the diagram, so",
    'isBus style match');

// --- 2. resolveBusVia: accept a bus parent, and hop through Lines too -------
sub("    const resolveBusVia = (edge) => {" + NL +
    "        const direct = otherEnd(edge, cell);" + NL +
    "        if (!direct) return null;" + NL +
    "        if (isBus(direct)) return direct;" + NL +
    "        if (isSwitchVertex(direct) && Array.isArray(direct.edges)) {" + NL +
    "            for (const swEdge of direct.edges) {" + NL +
    "                if (swEdge === edge) continue;" + NL +
    "                const peer = otherEnd(swEdge, direct);" + NL +
    "                if (peer && isBus(peer)) return peer;" + NL +
    "            }" + NL +
    "        }" + NL +
    "        return null;" + NL +
    "    };",
    "    const resolveBusVia = (edge) => {" + NL +
    "        const neighbour = otherEnd(edge, cell);" + NL +
    "        if (!neighbour) return null;" + NL +
    "        // A bus drawn as a child shape resolves through its parent." + NL +
    "        const asBus = (v) => v && (isBus(v) ? v : (v.parent && isBus(v.parent) ? v.parent : null));" + NL +
    "        const direct = asBus(neighbour);" + NL +
    "        if (direct) return direct;" + NL +
    "        // Lines, like switches, can sit between the transformer and the bus." + NL +
    "        const hop = (v) => {" + NL +
    "            if (!v?.style || v.edge) return false;" + NL +
    "            const m = String(v.style).match(/shapeELXXX=([^;]+)/);" + NL +
    "            return !!m && (m[1] === 'Switch' || m[1] === 'switch' || m[1] === 'Line');" + NL +
    "        };" + NL +
    "        if (hop(neighbour) && Array.isArray(neighbour.edges)) {" + NL +
    "            for (const hopEdge of neighbour.edges) {" + NL +
    "                if (hopEdge === edge) continue;" + NL +
    "                const bus = asBus(otherEnd(hopEdge, neighbour));" + NL +
    "                if (bus) return bus;" + NL +
    "            }" + NL +
    "        }" + NL +
    "        return null;" + NL +
    "    };",
    'resolveBusVia');

// --- 3. the fallback now pools every distinct neighbour, bus-like first -----
sub("    } else {" + NL +
    "        const fallbackBus = (edge) => {" + NL +
    "            const o = otherEnd(edge, cell);" + NL +
    "            return o && o.mxObjectId ? o : null;" + NL +
    "        };" + NL +
    "        hvEntry = { bus: fallbackBus(edges[0]), idx: 0 };" + NL +
    "        lvEntry = { bus: fallbackBus(edges[1]), idx: 1 };" + NL +
    "    }",
    "    } else {" + NL +
    "        // Gather every distinct neighbour, then prefer the ones that really are" + NL +
    "        // buses. Taking edges[0]/edges[1] blindly picked up switches and stubs." + NL +
    "        const pool = [];" + NL +
    "        const pooled = new Set(uniqueBuses.map((x) => x.bus && x.bus.mxObjectId));" + NL +
    "        for (let i = 0; i < edges.length; i++) {" + NL +
    "            const o = otherEnd(edges[i], cell);" + NL +
    "            if (!o) continue;" + NL +
    "            const b = isBus(o) ? o : (o.parent && isBus(o.parent) ? o.parent : o);" + NL +
    "            if (!b || !b.mxObjectId || pooled.has(b.mxObjectId)) continue;" + NL +
    "            pooled.add(b.mxObjectId);" + NL +
    "            pool.push({ bus: b, idx: i });" + NL +
    "        }" + NL +
    "        const busLike = uniqueBuses.concat(pool.filter((x) => isBus(x.bus)));" + NL +
    "        const use = busLike.length >= 2 ? busLike : uniqueBuses.concat(pool);" + NL +
    "        if (use.length >= 2) {" + NL +
    "            const a = use[0];" + NL +
    "            const b = use[1];" + NL +
    "            const vnA = getBusVnKv(a.bus);" + NL +
    "            const vnB = getBusVnKv(b.bus);" + NL +
    "            if (Number.isFinite(vnA) && Number.isFinite(vnB) && vnA !== vnB) {" + NL +
    "                hvEntry = vnA >= vnB ? a : b;" + NL +
    "                lvEntry = vnA >= vnB ? b : a;" + NL +
    "            } else {" + NL +
    "                hvEntry = a;" + NL +
    "                lvEntry = b;" + NL +
    "            }" + NL +
    "        } else if (use.length === 1) {" + NL +
    "            hvEntry = use[0];" + NL +
    "            lvEntry = { bus: null, idx: -1 };" + NL +
    "        } else {" + NL +
    "            hvEntry = { bus: null, idx: -1 };" + NL +
    "            lvEntry = { bus: null, idx: -1 };" + NL +
    "        }" + NL +
    "    }",
    'fallback pool');

// --- 4. updateTransformerBusConnections, replaced wholesale ----------------
const RESOLVER_START = 'const updateTransformerBusConnections = (transformerArray, busbarArray, graphModel) => {';
const startIdx = s.indexOf(RESOLVER_START);
must(startIdx >= 0, 'updateTransformerBusConnections head');
const endMarker = NL + '};' + NL;
const endIdx = s.indexOf(endMarker, startIdx);
must(endIdx > startIdx, 'updateTransformerBusConnections terminator');

const RESOLVER = fs.readFileSync('_loadFlow_resolver.js', 'utf8').replace(/\r\n/g, NL).trimEnd();
s = s.slice(0, startIdx) + RESOLVER + s.slice(endIdx + endMarker.length - 1);

// --- 5. line endpoints: sweep every incident edge for a bus id. The old
//     source/target pair plus "first two edges" fallback missed lines whose
//     endpoints sit behind a switch, and could pick the same bus twice.
const LINE_FN_OLD = [
    "    if (cell.source && cell.target) {",
    "        const busFrom = resolveGraphEndpointToBusSemantic(cell.source, cell, model);",
    "        const busTo = resolveGraphEndpointToBusSemantic(cell.target, cell, model);",
    "        if (busFrom && busTo) return { busFrom, busTo };",
    "    }",
    "    const edges = edgesOfVertex(cell, model);",
    "    if (edges.length >= 2) {",
    "        const o0 = edges[0].source === cell ? edges[0].target : edges[0].source;",
    "        const o1 = edges[1].source === cell ? edges[1].target : edges[1].source;",
    "        const busFrom = resolveGraphEndpointToBusSemantic(o0, cell, model);",
    "        const busTo = resolveGraphEndpointToBusSemantic(o1, cell, model);",
    "        if (busFrom && busTo) return { busFrom, busTo };",
    "    }",
].join(NL);

const LINE_FN_NEW = [
    "    const ids = [];",
    "    const seenIds = new Set();",
    "    const add = (id) => { if (id && !seenIds.has(id)) { seenIds.add(id); ids.push(id); } };",
    "    const other = (ed) => {",
    "        if (!ed) return null;",
    "        if (ed.source === cell || (ed.source && cell && ed.source.id === cell.id)) return ed.target;",
    "        if (ed.target === cell || (ed.target && cell && ed.target.id === cell.id)) return ed.source;",
    "        return ed.target && ed.target !== cell ? ed.target : ed.source;",
    "    };",
    "    const edges = edgesOfVertex(cell, model);",
    "    for (let i = 0; i < edges.length; i++) {",
    "        add(resolveGraphEndpointToBusSemantic(other(edges[i]), edges[i], model));",
    "    }",
    "    if (cell.source && cell.target) {",
    "        add(resolveGraphEndpointToBusSemantic(cell.source, cell, model));",
    "        add(resolveGraphEndpointToBusSemantic(cell.target, cell, model));",
    "    }",
    "    if (ids.length >= 2) return { busFrom: ids[0], busTo: ids[1] };",
    "    if (ids.length === 1) return { busFrom: ids[0], busTo: ids[0] };",
].join(NL);

sub(LINE_FN_OLD, LINE_FN_NEW, 'line endpoints');

fs.writeFileSync(P, s);
console.log('port stage 1 applied:', s.split(NL).length, 'lines');
