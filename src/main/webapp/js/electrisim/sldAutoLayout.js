/**
 * Single-line-diagram layout for an imported network.
 *
 * Runs after the import has drawn every element with its attributes and
 * connections, and only moves cells and routes edges: what connects to what -
 * and so the network the studies export - does not change.
 *
 * The network is read back from the drawing: busbars, single-bus devices
 * (grid, generators, loads, shunts, storage, motors ...), two- and three-
 * terminal branches (lines, transformers, couplers), switches in between. A
 * spanning tree from the external grid's bus gives each bus a row and a column
 * of its own; the subtree under a bus sits under it, so a branch to a lower
 * bus drops straight down. Each bus has
 *   - its name above the left end, and the connection from above right of it;
 *   - its result box under the left end, then one slot per device below;
 *   - one drop per branch to a lower bus, to the right of its devices.
 * A branch that closes a ring runs in a channel between the rows; a converter
 * on one hangs under one of its bars, as a device does, its wire in the channel.
 * Converters in parallel between the same two bars drop side by side.
 *
 * The layout this replaces put every bus at the same distance from the grid on
 * one row, end to end, so three bars at three voltages read as one, and hung
 * devices and transformers into the same gaps: the grid and the main
 * transformer sat on the 110 kV bar, a generator on another bus's drop.
 */

const SLOT = 110;            // one device or drop along a bar
const BAR_PAD_L = 100;       // left end of a bar, under which its result box sits
const BAR_PAD_R = 44;
const BAR_MIN_W = 220;
const SUBTREE_GAP = 70;
const ROW = 360;             // bar to bar
const DROP = 66;             // bar to the top of a hanging device
const SWITCH_DROP = 40;      // bar to the centre of a switch on a drop
const DEVICE_ZONE = 250;     // below a bar: devices, their labels and result boxes
const CHANNEL_STEP = 16;
const LABEL_CHAR_W = 6.6;

const SYMBOLS = {
    trafoV: { url: 'images/electrical/sym-transformer-v.svg', w: 72, h: 108 },
    trafo3V: { url: 'images/electrical/sym-3w-transformer-v.svg', w: 96, h: 100 },
    storageV: { url: 'images/electrical/sym-storage-v.svg', w: 40, h: 56 },
};

// Hanging devices along a bar, in this order.
const DEVICE_RANK = {
    'External Grid': 0, 'Generator': 1, 'Static Generator': 2, 'Wind Turbine': 2, 'PVSystem': 2,
    'Asymmetric Static Generator': 2, 'Storage': 3, 'Load': 4, 'Asymmetric Load': 4, 'Motor': 5,
    'Shunt Reactor': 6, 'Capacitor': 6, 'SVC': 6,
};

// The type name a label carries until it is given the element's own.
const DEFAULT_LABELS = new Set([
    'External Grid', 'Generator', 'Static Generator', 'Wind Turbine', 'Asymmetric Static Generator',
    'Load', 'Asymmetric Load', 'Storage', 'Motor', 'Shunt Reactor', 'Capacitor', 'PVSystem', 'SVC',
    'Transformer', 'Three Winding Transformer', 'Impedance', 'Ward', 'Extended Ward',
]);

function shapeOf(cell) {
    const m = /(?:^|;)shapeELXXX=([^;]+)/.exec(String((cell && cell.style) || ''));
    return m ? m[1] : '';
}

function attr(cell, name) {
    const v = cell && cell.value;
    return v && typeof v.getAttribute === 'function' ? v.getAttribute(name) : null;
}

/** Set (or with null remove) style keys, keeping every other key as it was. */
function setStyleKeys(style, keys) {
    let parts = String(style || '').split(';').filter((p) => p !== '');
    Object.keys(keys).forEach((key) => {
        parts = parts.filter((p) => p.split('=')[0] !== key);
        if (keys[key] !== null && keys[key] !== undefined) parts.push(`${key}=${keys[key]}`);
    });
    return parts.join(';');
}

function point(x, y) {
    return typeof mxPoint !== 'undefined' ? new mxPoint(x, y) : { x, y };
}

/** A pin at fractions (fx, fy) of a cell, in diagram coordinates, after its rotation. */
function pinAt(geo, fx, fy, rotation) {
    const cx = geo.x + geo.width / 2;
    const cy = geo.y + geo.height / 2;
    const dx = geo.x + geo.width * fx - cx;
    const dy = geo.y + geo.height * fy - cy;
    const r = ((rotation || 0) * Math.PI) / 180;
    return { x: cx + dx * Math.cos(r) - dy * Math.sin(r), y: cy + dx * Math.sin(r) + dy * Math.cos(r) };
}

// The DC and microgrid layer's elements (importElectrisimLayer.js). Their ends
// keep the pins they were wired on: the payload reads a DC/DC converter's input
// as its left pin's bus, its output as its right's (dcPayload.js).
const PINNED = new Set(['VSC', 'B2B VSC', 'Solid-State Transformer', 'DC/DC Converter', 'DC Line', 'DC Diode', 'PCS',
    'Load DC', 'Source DC', 'DC Capacitor', 'Battery', 'Supercapacitor', 'Flywheel', 'SOFC', 'PV Array',
    'Grounding Transformer']);
const BUS_SHAPES = new Set(['Bus', 'DC Bus']);
const SWITCH_SHAPES = new Set(['Switch', 'DC Breaker']);
// Room between two bars on a row for the tie drawn between them, by what is on it.
const TIE_ROOM = { coupler: 150, edge: 110, vertex: 150 };
const TIE_SWITCH_ROOM = 80;

/** The pin an edge uses on a cell, as {fx, fy}, or null when it floats. */
function pinOf(edge, cell) {
    const style = String((edge && edge.style) || '');
    const side = edge.source === cell ? 'exit' : 'entry';
    const x = new RegExp(`(?:^|;)${side}X=([-0-9.]+)`).exec(style);
    const y = new RegExp(`(?:^|;)${side}Y=([-0-9.]+)`).exec(style);
    return x && y ? { fx: parseFloat(x[1]), fy: parseFloat(y[1]) } : null;
}

function neighbours(model, cell) {
    const out = [];
    const n = model.getEdgeCount(cell);
    for (let i = 0; i < n; i++) {
        const edge = model.getEdgeAt(cell, i);
        if (!edge || !edge.edge) continue;
        const other = edge.source === cell ? edge.target : edge.source;
        if (other && other !== cell) out.push({ edge, other });
    }
    return out;
}

/**
 * Read the network back from the drawing.
 * @returns {{buses, devices, branches, switches}} or null when there is nothing to lay out
 */
function readNetwork(graph, parent) {
    const model = graph.getModel();
    const vertices = graph.getChildCells(parent, true, false) || [];
    const edges = graph.getChildCells(parent, false, true) || [];
    const isBus = (c) => !!c && BUS_SHAPES.has(shapeOf(c));
    const isSwitch = (c) => !!c && SWITCH_SHAPES.has(shapeOf(c));
    const buses = vertices.filter(isBus);
    if (!buses.length) return null;

    const chainSwitches = new Set();
    const devices = [];
    const branches = [];
    vertices.forEach((cell) => {
        if (isBus(cell) || isSwitch(cell) || !cell.geometry) return;
        const terms = [];
        const tails = [];
        neighbours(model, cell).forEach(({ edge, other }) => {
            if (isBus(other)) {
                terms.push({ bus: other, legs: [edge], sw: null, pin: pinOf(edge, cell) });
            } else if (isSwitch(other)) {
                neighbours(model, other).forEach(({ edge: e2, other: o2 }) => {
                    if (e2 !== edge && isBus(o2)) {
                        terms.push({ bus: o2, legs: [edge, e2], sw: other, pin: pinOf(edge, cell) });
                        chainSwitches.add(other);
                    }
                });
            } else if (PINNED.has(shapeOf(other)) && neighbours(model, other).length === 1) {
                // On it alone, no bus of its own: a PCS's battery, PV array or SOFC.
                tails.push({ cell: other, edge });
            }
        });
        if (terms.length === 1) devices.push({ cell, shape: shapeOf(cell), term: terms[0], tails });
        else if (terms.length === 2 || terms.length === 3) {
            branches.push({ kind: shapeOf(cell) === 'Three Winding Transformer' ? 'trafo3'
                : shapeOf(cell) === 'Transformer' ? 'trafo' : 'vertex', cell, terms });
        }
    });
    // A switch between two buses is a coupler.
    vertices.filter((c) => isSwitch(c) && !chainSwitches.has(c)).forEach((sw) => {
        const terms = neighbours(model, sw).filter(({ other }) => isBus(other))
            .map(({ edge, other }) => ({ bus: other, legs: [edge], sw: null }));
        if (terms.length === 2 && terms[0].bus !== terms[1].bus) branches.push({ kind: 'coupler', cell: sw, terms });
    });
    // A line drawn as an edge straight from bus to bus.
    edges.forEach((edge) => {
        if (isBus(edge.source) && isBus(edge.target) && edge.source !== edge.target) {
            branches.push({ kind: 'edge', cell: edge, terms: [
                { bus: edge.source, legs: [edge], sw: null }, { bus: edge.target, legs: [edge], sw: null }] });
        }
    });
    return { buses, devices, branches };
}

const vnOf = (bus) => {
    const v = parseFloat(attr(bus, 'vn_kv'));
    return Number.isFinite(v) ? v : 0;
};
const labelWidth = (bus) => String(attr(bus, 'name') || '').length * LABEL_CHAR_W;
const nameWidth = (cell) => String(attr(cell, 'name') || '').length * LABEL_CHAR_W;
/** A converter or diode closing a ring: it hangs under a bar, not on the channel. */
const hangs = (br) => br.kind === 'vertex' && br.terms.length === 2 && PINNED.has(shapeOf(br.cell))
    && shapeOf(br.cell) !== 'DC Line';
/** From one drop of a parallel group to the next: clear of its name, beside it. */
const parallelStep = (br) => Math.max(100, nameWidth(br.cell) + 50);
/** Where the connection from above meets a bar: right of its name. */
const entryOffset = (bus) => Math.max(44, labelWidth(bus) + 24);

/**
 * Lay the drawing out again.
 * @returns {boolean} whether it did
 */
export function relayoutSld(graph, parent) {
    const net = readNetwork(graph, parent);
    if (!net) return false;
    const model = graph.getModel();
    const { buses, devices, branches } = net;

    const before = graph.getBoundingBox ? graph.getBoundingBox(graph.getChildCells(parent, true, true)) : null;
    const originX = before ? before.x : 0;
    const originY = before ? before.y : 0;

    // Devices by bus; the grid's devices above the root bar.
    const devicesOf = new Map(buses.map((b) => [b, []]));
    devices.forEach((d) => devicesOf.get(d.term.bus) && devicesOf.get(d.term.bus).push(d));
    devicesOf.forEach((list) => list.sort((a, b) => (DEVICE_RANK[a.shape] ?? 9) - (DEVICE_RANK[b.shape] ?? 9)));
    const incident = new Map(buses.map((b) => [b, []]));
    branches.forEach((br) => br.terms.forEach((t) => {
        const list = incident.get(t.bus);
        if (list && !list.includes(br)) list.push(br);
    }));
    const kindRank = { trafo3: 0, trafo: 1, vertex: 2, edge: 2, coupler: 3 };
    incident.forEach((list) => list.sort((a, b) => kindRank[a.kind] - kindRank[b.kind]));

    // Spanning tree from the grid's bus: each branch either brings a bus in
    // (a tree branch, drawn as a drop) or closes a ring.
    const grid = devices.find((d) => d.shape === 'External Grid');
    const order = [...buses].sort((a, b) => vnOf(b) - vnOf(a));
    if (grid) order.unshift(grid.term.bus);
    const visited = new Set();
    const reached = new Map();              // bus -> [depth, order reached]
    const children = new Map(buses.map((b) => [b, []]));
    const closures = [];
    const roots = [];
    const isOpen = (br) => br.kind === 'coupler' && String(attr(br.cell, 'closed')) === 'false';
    // One depth at a time, lines and transformers before couplers: a bus
    // reached through a coupler first left its transformer as a ring across
    // the drawing. An open coupler is never a tree branch.
    const take = (u, br, next) => {
        if (br.used) return;
        br.used = true;
        const others = [...new Set(br.terms.map((t) => t.bus).filter((b) => b !== u))];
        const fresh = isOpen(br) ? [] : others.filter((b) => !visited.has(b));
        if (!fresh.length) {
            if (others.length !== 1) return;
            // A converter in parallel with a drop between the same two bars - a
            // lineup's rectifiers sharing its 800 V bus - drops beside it: as a
            // ring each ran in the channel over the next.
            const twin = br.kind === 'vertex' && br.terms.length === 2 && children.get(u).find((t) => !t.parallelOf
                && t.kind === 'vertex' && t.kids.length === 1 && t.kids[0] === others[0] && shapeOf(t.cell) === shapeOf(br.cell));
            if (twin) {
                br.parallelOf = twin;
                br.parentBus = u;
                br.kids = [others[0]];
                (twin.parallels = twin.parallels || []).push(br);
                children.get(u).push(br);
                return;
            }
            closures.push(br);
            return;
        }
        br.parentBus = u;
        br.kids = fresh.sort((a, b) => vnOf(b) - vnOf(a));
        children.get(u).push(br);
        fresh.forEach((b) => { visited.add(b); next.push(b); reached.set(b, [reached.get(u)[0] + 1, reached.size]); });
    };
    order.forEach((start) => {
        if (visited.has(start)) return;
        roots.push(start);
        visited.add(start);
        reached.set(start, [0, reached.size]);
        let frontier = [start];
        while (frontier.length) {
            const next = [];
            frontier.forEach((u) => incident.get(u).filter((br) => br.kind !== 'coupler').forEach((br) => take(u, br, next)));
            frontier.forEach((u) => incident.get(u).filter((br) => br.kind === 'coupler' && !isOpen(br)).forEach((br) => take(u, br, next)));
            frontier = next;
        }
    });
    // Open couplers whose buses the tree reached some other way.
    branches.filter((br) => !br.used && br.terms.length === 2).forEach((br) => { br.used = true; closures.push(br); });
    // A converter closing a ring hangs under the bar nearer the grid; between two
    // on one row, under the one with fewer such (a shelf rather than the catcher
    // group that feeds six), so their names have room.
    const hangCount = new Map(buses.map((b) => [b, 0]));
    closures.filter(hangs).forEach((br) => br.terms.forEach((t) => hangCount.set(t.bus, hangCount.get(t.bus) + 1)));
    closures.filter(hangs).forEach((br) => {
        const [a, b] = br.terms;
        const ra = reached.get(a.bus) || [0, 0];
        const rb = reached.get(b.bus) || [0, 0];
        let pick = ra[0] !== rb[0] ? (ra[0] < rb[0] ? a : b)
            : hangCount.get(a.bus) !== hangCount.get(b.bus) ? (hangCount.get(a.bus) < hangCount.get(b.bus) ? a : b)
                : (ra[1] <= rb[1] ? a : b);
        br.hangTerm = pick;
    });
    // Each parallel drop's offset from its twin's, and how far right of its entry the bar below must run.
    const parallelSpan = new Map();
    children.forEach((list) => list.filter((br) => br.parallels).forEach((twin) => {
        let off = 0;
        let prev = twin;
        twin.parallels.forEach((br) => { off += parallelStep(prev); br.parallelOffset = off; prev = br; });
        const kid = twin.kids[0];
        parallelSpan.set(kid, Math.max(parallelSpan.get(kid) || 0, off));
    }));
    const rootGrids = new Set(devices.filter((d) => d.shape === 'External Grid' && roots.includes(d.term.bus)));
    const hanging = (bus) => devicesOf.get(bus).filter((d) => !rootGrids.has(d));

    // Each subtree measured bottom up, relative to its own left edge: the
    // children side by side (they sit a row lower, so they may run under this
    // bar's devices), then this bar's devices in the slots its drops leave free.
    // Room from a drop to the next device: the drop's result box hangs to its right.
    const DROP_CLEAR = { trafo3: 110, trafo: 104, vertex: 100, edge: 100, coupler: 100 };
    // Ports at the right end of a bar for the ring branches that end there. A
    // tie drawn across between two neighbouring bars needs none, but room
    // between them, right of the first.
    // Each end is as wide as what hangs there: a converter and its name, or a wire.
    const ringEnds = new Map();
    const tieRoom = new Map();
    const countRingEnds = () => {
        buses.forEach((b) => ringEnds.set(b, []));
        closures.filter((br) => !br.barLevel).forEach((br) => br.terms.forEach((t) => ringEnds.get(t.bus).push(
            br.hangTerm === t ? Math.max(60, nameWidth(br.cell) + 40) : 40)));
    };
    countRingEnds();
    const layoutOf = new Map();
    const measure = (u) => {
        if (layoutOf.has(u)) return layoutOf.get(u);
        const kidOffset = new Map();
        // The first drop clear of the connection coming in from above, or the
        // two read as one line through the bar.
        const firstKid = children.get(u).length ? children.get(u)[0].kids[0] : null;
        let x = firstKid ? Math.max(60, entryOffset(u) + 60 - entryOffset(firstKid)) : 60;
        children.get(u).filter((br) => !br.parallelOf).forEach((br) => br.kids.forEach((k) => {
            kidOffset.set(k, x);
            x += measure(k).width + SUBTREE_GAP;
        }));
        const kidsRight = kidOffset.size ? x - SUBTREE_GAP : 0;
        const twinX = new Map();
        const drops = children.get(u).map((br) => {
            const entry = kidOffset.get(br.kids[0]) + entryOffset(br.kids[0]);
            const dx = br.parallelOf ? twinX.get(br.parallelOf) + br.parallelOffset
                : br.kind === 'trafo3' ? entry + 12 * (SYMBOLS.trafo3V.w / 96) : entry;
            twinX.set(br, dx);
            // A transformer or turned converter carries its name to its right: a
            // ring's wire down the bar's end ran through a transformer's.
            const named = br.kind === 'trafo' ? nameWidth(br.cell) + 60
                : br.kind === 'vertex' && PINNED.has(shapeOf(br.cell)) ? nameWidth(br.cell) + 30 : 0;
            return { br, x: dx, clear: Math.max(DROP_CLEAR[br.kind] || 60, named) };
        });
        // Devices a slot apart, or their names' half widths apart: a back-up
        // genset's name ran into its lineup's AC load's.
        const deviceX = [];
        const halfName = (d) => Math.max(40, nameWidth(d.cell)) / 2;
        let c = BAR_PAD_L + SLOT / 2;
        let prev = null;
        hanging(u).forEach((d) => {
            const gap = prev ? Math.max(SLOT, halfName(prev) + halfName(d) + 30) : 0;
            const blocked = (cx) => drops.some((dr) => cx > dr.x - (DROP_CLEAR[dr.br.kind] || 60) && cx < dr.x + dr.clear)
                || (deviceX.length && cx - deviceX[deviceX.length - 1] < gap);
            while (blocked(c)) c += 10;
            deviceX.push(c);
            prev = d;
            c += SLOT;
        });
        let used = Math.max(entryOffset(u) + 36 + (parallelSpan.get(u) || 0),
            deviceX.length ? deviceX[deviceX.length - 1] + Math.max(SLOT / 2, halfName(prev)) - 20 : 0,
            ...drops.map((d) => d.x + d.clear - 20));
        const portX = [];
        ringEnds.get(u).forEach((w) => {
            used += 40;
            portX.push(used);
            used += w - 40;                     // a hanging converter's name, right of its port
        });
        const barRight = Math.max(BAR_MIN_W, entryOffset(u) + 80, used + BAR_PAD_R);
        const m = { kidOffset, drops, deviceX, portX, ports: 0, barRight,
            width: Math.max(barRight + (tieRoom.get(u) || 0), kidsRight) };
        layoutOf.set(u, m);
        return m;
    };

    // Positions, top down.
    const pos = new Map();
    const dropX = new Map();
    const place = (u, left, depth) => {
        const m = measure(u);
        pos.set(u, { x: left, y: originY + 120 + depth * ROW, depth, right: left + m.barRight });
        m.drops.forEach((d) => dropX.set(d.br, left + d.x));
        m.kidOffset.forEach((off, k) => place(k, left + off, depth + 1));
    };
    const placeAll = () => {
        pos.clear();
        dropX.clear();
        let left = originX;
        roots.forEach((r) => { place(r, left, 0); left += measure(r).width + SUBTREE_GAP * 2; });
    };
    placeAll();

    // A ring branch between two bars side by side on a row - a bus tie, the
    // DC tie between two row groups - goes straight across between them. Its
    // channel below the bars crossed every drop on the way: the campus's bus
    // tie ran through eight transformer drops.
    const neighbourBars = (a, b) => {
        const pa = pos.get(a);
        const pb = pos.get(b);
        if (!pa || !pb || pa.y !== pb.y || a === b) return null;
        const [l, r] = pa.x <= pb.x ? [a, b] : [b, a];
        const between = buses.some((c) => c !== l && c !== r && pos.get(c) && pos.get(c).y === pa.y
            && pos.get(c).x > pos.get(l).x && pos.get(c).x < pos.get(r).x);
        return between ? null : { left: l, right: r };
    };
    closures.forEach((br) => {
        if (br.terms.length !== 2 || !TIE_ROOM[br.kind]) return;
        const pair = neighbourBars(br.terms[0].bus, br.terms[1].bus);
        if (!pair) return;
        br.barLevel = pair;
        // An element on it carries its name above, clear of the next bar's.
        const nameRoom = br.kind === 'vertex' ? String(attr(br.cell, 'name') || '').length * LABEL_CHAR_W + 24 : 0;
        const room = Math.max(nameRoom, TIE_ROOM[br.kind] + br.terms.filter((t) => t.sw).length * TIE_SWITCH_ROOM);
        tieRoom.set(pair.left, Math.max(tieRoom.get(pair.left) || 0, room));
    });
    if (closures.some((br) => br.barLevel)) {
        countRingEnds();
        layoutOf.clear();
        placeAll();
    }

    const entryX = (b) => pos.get(b).x + entryOffset(b);

    const busGeo = (b) => model.getGeometry(b);
    const barMidY = (b) => pos.get(b).y + busGeo(b).height / 2;
    const barTop = (b) => pos.get(b).y;
    const barBottom = (b) => pos.get(b).y + busGeo(b).height;

    const moveVertex = (cell, cx, cy, size) => {
        const geo = model.getGeometry(cell).clone();
        if (size) { geo.width = size.w; geo.height = size.h; }
        geo.x = cx - geo.width / 2;
        geo.y = cy - geo.height / 2;
        model.setGeometry(cell, geo);
    };
    const restyle = (cell, keys) => model.setStyle(cell, setStyleKeys(model.getStyle(cell), keys));
    // Elements whose name goes beside a turned symbol or above one on a tie.
    const named = new Map();

    /**
     * Route an edge as straight segments through the given points. An end
     * given as {fx, fy} docks at that pin of its cell; otherwise it floats.
     */
    const route = (edge, ends, points, extra) => {
        const keys = {
            edgeStyle: 'none', rounded: 0, orthogonalLoop: null, jettySize: null, noEdgeStyle: null,
            portConstraint: null, exitX: null, exitY: null, exitDx: null, exitDy: null, exitPerimeter: null,
            entryX: null, entryY: null, entryDx: null, entryDy: null, entryPerimeter: null,
        };
        const src = ends.get(edge.source);
        const dst = ends.get(edge.target);
        if (src) Object.assign(keys, { exitX: src.fx, exitY: src.fy, exitDx: 0, exitDy: 0, exitPerimeter: 0 });
        if (dst) Object.assign(keys, { entryX: dst.fx, entryY: dst.fy, entryDx: 0, entryDy: 0, entryPerimeter: 0 });
        Object.assign(keys, extra || {});
        restyle(edge, keys);
        const geo = model.getGeometry(edge).clone();
        geo.points = points.map((p) => point(p.x, p.y));
        model.setGeometry(edge, geo);
    };
    const barPin = (b, x) => {
        const p = pos.get(b);
        return { fx: Math.max(0, Math.min(1, (x - p.x) / (p.right - p.x))), fy: 0.5 };
    };
    // Points along a leg listed from the bus end; route() reverses them when
    // the edge runs the other way.
    const legRoute = (edge, busCell, busPinX, other, otherPin, points) => {
        const ends = new Map();
        ends.set(busCell, barPin(busCell, busPinX));
        if (otherPin) ends.set(other, otherPin);
        const fromBus = edge.source === busCell;
        route(edge, ends, fromBus ? points : [...points].reverse());
    };
    const placeSwitch = (sw, x, y, vertical) => {
        const g = model.getGeometry(sw);
        const w = Math.max(g.width, g.height);
        const h = Math.min(g.width, g.height);
        // The symbol's pins sit 5 % of its height off centre (y = 22/40).
        const off = 0.05 * h;
        moveVertex(sw, vertical ? x + off : x, vertical ? y : y - off, { w, h });
        restyle(sw, { rotation: vertical ? 90 : null });
    };
    // A switch leg: bus - switch - element, the switch at swY on the drop at x.
    const routeTerm = (t, x, swY, element, elementPin) => {
        if (t.sw) {
            placeSwitch(t.sw, x, swY, true);
            const [elemLeg, busLeg] = t.legs;
            legRoute(busLeg, t.bus, x, t.sw, null, []);
            const ends = new Map();
            if (elementPin) ends.set(element, elementPin);
            route(elemLeg, ends, []);
        } else {
            legRoute(t.legs[0], t.bus, x, element, elementPin, []);
        }
    };

    // Buses.
    buses.forEach((b) => {
        const p = pos.get(b);
        const geo = busGeo(b).clone();
        geo.x = p.x;
        geo.y = p.y;
        geo.width = p.right - p.x;
        model.setGeometry(b, geo);
    });

    // Devices.
    buses.forEach((b) => {
        hanging(b).forEach((d, i) => {
            const x = pos.get(b).x + measure(b).deviceX[i];
            const style = String(model.getStyle(d.cell) || '');
            // Hung below the bar: the symbols with their terminal on top.
            let size = null;
            const next = { portConstraint: null, rotation: null };
            if (/sym-generator-down\.svg/.test(style)) next.image = 'images/electrical/sym-generator.svg';
            if (/sym-static-gen-down\.svg/.test(style)) next.image = 'images/electrical/sym-static-gen.svg';
            if (/sym-storage\.svg/.test(style)) {
                next.image = SYMBOLS.storageV.url;
                size = { w: SYMBOLS.storageV.w, h: SYMBOLS.storageV.h };
            }
            restyle(d.cell, next);
            const h = size ? size.h : model.getGeometry(d.cell).height;
            const top = barBottom(b) + DROP + (d.term.sw ? 50 : 0);
            moveVertex(d.cell, x, top + h / 2, size);
            const pin = PINNED.has(d.shape) && d.term.pin ? d.term.pin : { fx: 0.5, fy: 0 };
            routeTerm(d.term, x, barBottom(b) + SWITCH_DROP, d.cell, pin);
            // What hangs on it alone - a PCS's battery - under it.
            let below = top + h;
            d.tails.forEach(({ cell: tail, edge }) => {
                const th = model.getGeometry(tail).height;
                moveVertex(tail, x, below + 28 + th / 2);
                restyle(tail, { rotation: null });
                const ends = new Map([[d.cell, pinOf(edge, d.cell)], [tail, pinOf(edge, tail)]].filter(([, p]) => p));
                route(edge, ends, []);
                below += 28 + th;
            });
        });
        devicesOf.get(b).filter((d) => rootGrids.has(d)).forEach((d, i) => {
            const x = entryX(b) + 40 + i * SLOT;
            const h = model.getGeometry(d.cell).height;
            moveVertex(d.cell, x, barTop(b) - DROP - h / 2);
            restyle(d.cell, { portConstraint: null, rotation: null });
            routeTerm(d.term, x, barTop(b) - SWITCH_DROP, d.cell, { fx: 0.5, fy: 1 });
        });
    });

    // Branches down the tree: a drop from the parent bar to the child below.
    children.forEach((list, u) => list.forEach((br) => {
        const x = dropX.get(br);
        const kid = br.kids[0];
        const top = barBottom(u);
        const bottom = barTop(kid);
        const midY = (top + bottom) / 2;
        const termOf = (bus) => br.terms.find((t) => t.bus === bus);
        if (br.kind === 'edge') {
            const ends = new Map([[u, barPin(u, x)], [kid, barPin(kid, x)]]);
            route(br.cell, ends, []);
            return;
        }
        if (br.kind === 'trafo3') {
            // Vertical symbol: HV on top, the two lower windings below.
            const { url, w, h } = SYMBOLS.trafo3V;
            restyle(br.cell, { image: url, rotation: null });
            moveVertex(br.cell, x, midY - 20, { w, h });
            const g = model.getGeometry(br.cell);
            const pins = { hv: { fx: 0.5, fy: 0.04 }, a: { fx: 0.375, fy: 0.94 }, b: { fx: 0.625, fy: 0.94 } };
            const hvTerm = termOf(u);
            routeTerm(hvTerm, x, top + SWITCH_DROP, br.cell, pins.hv);
            br.kids.forEach((k, i) => {
                const t = termOf(k);
                const pin = i === 0 ? pins.a : pins.b;
                const p = pinAt(g, pin.fx, pin.fy, 0);
                const kx = entryX(k);
                const lane = barTop(k) - 90 - i * CHANNEL_STEP;
                const pts = Math.abs(kx - p.x) < 1 ? [] : [{ x: kx, y: lane }, { x: p.x, y: lane }];
                if (t.sw) {
                    placeSwitch(t.sw, kx, barTop(k) - SWITCH_DROP, true);
                    legRoute(t.legs[1], k, kx, t.sw, null, []);
                    const ends = new Map([[br.cell, pin]]);
                    const fromSw = t.legs[0].source === t.sw;
                    route(t.legs[0], ends, fromSw ? pts : [...pts].reverse());
                } else {
                    legRoute(t.legs[0], k, kx, br.cell, pin, pts);
                }
            });
            return;
        }
        let elementPin = null;
        let lowerPin = null;
        if (br.kind === 'trafo') {
            // Vertical windings, HV toward the higher-voltage bus.
            const { url, w, h } = SYMBOLS.trafoV;
            const hvUp = vnOf(u) >= vnOf(kid);
            restyle(br.cell, { image: url, rotation: hvUp ? null : 180 });
            moveVertex(br.cell, x, midY, { w, h });
            const hv = { fx: 0.5, fy: 0.044444444444444446 };
            const lv = { fx: 0.5, fy: 0.9555555555555556 };
            elementPin = hvUp ? hv : lv;
            lowerPin = hvUp ? lv : hv;
        } else if (br.kind === 'coupler') {
            placeSwitch(br.cell, x, midY, true);
        } else if (PINNED.has(shapeOf(br.cell)) && termOf(u).pin) {
            // A converter (or a DC cable's symbol): turned so the pin toward the
            // bar above is on top, the other below. Its pins stay as wired.
            const up = termOf(u).pin;
            const rotation = up.fx < 0.25 ? 90 : up.fx > 0.75 ? 270 : up.fy > 0.75 ? 180 : null;
            restyle(br.cell, { rotation });
            moveVertex(br.cell, x, midY);
            const p = pinAt(model.getGeometry(br.cell), up.fx, up.fy, rotation || 0);
            moveVertex(br.cell, x + (x - p.x), midY);
            if (rotation === 90 || rotation === 270) named.set(br.cell, 'right');
            elementPin = up;
            lowerPin = termOf(kid).pin;
        } else {
            // A line (or other branch) drawn as a short vertex on the drop;
            // its legs meet at its centre.
            const g = model.getGeometry(br.cell);
            const isLine = shapeOf(br.cell) === 'Line';
            if (isLine) restyle(br.cell, { direction: 'north', rotation: null });
            const size = isLine ? { w: Math.min(g.width, g.height), h: Math.max(g.width, g.height) } : null;
            moveVertex(br.cell, x, midY, size);
        }
        routeTerm(termOf(u), x, top + SWITCH_DROP, br.cell, elementPin);
        routeTerm(termOf(kid), x, bottom - SWITCH_DROP, br.cell, lowerPin);
    }));

    // Branches that close a ring: down from one bar, along a channel, onto the other.
    const lanes = new Map();
    const pinned = (br, t) => (PINNED.has(shapeOf(br.cell)) ? t.pin : null);
    // Across from the right end of one bar to the left end of the next, at
    // their height; an element on it in the middle, its switches beside the bars.
    const routeTie = (br) => {
        const { left: L, right: R } = br.barLevel;
        const y = barMidY(L);
        const x0 = pos.get(L).right;
        const x1 = pos.get(R).x;
        const midX = (x0 + x1) / 2;
        const tl = br.terms.find((t) => t.bus === L);
        const tr = br.terms.find((t) => t.bus === R);
        if (br.kind === 'edge') {
            route(br.cell, new Map([[L, barPin(L, x0)], [R, barPin(R, x1)]]), []);
            return;
        }
        if (br.kind === 'coupler') {
            placeSwitch(br.cell, midX, y, false);
            legRoute(tl.legs[0], L, x0, br.cell, null, []);
            legRoute(tr.legs[0], R, x1, br.cell, null, []);
            return;
        }
        // Its pin toward the left bar on its left.
        const pl = pinned(br, tl);
        const pr = pinned(br, tr);
        const rotation = (pl && pl.fx > 0.5) || (!pl && pr && pr.fx < 0.5) ? 180 : null;
        if (shapeOf(br.cell) === 'Line') restyle(br.cell, { direction: null });
        restyle(br.cell, { rotation });
        moveVertex(br.cell, midX, y);
        named.set(br.cell, 'above');
        const pin = pl || pr;
        if (pin) {
            const p = pinAt(model.getGeometry(br.cell), pin.fx, pin.fy, rotation || 0);
            moveVertex(br.cell, midX, y + (y - p.y));
        }
        const leg = (t, bus, barX, elementPin) => {
            if (t.sw) {
                placeSwitch(t.sw, barX + (barX < midX ? 45 : -45), y, false);
                legRoute(t.legs[1], bus, barX, t.sw, null, []);
                route(t.legs[0], elementPin ? new Map([[br.cell, elementPin]]) : new Map(), []);
            } else {
                legRoute(t.legs[0], bus, barX, br.cell, elementPin, []);
            }
        };
        leg(tl, L, x0, pl);
        leg(tr, R, x1, pr);
    };
    // A converter closing a ring: under its bar at its port, turned so its pin
    // toward that bar is on top, its other leg down to the channel and across.
    const routeHanging = (br) => {
        const e = br.hangTerm;
        const o = br.terms.find((t) => t !== e);
        const sameRow = barTop(e.bus) === barTop(o.bus);
        const port = (bus) => {
            const m = measure(bus);
            return pos.get(bus).x + m.portX[Math.min(m.ports++, m.portX.length - 1)];
        };
        const ex = port(e.bus);
        const ox = port(o.bus);
        const key = sameRow ? `b${barTop(e.bus)}` : `t${barTop(o.bus)}`;
        const lane = lanes.get(key) || 0;
        lanes.set(key, lane + 1);
        const chY = sameRow
            ? Math.max(barBottom(e.bus), barBottom(o.bus)) + DEVICE_ZONE + lane * CHANNEL_STEP
            : barTop(o.bus) - 70 - lane * CHANNEL_STEP;
        const jumps = { jumpStyle: 'arc', jumpSize: 10 };
        const up = e.pin;
        const down = o.pin;
        const rotation = up ? (up.fx < 0.25 ? 90 : up.fx > 0.75 ? 270 : up.fy > 0.75 ? 180 : null) : null;
        restyle(br.cell, { rotation });
        const h = model.getGeometry(br.cell).height;
        const w = model.getGeometry(br.cell).width;
        const turned = rotation === 90 || rotation === 270;
        const cy = barBottom(e.bus) + DROP + (e.sw ? 50 : 0) + (turned ? w : h) / 2;
        moveVertex(br.cell, ex, cy);
        if (up) {
            const p = pinAt(model.getGeometry(br.cell), up.fx, up.fy, rotation || 0);
            moveVertex(br.cell, ex + (ex - p.x), cy);
        }
        if (turned) named.set(br.cell, 'right');
        routeTerm(e, ex, barBottom(e.bus) + SWITCH_DROP, br.cell, up);
        // Its pin toward the other bar, where the wire leaves it.
        const g = model.getGeometry(br.cell);
        const exit = down ? pinAt(g, down.fx, down.fy, rotation || 0) : { x: ex, y: g.y + g.height };
        const otherY = sameRow ? barBottom(o.bus) : barTop(o.bus);
        const pts = [{ x: ox, y: chY }, { x: exit.x, y: chY }];        // from the other bar's end
        if (o.sw) {
            placeSwitch(o.sw, ox, otherY + (chY > otherY ? SWITCH_DROP : -SWITCH_DROP), true);
            legRoute(o.legs[1], o.bus, ox, o.sw, null, []);
            const ends = down ? new Map([[br.cell, down]]) : new Map();
            const fromSw = o.legs[0].source === o.sw;
            route(o.legs[0], ends, fromSw ? pts : [...pts].reverse(), jumps);
        } else {
            legRoute(o.legs[0], o.bus, ox, br.cell, down, pts);
            restyle(o.legs[0], jumps);
        }
    };
    closures.forEach((br) => {
        if (br.barLevel) {
            routeTie(br);
            return;
        }
        if (br.hangTerm) {
            routeHanging(br);
            return;
        }
        const [ta, tb] = br.terms;
        let upper = ta;
        let lower = tb;
        if (barTop(tb.bus) < barTop(ta.bus) || (barTop(tb.bus) === barTop(ta.bus) && pos.get(tb.bus).x < pos.get(ta.bus).x)) {
            upper = tb;
            lower = ta;
        }
        const sameRow = barTop(upper.bus) === barTop(lower.bus);
        const port = (bus) => {
            const m = measure(bus);
            return pos.get(bus).x + m.portX[Math.min(m.ports++, m.portX.length - 1)];
        };
        const ux = port(upper.bus);
        const lx = port(lower.bus);
        const key = sameRow ? `b${barTop(upper.bus)}` : `t${barTop(lower.bus)}`;
        const lane = lanes.get(key) || 0;
        lanes.set(key, lane + 1);
        const chY = sameRow
            ? barBottom(upper.bus) + DEVICE_ZONE + lane * CHANNEL_STEP
            : barTop(lower.bus) - 70 - lane * CHANNEL_STEP;
        const lowerY = sameRow ? barBottom(lower.bus) : barTop(lower.bus);
        const jumps = { jumpStyle: 'arc', jumpSize: 10 };
        if (br.kind === 'edge') {
            const ends = new Map([[upper.bus, barPin(upper.bus, ux)], [lower.bus, barPin(lower.bus, lx)]]);
            const pts = [{ x: ux, y: chY }, { x: lx, y: chY }];
            route(br.cell, ends, br.cell.source === upper.bus ? pts : [...pts].reverse(), jumps);
            return;
        }
        // The element sits on the channel, between the two legs.
        const midX = (ux + lx) / 2;
        const isLine = shapeOf(br.cell) === 'Line';
        if (isLine) {
            const g = model.getGeometry(br.cell);
            restyle(br.cell, { direction: null, rotation: null });
            moveVertex(br.cell, midX, chY, { w: Math.max(g.width, g.height), h: Math.min(g.width, g.height) });
        } else if (br.kind === 'coupler') {
            placeSwitch(br.cell, midX, chY, false);
        } else {
            // A pinned element (a diode closing a shelf's second feed) turned so each
            // pin faces the leg that reaches it: drawn as built, the catcher's leg
            // crossed the diode to its far pin and the diode pointed the wrong way.
            const pu = pinned(br, upper);
            if (pu) restyle(br.cell, { rotation: (pu.fx < 0.5) !== (ux < lx) ? 180 : null });
            moveVertex(br.cell, midX, chY);
        }
        const leg = (t, x, barY, pin) => {
            const corner = [{ x, y: chY }];
            if (t.sw) {
                const swY = barY + (chY > barY ? SWITCH_DROP : -SWITCH_DROP);
                placeSwitch(t.sw, x, swY, true);
                legRoute(t.legs[1], t.bus, x, t.sw, null, []);
                const ends = pin ? new Map([[br.cell, pin]]) : new Map();
                route(t.legs[0], ends, corner, jumps);
            } else {
                legRoute(t.legs[0], t.bus, x, br.cell, pin, corner);
                restyle(t.legs[0], jumps);
            }
        };
        leg(upper, ux, barBottom(upper.bus), pinned(br, upper));
        leg(lower, lx, lowerY, pinned(br, lower));
    });

    labelWithNames(graph, [...devices.map((d) => d.cell), ...branches.filter((b) => b.kind !== 'edge').map((b) => b.cell)]);
    named.forEach((where, cell) => placeName(graph, cell, where));
    placeResultBoxesBeside(graph, parent);
    // Marks the page as laid out (saved with it), so result boxes the studies
    // add later are kept clear of the drawing too.
    model.setStyle(parent, setStyleKeys(model.getStyle(parent), { sldAutoLayout: 1 }));
    installResultBoxTidy(graph);
    return true;
}

const isResultBox = (style) => /(?:^|;)shapeELXXX=Result/.test(String(style || ''));

/**
 * Move each result box the shortest way off the symbols, bars and other
 * boxes it covers. Every study places its boxes its own way - on a switch,
 * on the middle of a line - and on a laid-out drawing a feeder's switch,
 * line and breaker boxes landed on top of each other.
 */
export function tidyResultBoxes(graph, parent) {
    const model = graph.getModel();
    const view = graph.getView();
    view.validate();
    const s = view.scale || 1;
    const rect = (st) => ({ x: st.x, y: st.y, w: st.width, h: st.height });
    const boxes = [];
    const obstacles = [];
    const visit = (cell, top) => {
        const n = model.getChildCount(cell);
        for (let i = 0; i < n; i++) {
            const child = model.getChildAt(cell, i);
            const st = view.getState(child);
            if (isResultBox(model.getStyle(child))) {
                if (st && st.width > 0 && st.height > 0) boxes.push({ cell: child, r: rect(st) });
            } else if (top && model.isVertex(child) && st && st.width > 0 && st.height > 0) {
                obstacles.push(rect(st));
            }
            visit(child, false);
        }
    };
    visit(parent, true);
    if (!boxes.length) return;
    const pad = 4 * s;
    const hits = (r, list) => list.some((o) => r.x < o.x + o.w + pad && r.x + r.w + pad > o.x
        && r.y < o.y + o.h + pad && r.y + r.h + pad > o.y);
    const steps = [];
    for (let dx = -10; dx <= 10; dx++) {
        for (let dy = -14; dy <= 14; dy++) steps.push({ dx: dx * 24 * s, dy: dy * 18 * s });
    }
    steps.sort((a, b) => Math.hypot(a.dx, a.dy) - Math.hypot(b.dx, b.dy));
    boxes.sort((a, b) => a.r.y - b.r.y || a.r.x - b.r.x);
    const placed = [];
    model.beginUpdate();
    try {
        boxes.forEach((box) => {
            const step = steps.find(({ dx, dy }) => {
                const r = { x: box.r.x + dx, y: box.r.y + dy, w: box.r.w, h: box.r.h };
                return !hits(r, obstacles) && !hits(r, placed);
            }) || { dx: 0, dy: 0 };
            placed.push({ x: box.r.x + step.dx, y: box.r.y + step.dy, w: box.r.w, h: box.r.h });
            if (!step.dx && !step.dy) return;
            const geo = model.getGeometry(box.cell);
            if (!geo) return;
            // A box on a rotated symbol (a switch on a drop) is offset in the
            // symbol's own frame: turn the move back by its rotation.
            const owner = model.getParent(box.cell);
            const m = model.isVertex(owner) ? /(?:^|;)rotation=([-0-9.]+)/.exec(String(model.getStyle(owner) || '')) : null;
            const r = m ? (-parseFloat(m[1]) * Math.PI) / 180 : 0;
            const dx = (step.dx * Math.cos(r) - step.dy * Math.sin(r)) / s;
            const dy = (step.dx * Math.sin(r) + step.dy * Math.cos(r)) / s;
            const next = geo.clone();
            const off = geo.offset || point(0, 0);
            next.offset = point(off.x + dx, off.y + dy);
            model.setGeometry(box.cell, next);
        });
    } finally {
        model.endUpdate();
    }
}

/** Tidy the result boxes of a laid-out page whenever a study adds or fills some. */
export function installResultBoxTidy(graph) {
    if (!graph || graph._sldResultBoxTidy || typeof mxEvent === 'undefined') return;
    const model = graph.getModel();
    let pending = null;
    let busy = false;
    graph._sldResultBoxTidy = true;
    model.addListener(mxEvent.CHANGE, (sender, evt) => {
        if (busy) return;
        const parent = graph.getDefaultParent();
        if (!parent || !/(?:^|;)sldAutoLayout=1/.test(String(model.getStyle(parent) || ''))) return;
        // Any box added, filled or moved: a study fills its boxes, then may
        // move them, and the pass waits until it is done.
        const changes = (evt && evt.getProperty('edit') && evt.getProperty('edit').changes) || [];
        const touched = changes.some((c) => c && c.cell && isResultBox(model.getStyle(c.cell)));
        if (!touched) return;
        clearTimeout(pending);
        pending = setTimeout(() => {
            busy = true;
            try {
                tidyResultBoxes(graph, graph.getDefaultParent());
            } catch (err) {
                console.warn('Result box tidy failed', err);
            } finally {
                busy = false;
            }
        }, 250);
    });
}

// A page laid out earlier and opened again keeps its tidy result boxes.
(function watchEditor() {
    if (typeof window === 'undefined') return;
    const app = window.App;
    const ui = app && (app._editorUi || app._instance);
    const graph = ui && ui.editor && ui.editor.graph;
    if (graph) installResultBoxTidy(graph);
    else setTimeout(watchEditor, 1000);
}());

/**
 * Result boxes beside their connection rather than on it: centred, they hid
 * the line and the symbol at its end, and so did the results that fill them.
 */
function placeResultBoxesBeside(graph, parent) {
    const model = graph.getModel();
    // Where an edge meets a cell: its docking pin if it has one, else the
    // centre. A bar's centre can be far along it from where a drop lands.
    const end = (edge, cell, prefix) => {
        const g = cell && model.getGeometry(cell);
        if (!g) return null;
        const style = String(model.getStyle(edge) || '');
        const f = (k) => {
            const m = new RegExp(`(?:^|;)${prefix}${k}=([-0-9.]+)`).exec(style);
            return m ? parseFloat(m[1]) : 0.5;
        };
        return { x: g.x + g.width * f('X'), y: g.y + g.height * f('Y') };
    };
    (graph.getChildCells(parent, false, true) || []).forEach((edge) => {
        const boxes = (graph.getChildCells(edge, true, false) || [])
            .filter((k) => /shapeELXXX=Result/.test(String(k.style || '')));
        if (!boxes.length) return;
        const pts = [end(edge, edge.source, 'exit'), ...((model.getGeometry(edge).points) || []),
            end(edge, edge.target, 'entry')].filter(Boolean);
        if (pts.length < 2) return;
        const span = (k) => Math.max(...pts.map((p) => p[k])) - Math.min(...pts.map((p) => p[k]));
        const vertical = span('y') >= span('x');
        // A three-winding transformer's lower legs run 24 px apart: its box
        // goes outside them, to the left.
        const left = [edge.source, edge.target].some((c) => shapeOf(c) === 'Three Winding Transformer');
        boxes.forEach((box) => {
            const geo = model.getGeometry(box).clone();
            geo.offset = vertical
                ? point(left ? -geo.width - 8 : 8, -geo.height / 2)
                : point(-geo.width / 2, 8);
            model.setGeometry(box, geo);
        });
    });
}

/**
 * An element's name to the right of its symbol, or above it. The name is a
 * child cell, and a child's place turns with a turned symbol while its text
 * does not: anchored at the centre, it is pushed out by spacing, in the page's
 * own directions. Under a symbol turned onto a drop it ran across it.
 */
function placeName(graph, cell, where) {
    const model = graph.getModel();
    const name = attr(cell, 'name');
    const label = (graph.getChildCells(cell, true, false) || []).find((k) => typeof k.value === 'string' && k.value === name);
    const g = model.getGeometry(cell);
    if (!label || !label.geometry || !g) return;
    const geo = label.geometry.clone();
    geo.relative = true;
    geo.x = 0.5;
    geo.y = 0.5;
    geo.width = 0;
    geo.height = 0;
    geo.offset = point(0, 0);
    // A symbol turned onto a drop is as wide, across the page, as it was high;
    // one on a tie lies as drawn.
    const right = Math.round(g.height / 2 + 8);
    const above = Math.round(g.height / 2 + 6);
    model.setStyle(label, where === 'right'
        ? `text;html=1;align=left;verticalAlign=middle;spacingLeft=${right};fontSize=11;resizable=0;movable=0;`
        : `text;html=1;align=center;verticalAlign=bottom;spacingBottom=${above};fontSize=11;resizable=0;movable=0;`);
    model.setGeometry(label, geo);
}

/**
 * Each element labelled with its own name: generators, static generators and
 * the grid read "Generator", "Static Generator", "External Grid", and
 * transformers carried no name at all.
 */
function labelWithNames(graph, cells) {
    const model = graph.getModel();
    cells.forEach((cell) => {
        const name = attr(cell, 'name');
        if (!name || /^mxCell[#_]\d+$/.test(name) || shapeOf(cell) === 'Switch' || shapeOf(cell) === 'Line') return;
        const labels = (graph.getChildCells(cell, true, false) || []).filter((k) => typeof k.value === 'string');
        const named = labels.find((k) => k.value === name);
        if (named) return;
        const generic = labels.find((k) => DEFAULT_LABELS.has(k.value));
        if (generic) {
            model.setValue(generic, name);
            return;
        }
        // A transformer's to the right of the symbol, clear of its drops; the
        // rest under it, where the other devices have theirs.
        const beside = /Transformer/.test(shapeOf(cell));
        const label = beside
            ? graph.insertVertex(cell, null, name, 1, 0.5, 0, 0,
                'text;html=1;align=left;verticalAlign=middle;spacingLeft=8;fontSize=10;resizable=0;movable=0;', true)
            : graph.insertVertex(cell, null, name, 0.5, 1, 0, 0,
                'text;html=1;align=center;verticalAlign=top;fontSize=11;resizable=0;movable=0;', true);
        if (label && label.geometry) {
            const geo = label.geometry.clone();
            geo.relative = true;
            geo.offset = point(beside ? 4 : 0, beside ? 0 : 4);
            model.setGeometry(label, geo);
        }
    });
}
