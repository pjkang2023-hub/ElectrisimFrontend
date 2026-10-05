// dcPayload.js - payload rows for DC elements: DC Bus, Load DC, Source DC, VSC,
// B2B VSC and DC Line, shared by both payload builders (loadFlow.js and
// networkDataPreparation.js) so every study sends them the same way.
//
// A VSC joins one AC bus and one DC bus; a DC Line joins two DC buses (a DC
// cable, pandapower line_dc) or two AC buses (an HVDC link, pandapower dcline).
// Each connection is read from the drawing, by the kind of bus at the other end
// of each edge: the payload used to send a VSC's AC bus only, and a DC line no
// buses at all, so the backend left both out.

export const DC_COMPONENT_TYPES = ['DC Bus', 'Load DC', 'Source DC', 'VSC', 'B2B VSC', 'DC Line', 'DC Capacitor', 'DC Breaker'];

// What a DC breaker can switch, by the shape at its other side.
const DC_BREAKER_TARGETS = {
    'DC Bus': 'bus_dc', 'DC Line': 'line_dc', 'VSC': 'vsc', 'B2B VSC': 'b2b_vsc',
    'Load DC': 'load_dc', 'Source DC': 'source_dc'
};

function shapeOf(cell) {
    const m = String(cell?.style || '').match(/shapeELXXX=([^;]+)/);
    return m ? m[1] : '';
}

export const isDcBusCell = cell => shapeOf(cell) === 'DC Bus';
export const isAcBusCell = (cell) => {
    if (!cell || cell.edge) return false;
    const shape = shapeOf(cell);
    if (shape) return shape === 'Bus';
    return String(cell.style || '').includes('shape=mxgraph.electrical.transmission.busbar');
};

const busKey = cell => String(cell?.mxObjectId || cell?.id || '').replace('#', '_');

function attr(cell, name, fallback = undefined) {
    const v = cell?.value?.getAttribute ? cell.value.getAttribute(name) : null;
    return v === null || v === undefined ? fallback : v;
}

function displayName(cell) {
    return attr(cell, 'name') || busKey(cell);
}

function opposite(edge, cell) {
    if (edge.source === cell) return edge.target;
    if (edge.target === cell) return edge.source;
    return null;
}

function edgesOf(cell, model) {
    if (Array.isArray(cell.edges) && cell.edges.length) return cell.edges;
    return (model?.getEdges && model.getEdges(cell)) || [];
}

/**
 * The buses wired to an element, by kind, each with the x (0..1) of the pin
 * it uses on the element when the drawing records one.
 */
export function connectedBuses(cell, model) {
    const ac = [];
    const dc = [];
    edgesOf(cell, model).forEach((edge) => {
        let other = opposite(edge, cell);
        if (!other) return;
        // Wired through a DC breaker: the bus beyond it.
        if (shapeOf(other) === 'DC Breaker') {
            const breaker = other;
            other = null;
            edgesOf(breaker, model).forEach((e2) => {
                const beyond = e2 === edge ? null : opposite(e2, breaker);
                if (!other && beyond && beyond !== cell && (isDcBusCell(beyond) || isAcBusCell(beyond))) other = beyond;
            });
            if (!other) return;
        }
        const style = String(edge.style || '');
        const key = edge.source === cell ? 'exitX' : 'entryX';
        const m = style.match(new RegExp(`${key}=([0-9.]+)`));
        let pinX = m ? Number(m[1]) : null;
        if (pinX === null) {
            // No pin recorded: which side of the element the bus lies on.
            const g = cell.geometry;
            const og = other.geometry;
            if (g && og) pinX = (og.x + og.width / 2) < (g.x + g.width / 2) ? 0 : 1;
        }
        const entry = { cell: other, key: busKey(other), pinX };
        if (isDcBusCell(other)) dc.push(entry);
        else if (isAcBusCell(other)) ac.push(entry);
    });
    const byPin = (a, b) => (a.pinX ?? 0.5) - (b.pinX ?? 0.5);
    ac.sort(byPin);
    dc.sort(byPin);
    return { ac, dc };
}

function common(cell, typ) {
    return { typ, name: busKey(cell), id: cell.id, userFriendlyName: displayName(cell) };
}

function inService(cell) {
    const v = attr(cell, 'in_service');
    return v === undefined || v === null || v === '' ? undefined : v;
}

function withOptional(row, cell, names) {
    names.forEach((n) => {
        const v = attr(cell, n);
        if (v !== undefined && v !== null && v !== '') row[n] = v;
    });
    return row;
}

/**
 * {arrayKey, row} for a DC element, or null when the cell is not one.
 * ``counters`` numbers each kind, as the builders number every element.
 */
export function buildDcPayloadRow(cell, componentType, counters, model) {
    const next = (k) => {
        const n = counters[k] || 0;
        counters[k] = n + 1;
        return n;
    };
    switch (componentType) {
    case 'DC Bus':
        return {
            arrayKey: 'dcBus',
            row: withOptional({ ...common(cell, `DC Bus${next('dcBus')}`), vn_kv: attr(cell, 'vn_kv', '0') },
                cell, ['in_service', 'cost_per_unit_by_currency'])
        };
    case 'Load DC':
    case 'Source DC': {
        const { dc, ac } = connectedBuses(cell, model);
        const isLoad = componentType === 'Load DC';
        const row = {
            ...common(cell, isLoad ? `Load DC${next('loadDc')}` : `Source DC${next('sourceDc')}`),
            // A DC bus, or - drawn on an AC bus by mistake - that bus, which the backend reports.
            bus: (dc[0] || ac[0])?.key || null,
        };
        if (isLoad) {
            row.p_mw = attr(cell, 'p_mw', '0');
            withOptional(row, cell, ['load_model', 'share_p_percent', 'share_i_percent', 'share_r_percent',
                'v_min_pu', 'filter_l_mh', 'filter_c_uf']);
        } else {
            row.vm_pu = attr(cell, 'vm_pu', '1.0');
            withOptional(row, cell, ['r_sc_mohm', 'l_sc_uh']);
        }
        return { arrayKey: isLoad ? 'loadDc' : 'sourceDc', row: withOptional(row, cell, ['in_service', 'cost_per_unit_by_currency']) };
    }
    case 'DC Breaker': {
        // Its DC bus, and what is on its other side.
        const sides = edgesOf(cell, model).map(e => opposite(e, cell)).filter(Boolean);
        const busSide = sides.find(isDcBusCell) || null;
        const other = sides.find(o => o !== busSide) || null;
        const row = {
            ...common(cell, `DC Breaker${next('dcBreaker')}`),
            bus: busSide ? busKey(busSide) : (sides[0] ? busKey(sides[0]) : null),
            element: other ? busKey(other) : null,
            et: other ? (DC_BREAKER_TARGETS[shapeOf(other)] || shapeOf(other) || null) : null,
            closed: attr(cell, 'closed', 'true'),
        };
        return {
            arrayKey: 'dcBreaker',
            row: withOptional(row, cell, ['breaker_type', 'rated_voltage_kv', 'rated_current_ka', 'breaking_capacity_ka',
                'opening_time_ms', 'limiting_inductance_mh', 'arrester_clamp_kv', 'arrester_energy_kj',
                'cost_per_unit_by_currency'])
        };
    }
    case 'DC Capacitor': {
        const { dc, ac } = connectedBuses(cell, model);
        const row = {
            ...common(cell, `DC Capacitor${next('dcCapacitor')}`),
            bus: (dc[0] || ac[0])?.key || null,
            c_mf: attr(cell, 'c_mf', '0'),
            esr_mohm: attr(cell, 'esr_mohm', '0'),
            esl_uh: attr(cell, 'esl_uh', '0'),
        };
        return { arrayKey: 'dcCapacitor', row: withOptional(row, cell, ['in_service', 'cost_per_unit_by_currency']) };
    }
    case 'VSC':
    case 'B2B VSC': {
        const { ac, dc } = connectedBuses(cell, model);
        const isB2b = componentType === 'B2B VSC';
        const row = {
            ...common(cell, isB2b ? `B2B VSC${next('B2BVSC')}` : `VSC${next('VSC')}`),
            bus: ac[0]?.key || '',
            r_ohm: attr(cell, 'r_ohm', '0.01'),
            x_ohm: attr(cell, 'x_ohm', '0.1'),
            r_dc_ohm: attr(cell, 'r_dc_ohm', '0.01'),
            control_mode_ac: attr(cell, 'control_mode_ac', 'vm_pu'),
            control_value_ac: attr(cell, 'control_value_ac', '1.0'),
            control_mode_dc: attr(cell, 'control_mode_dc', 'p_mw'),
            control_value_dc: attr(cell, 'control_value_dc', '0.0'),
        };
        if (isB2b && dc.length >= 2) {
            // Plus and minus poles, in pin order.
            row.bus_dc_plus = dc[0].key;
            row.bus_dc_minus = dc[1].key;
        } else {
            row.bus_dc = dc[0]?.key || '';
        }
        const svc = inService(cell);
        if (svc !== undefined) row.in_service = svc;
        return { arrayKey: isB2b ? 'B2BVSC' : 'VSC', row: withOptional(row, cell, ['cost_per_unit_by_currency']) };
    }
    case 'DC Line': {
        let from = null;
        let to = null;
        if (cell.edge) {
            // Drawn as a connector (the importer draws it so).
            from = cell.source ? busKey(cell.source) : null;
            to = cell.target ? busKey(cell.target) : null;
        } else {
            const { ac, dc } = connectedBuses(cell, model);
            const ends = dc.length >= 2 ? dc : (ac.length >= 2 ? ac : [...dc, ...ac]);
            from = ends[0]?.key || null;
            to = ends[1]?.key || null;
        }
        const row = { ...common(cell, `DC Line${next('dcLine')}`), busFrom: from, busTo: to };
        withOptional(row, cell, [
            // A DC cable between DC buses (line_dc)
            'length_km', 'r_ohm_per_km', 'max_i_ka', 'l_mh_per_km', 'c_uf_per_km',
            // An HVDC link between AC buses (dcline)
            'p_mw', 'loss_percent', 'loss_mw', 'vm_from_pu', 'vm_to_pu',
            'max_p_mw', 'min_q_from_mvar', 'max_q_from_mvar', 'min_q_to_mvar', 'max_q_to_mvar',
            'opf_marginal_cost_eur_per_mwh', 'opf_cp2_eur_per_mw2', 'opf_cost_currency',
            'in_service', 'cost_per_unit_by_currency'
        ]);
        return { arrayKey: 'dcLine', row };
    }
    default:
        return null;
    }
}
