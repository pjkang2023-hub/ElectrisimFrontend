// importElectrisimLayer.js - draws a spec's DC and microgrid layer onto the
// canvas after its AC network: DC buses, lines, loads, sources and capacitors;
// VSCs, solid-state transformers, DC/DC converters and DC breakers; batteries,
// supercapacitors, flywheels, SOFC systems and PV arrays; the PCS; zigzag
// grounding transformers and their breakers; and the load-profile library.
//
// The backend (/build-model) hands them over as `electrisim_elements`: each
// element's kind, id, name, dialog fields and connections by id (an AC bus
// also by the name its bar carries). Each is drawn as the palette draws it,
// configured as a drop configures it, and wired on the pins dcPayload.js
// reads - an SST's MV on its left pin and its LV DC on its right, a DC/DC
// converter's input on its left - so the payload the diagram sends is the
// spec's.
//
// Layout: a band below the AC drawing, as a tree. Each element joined to an
// AC bus (a converter, a PCS, a grounding transformer or its breaker) heads a
// column under that bus; below it, the DC buses it feeds, then what is on
// them, row by row.

import {
    configureDcBusAttributes, configureLoadDcAttributes, configureSourceDcAttributes, configureDcCapacitorAttributes,
    configureDcBreakerAttributes, configureDcDiodeAttributes, configureDcDcConverterAttributes, configureSstAttributes, configureVscAttributes,
    configureDerAttributes, configureSwitchAttributes, configureDCLineAttributes,
} from './configureAttributes.js';
import { vertexStyleImportedBusbar } from './electricalSymbols.js';
import { getLoadProfileLibrary, setLoadProfileLibrary } from './utils/loadProfileLibrary.js';

const IMG = 'pointerEvents=1;verticalLabelPosition=bottom;shadow=0;dashed=0;align=center;html=1;verticalAlign=top;'
    + 'aspect=fixed;imageAspect=1;fillColor=none;strokeColor=none;shape=image;image=images/electrical/';
const DC_BUS_STYLE = `${vertexStyleImportedBusbar('DC Bus')};strokeWidth=2;strokeColor=#c2410c;`
    + 'verticalLabelPosition=top;verticalAlign=bottom;align=center;fontSize=9';
const EDGE = 'edgeStyle=none;endArrow=none;startArrow=none;html=1;rounded=0;shapeELXXX=NotEditableLine;';
const DC_LINE_EDGE = 'shapeELXXX=DC Line;endArrow=none;startArrow=none;html=1;strokeColor=#c2410c;';
const SOURCES = ['Battery', 'Supercapacitor', 'Flywheel', 'SOFC', 'PV Array'];

// Each kind: its symbol, size, and pins (x, y on the cell) by connection role.
const SYMBOLS = {
    'Load DC': { img: 'sym-load-dc.svg', w: 43, h: 56 },
    'Source DC': { img: 'sym-source-dc.svg', w: 56, h: 56, top: [0.5, 0.05] },
    'DC Capacitor': { img: 'sym-dc-capacitor.svg', w: 43, h: 56 },
    'DC Breaker': { img: 'sym-dc-breaker-closed.svg', w: 56, h: 29 },
    'DC Diode': { img: 'sym-dc-diode.svg', w: 56, h: 29 },
    'DC/DC Converter': { img: 'sym-dc-dc.svg', w: 56, h: 33 },
    'Solid-State Transformer': { img: 'sym-sst.svg', w: 56, h: 41 },
    VSC: { img: 'sym-vsc.svg', w: 56, h: 36 },
    PCS: { img: 'sym-pcs.svg', w: 44, h: 56 },
    'Grounding Transformer': { img: 'sym-grounding-transformer.svg', w: 37, h: 56, top: [0.5, 0] },
    Switch: { img: 'sym-switch-closed.svg', w: 56, h: 29 },
    // Drawn as the palette's symbol only behind a DC breaker; otherwise a connector.
    'DC Line': { img: 'sym-dc-line.svg', w: 56, h: 36 },
    ...Object.fromEntries(SOURCES.map(k => [k, {
        img: { Battery: 'sym-battery.svg', Supercapacitor: 'sym-supercap.svg', Flywheel: 'sym-flywheel.svg',
            SOFC: 'sym-sofc.svg', 'PV Array': 'sym-pv-array.svg' }[k], w: 43, h: 56 }])),
};
const TOP = [0.5, 2 / 64];          // a one-pin element's lead (a DC load, a source, a capacitor)
const SIDE_Y = { 'DC Breaker': 22 / 40, Switch: 22 / 40, 'Solid-State Transformer': 30 / 64 };

const CONFIGURE = {
    'DC Bus': configureDcBusAttributes, 'Load DC': configureLoadDcAttributes, 'Source DC': configureSourceDcAttributes,
    'DC Capacitor': configureDcCapacitorAttributes, 'DC Breaker': configureDcBreakerAttributes,
    'DC Diode': configureDcDiodeAttributes,
    'DC/DC Converter': configureDcDcConverterAttributes, 'Solid-State Transformer': configureSstAttributes,
    VSC: configureVscAttributes, Switch: configureSwitchAttributes, 'DC Line': configureDCLineAttributes,
};

const ROW = 130;        // row pitch
const GAP = 34;         // between siblings
const BUS_H = 12;

function pinsOf(kind, role) {
    // Which pin a connection uses on its element: [x, y].
    const side = SIDE_Y[kind] ?? 0.5;
    switch (kind) {
    case 'VSC': return role === 'bus' ? [0, side] : [1, side];
    case 'Solid-State Transformer': return role === 'bus_mv' ? [0, side] : role === 'bus_lv_dc' ? [1, side] : [0.5, 1];
    case 'DC/DC Converter': return role === 'bus_in' ? [0, side] : [1, side];
    case 'DC Breaker': case 'Switch': return role === 'bus' ? [0, side] : [1, side];
    case 'DC Diode': return role === 'from_bus' ? [0, side] : [1, side];   // anode left, cathode right
    case 'DC Line': return role === 'from_bus' ? [2 / 70, 12 / 48] : [68 / 70, 12 / 48];   // the symbol's two leads
    case 'PCS': return role === 'bus' ? [0.5, 0] : [0.5, 1];
    default: return SYMBOLS[kind]?.top || TOP;
    }
}

function setAll(cell, attributes) {
    if (!cell?.value?.setAttribute) return;
    Object.entries(attributes || {}).forEach(([k, v]) => cell.value.setAttribute(k, String(v)));
}

/**
 * Draw ``layer`` ({elements, load_profiles}) on ``graph`` below what is drawn.
 * ``findAcBus(name)`` returns the AC bus vertex the importer drew under that name.
 * Returns the number of cells added.
 */
export function drawElectrisimLayer(graph, parent, layer, findAcBus) {
    const elements = layer?.elements || [];
    if (layer?.load_profiles && Object.keys(layer.load_profiles).length) {
        setLoadProfileLibrary(graph, { ...getLoadProfileLibrary(graph), ...layer.load_profiles });
    }
    if (!elements.length) return 0;
    const model = graph.getModel();
    const byId = new Map(elements.map(e => [e.id, e]));
    const link = (e, role) => e.connections?.[role]?.id;
    // A DC cable a breaker switches is drawn as the palette's DC Line symbol, wired
    // bus - breaker - cable - bus: a connector's ends are buses, so it cannot carry one.
    const guarded = new Set(elements.filter(e => e.kind === 'DC Breaker').map(e => link(e, 'element'))
        .filter(id => byId.get(id)?.kind === 'DC Line'));

    // --- The tree: each element's parent, by what feeds it ------------------------
    const parentOf = new Map();
    const children = new Map(elements.map(e => [e.id, []]));
    const adopt = (child, parent) => {
        if (!child || !parent || parentOf.has(child) || child === parent || !byId.has(child)) return;
        parentOf.set(child, parent);
        children.get(parent).push(child);
    };
    const acRoots = [];
    // Elements behind a breaker hang from it; a source behind a PCS from the PCS.
    elements.forEach((e) => {
        if (e.kind === 'DC Breaker') adopt(link(e, 'element'), e.id);
        if (e.kind === 'Switch') adopt(link(e, 'element'), e.id);
        if (e.kind === 'PCS' && link(e, 'source')) adopt(link(e, 'source'), e.id);
    });
    elements.forEach((e) => {
        const ac = ['bus', 'bus_mv'].map(r => e.connections?.[r]).find(c => c?.ac_bus_name);
        if (ac && !parentOf.has(e.id) && ['VSC', 'Solid-State Transformer', 'PCS', 'Grounding Transformer', 'Switch'].includes(e.kind)) {
            acRoots.push({ id: e.id, bus: ac.ac_bus_name });
        }
    });
    elements.forEach((e) => {
        // The DC buses a converter feeds hang below it.
        if (e.kind === 'VSC') adopt(link(e, 'bus_dc'), e.id);
        if (e.kind === 'Solid-State Transformer') adopt(link(e, 'bus_lv_dc'), e.id);
        if (e.kind === 'PCS' && !link(e, 'source')) adopt(link(e, 'bus_dc'), e.id);
    });
    elements.forEach((e) => {
        if (e.kind === 'DC/DC Converter') {
            adopt(e.id, link(e, 'bus_in'));
            adopt(link(e, 'bus_out'), e.id);
        } else if (e.kind === 'DC Diode') {
            // Below its anode's bus, its cathode's below it; a second diode into a shelf closes a ring.
            adopt(e.id, link(e, 'from_bus'));
            adopt(link(e, 'to_bus'), e.id);
        } else if (e.kind === 'DC Breaker') {
            adopt(e.id, link(e, 'bus'));
        } else if (['Load DC', 'Source DC', 'DC Capacitor', ...SOURCES].includes(e.kind) && link(e, 'bus')) {
            adopt(e.id, link(e, 'bus'));
        }
    });
    const roots = [...acRoots.map(r => r.id), ...elements.filter(e => !parentOf.has(e.id) && e.kind !== 'DC Line'
        && !acRoots.some(r => r.id === e.id)).map(e => e.id)];

    // --- Sizes and places ------------------------------------------------------------
    const size = (e) => (e.kind === 'DC Bus' ? { w: 120, h: BUS_H } : { w: SYMBOLS[e.kind]?.w || 50, h: SYMBOLS[e.kind]?.h || 50 });
    const width = new Map();
    const span = (id) => {
        const e = byId.get(id);
        const own = size(e).w;
        const kids = children.get(id) || [];
        const sum = kids.reduce((s, k) => s + span(k) + GAP, -GAP);
        const w = Math.max(own, kids.length ? sum : own);
        width.set(id, w);
        return w;
    };
    roots.forEach(span);

    let bottom = 0;
    let left = Infinity;
    graph.getChildCells(parent, true, false).forEach((c) => {
        const g = c.geometry;
        if (!g) return;
        bottom = Math.max(bottom, g.y + g.height);
        left = Math.min(left, g.x);
    });
    if (!Number.isFinite(left)) left = 40;
    const top = bottom + 110;
    const rootX = (r) => {
        const bus = r.bus ? findAcBus(r.bus) : null;
        return bus?.geometry ? bus.geometry.x + bus.geometry.width / 2 : null;
    };
    const ordered = roots.map(id => ({ id, x: rootX(acRoots.find(r => r.id === id) || {}) }))
        .sort((a, b) => (a.x ?? Infinity) - (b.x ?? Infinity));
    const place = new Map();
    let cursor = left;
    ordered.forEach(({ id, x }) => {
        const w = width.get(id);
        const x0 = Math.max(cursor, (x ?? cursor + w / 2) - w / 2);
        const lay = (nid, x1, depth) => {
            const e = byId.get(nid);
            const s = size(e);
            const w1 = width.get(nid);
            const kids = children.get(nid) || [];
            const busW = e.kind === 'DC Bus' ? Math.max(s.w, w1) : s.w;
            place.set(nid, { x: x1 + (w1 - busW) / 2, y: top + depth * ROW + (e.kind === 'DC Bus' ? 20 : 0), w: busW, h: s.h });
            let cx = x1 + (w1 - kids.reduce((sum, k) => sum + width.get(k) + GAP, -GAP)) / 2;
            kids.forEach((k) => { lay(k, cx, depth + 1); cx += width.get(k) + GAP; });
        };
        lay(id, x0, 0);
        cursor = x0 + w + GAP * 2;
    });

    // --- Cells ----------------------------------------------------------------------
    const cell = new Map();
    let added = 0;
    elements.forEach((e) => {
        if (e.kind === 'DC Line' && !guarded.has(e.id)) return;
        const p = place.get(e.id);
        if (!p) return;
        const style = e.kind === 'DC Bus' ? DC_BUS_STYLE : `${IMG}${SYMBOLS[e.kind].img};shapeELXXX=${e.kind}`;
        const v = graph.insertVertex(parent, null, '', p.x, p.y, p.w, p.h, style);
        const options = { name: e.name, ...e.attributes };
        if (CONFIGURE[e.kind]) CONFIGURE[e.kind](graph, v, options);
        else configureDerAttributes(e.kind, graph, v, options);
        setAll(v, options);
        cell.set(e.id, v);
        added += 1;
    });

    // --- Wires, on the pins the payload reads -------------------------------------------
    const wire = (from, fromPin, to, toPin) => {
        if (!from || !to) return;
        const style = `${EDGE}exitX=${fromPin[0]};exitY=${fromPin[1]};exitDx=0;exitDy=0;`
            + `entryX=${toPin[0]};entryY=${toPin[1]};entryDx=0;entryDy=0;`;
        graph.insertEdge(parent, null, '', from, to, style);
        added += 1;
    };
    const busPin = (bus, fromCell, fromPin) => {
        const g = bus.geometry;
        const fg = fromCell.geometry;
        const x = fg.x + fg.width * fromPin[0];
        return [Math.min(Math.max((x - g.x) / g.width, 0.02), 0.98), 0.5];
    };
    elements.forEach((e) => {
        const v = cell.get(e.id);
        if (!v) {
            if (e.kind === 'DC Line') {
                const a = cell.get(link(e, 'from_bus'));
                const b = cell.get(link(e, 'to_bus'));
                if (a && b) {
                    const edge = graph.insertEdge(parent, null, '', a, b, DC_LINE_EDGE);
                    configureDCLineAttributes(graph, edge, { name: e.name, ...e.attributes });
                    setAll(edge, { name: e.name, ...e.attributes });
                    added += 1;
                }
            }
            return;
        }
        const behind = byId.get(parentOf.get(e.id))?.kind;
        Object.entries(e.connections || {}).forEach(([role, c]) => {
            // Behind a breaker, it reaches its bus through the breaker alone.
            if (role === 'bus' && (behind === 'DC Breaker' || behind === 'Switch')) return;
            // A cable behind a breaker: its end at the breaker's bus is the breaker's.
            if ((e.kind === 'DC Line' || e.kind === 'DC Diode') && behind === 'DC Breaker'
                && c.id === link(byId.get(parentOf.get(e.id)), 'bus')) return;
            const pin = pinsOf(e.kind, role);
            let target = c.ac_bus_name ? findAcBus(c.ac_bus_name) : cell.get(c.id);
            if (!target) return;
            const targetKind = byId.get(c.id)?.kind;
            if (c.ac_bus_name || targetKind === 'DC Bus') {
                wire(v, pin, target, busPin(target, v, pin));
            } else if (role === 'source' || role === 'element') {
                // An element behind it (a PCS's source, a breaker's load): its own lead -
                // a cable's the end that faces the breaker's bus.
                const lead = targetKind === 'DC Line' || targetKind === 'DC Diode'
                    ? (link(byId.get(c.id), 'from_bus') === link(e, 'bus') ? 'from_bus' : 'to_bus') : 'bus';
                wire(v, pin, target, pinsOf(targetKind, lead));
            }
        });
    });
    return added;
}
