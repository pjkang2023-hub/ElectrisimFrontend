// ReliabilityDialog.js - Dialog for the reliability study: contingency enumeration over the protection zones
import { Dialog } from '../Dialog.js';
import { parseCellStyle } from '../loadFlow.js';

// The last settings, kept in this browser.
export const RELIABILITY_SETTINGS_KEY = 'electrisim.reliability.settings';

function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(RELIABILITY_SETTINGS_KEY) || 'null');
        return saved && typeof saved === 'object' ? saved : {};
    } catch (e) {
        return {};
    }
}

function saveSettings(values) {
    try {
        localStorage.setItem(RELIABILITY_SETTINGS_KEY, JSON.stringify(values));
    } catch (e) {
        // Private windows and blocked storage: the dialog opens with its defaults.
    }
}

const YES_NO = (yes) => [
    { value: 'true', label: 'Yes', default: yes },
    { value: 'false', label: 'No', default: !yes }
];

const num = (id, label, value, step = 'any') => ({ id, label, type: 'number', value: String(value), step });

// The per-element failure data, kept on the drawing's cells (read by networkDataPreparation's RELIABILITY_ATTRS).
const ELEMENT_KINDS = ['Bus', 'Transformer', 'Line', 'Switch'];
const ELEMENT_FIELDS = [
    { attr: 'rel_failure_rate', label: 'Failures / yr', title: 'Failures per year of the whole element' },
    { attr: 'rel_repair_h', label: 'Repair (h)', title: 'Repair time of the element' },
    { attr: 'rel_p_fail_open', label: 'Fails to open', title: 'A breaker\'s chance of failing to open, per demand', only: 'Switch' }
];

function cellName(cell) {
    const v = cell.value;
    if (v && typeof v.getAttribute === 'function') return v.getAttribute('name') || v.getAttribute('label') || cell.id;
    return (typeof v === 'string' && v.trim()) ? v.trim() : cell.id;
}

function cellAttr(cell, attr) {
    const v = cell.value;
    return v && typeof v.getAttribute === 'function' ? (v.getAttribute(attr) || '') : '';
}

// Every bus, transformer, line and switch on the drawing, by kind then name.
function elementRows(graph) {
    const cells = graph?.getModel?.()?.cells;
    if (!cells) return [];
    const rows = [];
    Object.values(cells).forEach((cell) => {
        const style = cell?.getStyle?.();
        if (!style || !style.includes('shapeELXXX')) return;
        const kind = parseCellStyle(style)?.shapeELXXX;
        if (!ELEMENT_KINDS.includes(kind)) return;
        rows.push({ cell, kind, name: cellName(cell) });
    });
    rows.sort((a, b) => ELEMENT_KINDS.indexOf(a.kind) - ELEMENT_KINDS.indexOf(b.kind) ||
        a.name.localeCompare(b.name, undefined, { numeric: true }));
    return rows;
}

// Write the edited values onto the cells, as one undoable change; blank removes the element's own value.
function writeElementData(graph, edits) {
    if (!graph || !edits.length) return 0;
    const model = graph.getModel();
    let changed = 0;
    model.beginUpdate();
    try {
        edits.forEach(({ cell, attr, value }) => {
            let v = cell.value;
            if (!v || typeof v.getAttribute !== 'function') {
                const node = mxUtils.createXmlDocument().createElement('object');
                node.setAttribute('label', typeof v === 'string' ? v : '');
                v = node;
            } else {
                v = v.cloneNode(true);
            }
            if (value === '') v.removeAttribute(attr); else v.setAttribute(attr, value);
            model.setValue(cell, v);
            changed += 1;
        });
    } finally {
        model.endUpdate();
    }
    return changed;
}

export class ReliabilityDialog extends Dialog {
    constructor(editorUi, graph) {
        super('Reliability', 'Calculate');

        this.useStudyModalShell = true;
        this.studyModalBoxWidth = 680;
        this.ui = editorUi || window.App?.main?.editor?.editorUi;
        this.graph = graph || this.ui?.editor?.graph;
        this._elements = elementRows(this.graph);

        // Defaults: IEEE 493-class planning values, as the C003 reliability model uses them.
        this.parameters = [
            { id: 'rates_section', label: 'Failure rates', type: 'section' },
            num('lam_zone', 'Bus section of a protection zone (per year)', 0.001),
            num('lam_tx', 'Transformer with its tap (per year)', 0.010),
            num('lam_cab_km', 'Cable (per km per year)', 0.020),
            num('t_rep_h', 'Repair time of a zone (h)', 48),
            { id: 'protection_section', label: 'Protection and switching', type: 'section' },
            num('p_bf', 'Breaker fails to open (per demand)', 0.003),
            num('p_rf', 'Main protection fails to operate (per demand)', 0.01),
            { id: 'dup_87', label: 'Duplicated main protection', type: 'select', options: YES_NO(true) },
            num('beta_cc', 'Common-cause share of main-protection failures', 0.10),
            num('restore_min', 'Restoration by switching after a fault (min)', 5),
            { id: 'maint_section', label: 'Maintenance overlap (a fault while another breaker is out)', type: 'section' },
            { id: 'include_maintenance', label: 'Count faults during breaker maintenance', type: 'select', options: YES_NO(true) },
            num('t_maint_h', 'Maintenance per breaker (h per year)', 8),
            num('maint_restore_h', 'Time to return a breaker from maintenance (h)', 4),
            { id: 'sources_section', label: 'Sources and storage', type: 'section' },
            { id: 'forming_storage_backed', label: 'Grid-forming units are storage-backed (battery PCS): they bridge, they do not sustain', type: 'select', options: YES_NO(true) },
            num('storage_mwh', 'Storage each grid-forming unit can give (MWh)', 0.254),
            num('p_forming_mw', 'Power of a grid-forming unit (MW; blank = its rating)', ''),
            num('p_following_mw', 'Power of a grid-following source (MW; blank = its rating)', ''),
            { id: 'backup_trips_gfl', label: 'A backup clearance trips the grid-following fleet (past its ride-through)', type: 'select', options: YES_NO(true) },
            num('p_vrt', 'Share of backup clearances in which the fleet trips', 1.0),
            num('recoverable_factor', 'After a fleet trip, load the forming units recover (x their MVA)', 0.84),
            num('t_rt_min', 'Fleet back from hot standby (min)', 2),
            num('p_cold', 'Share of events whose sources cold-restart', 0.10),
            num('t_cold_h', 'Cold restart (h)', 9),
            { id: 'loads_section', label: 'Loads and value', type: 'section' },
            { id: 'it_loads', label: 'IT (critical) loads, by name, comma-separated (blank: critical loads above 5 MW)', type: 'text', value: '' },
            { id: 'transfer_groups', label: 'Dual-corded load pairs, e.g. IT_cordA+IT_cordB (comma between pairs)', type: 'text', value: '' },
            num('ups_min', 'UPS ride-through of the IT (min)', 0),
            num('aux_shed_max_h', 'Auxiliaries may be shed for interruptions up to (h)', 4),
            num('voll_it', 'Value of lost IT load (EUR/MWh)', 50000),
            num('voll_aux', 'Value of lost auxiliary load (EUR/MWh)', 500),
            { id: 'blackout_section', label: 'Total blackout and black start', type: 'section' },
            num('lam_bo', 'Total blackouts (per year)', 0.05),
            num('black_start_steps', 'Black-start steps', 3, '1'),
            num('p_step', 'Black-start step fails (per step)', 0.02),
            num('t_man_h', 'Manual recovery after a failed black start (h)', 2),
            num('zone_kv', 'Protection zones at and above (kV)', 10),
            { id: 'element_section', label: 'Element failure data', type: 'section',
              subtitle: 'An element\'s own data replaces the defaults above; blank keeps them. Saved on the drawing.' },
            { id: 'element_data', type: 'custom' }
        ];
        this._applySaved(loadSettings());
    }

    _applySaved(saved) {
        this.parameters.forEach((param) => {
            if (!(param.id in saved) || saved[param.id] == null) return;
            const value = String(saved[param.id]);
            if (param.type === 'select') {
                if (param.options.some(o => o.value === value)) {
                    param.options.forEach(o => { o.default = o.value === value; });
                }
            } else if (param.type !== 'section' && param.type !== 'custom') {
                param.value = value;
            }
        });
    }

    getDescription() {
        return '<strong>Reliability</strong><br>' +
            'Expected energy not served, found by enumerating what can go wrong in the network as drawn - in the ' +
            'operating state chosen, if one is. The network is cut into protection zones by its breakers. For every ' +
            'zone: its fault, cleared by its own breakers; each of its breakers sticking (breaker failure opens the ' +
            'next zone too); its main protection failing (the backup clears it past the inverters\' ride-through, so ' +
            'the grid-following fleet trips); and its fault while another breaker is out for maintenance. Each ' +
            'event\'s islands are balanced: an island with no grid-forming source is dead, storage bridges what the ' +
            'sources cannot carry, dual-corded loads move to their other cord. Click an event in the results to see ' +
            'it on the drawing; the workbook download keeps every rate editable.';
    }

    // The element table: one row per bus, transformer, line and switch, filterable; only values changed are written.
    createCustomParameter(param) {
        if (param.id !== 'element_data') return null;
        const wrap = document.createElement('div');
        const hidden = document.createElement('input');
        hidden.type = 'hidden';
        hidden.id = param.id;
        hidden.value = '';
        this.inputs.set(param.id, hidden);
        wrap.appendChild(hidden);
        this._elementInputs = [];

        const rows = this._elements;
        if (!rows.length) {
            const empty = document.createElement('div');
            empty.textContent = 'No buses, transformers, lines or switches on this drawing.';
            Object.assign(empty.style, { fontSize: '13px', color: '#6c757d' });
            wrap.appendChild(empty);
            return wrap;
        }
        const given = rows.filter(r => ELEMENT_FIELDS.some(f => cellAttr(r.cell, f.attr) !== '')).length;

        const details = document.createElement('details');
        details.open = given > 0;
        const summary = document.createElement('summary');
        summary.textContent = `${rows.length} elements` + (given ? `, ${given} with their own data` : ', all at the defaults');
        Object.assign(summary.style, { cursor: 'pointer', fontSize: '13px', color: '#495057', marginBottom: '6px' });
        details.appendChild(summary);

        const search = document.createElement('input');
        search.type = 'search';
        search.placeholder = 'Filter by name or kind…';
        Object.assign(search.style, {
            width: '100%', padding: '6px 10px', border: '1px solid #ced4da', borderRadius: '4px',
            fontSize: '13px', boxSizing: 'border-box', marginBottom: '6px'
        });
        details.appendChild(search);

        const scroller = document.createElement('div');
        Object.assign(scroller.style, { maxHeight: '260px', overflowY: 'auto', border: '1px solid #e9ecef', borderRadius: '4px' });
        const table = document.createElement('table');
        Object.assign(table.style, { width: '100%', borderCollapse: 'collapse', fontSize: '12px' });
        const head = table.createTHead().insertRow();
        ['Element', 'Kind', ...ELEMENT_FIELDS.map(f => f.label)].forEach((text, i) => {
            const th = document.createElement('th');
            th.textContent = text;
            if (i > 1) th.title = ELEMENT_FIELDS[i - 2].title;
            Object.assign(th.style, {
                textAlign: 'left', padding: '4px 6px', position: 'sticky', top: '0',
                background: '#f8f9fa', borderBottom: '1px solid #dee2e6'
            });
            head.appendChild(th);
        });
        const body = table.createTBody();
        rows.forEach((r) => {
            const tr = body.insertRow();
            tr.dataset.filter = `${r.name} ${r.kind}`.toLowerCase();
            [r.name, r.kind].forEach((text) => {
                const td = tr.insertCell();
                td.textContent = text;
                Object.assign(td.style, { padding: '3px 6px', borderBottom: '1px solid #f1f3f5' });
            });
            ELEMENT_FIELDS.forEach((f) => {
                const td = tr.insertCell();
                Object.assign(td.style, { padding: '2px 4px', borderBottom: '1px solid #f1f3f5' });
                if (f.only && f.only !== r.kind) return;
                const input = document.createElement('input');
                input.type = 'number';
                input.step = 'any';
                input.min = '0';
                input.placeholder = 'default';
                input.value = cellAttr(r.cell, f.attr);
                Object.assign(input.style, {
                    width: '90px', padding: '3px 6px', border: '1px solid #ced4da', borderRadius: '3px',
                    fontSize: '12px', boxSizing: 'border-box'
                });
                td.appendChild(input);
                this._elementInputs.push({ cell: r.cell, attr: f.attr, input, was: input.value });
            });
        });
        scroller.appendChild(table);
        details.appendChild(scroller);
        search.addEventListener('input', () => {
            const q = search.value.trim().toLowerCase();
            Array.from(body.rows).forEach((tr) => { tr.style.display = !q || tr.dataset.filter.includes(q) ? '' : 'none'; });
        });
        wrap.appendChild(details);
        return wrap;
    }

    getFormValues() {
        const values = super.getFormValues();
        const ids = this.parameters.filter(p => p.type !== 'section').map(p => p.id);
        const out = Object.fromEntries(ids.map((id, i) => [id, values[i]]));
        delete out.element_data;
        return out;
    }

    // The element values changed in the table, written onto the drawing before the study reads it.
    _writeElementEdits() {
        const edits = (this._elementInputs || [])
            .map(({ cell, attr, input, was }) => ({ cell, attr, value: String(input.value).trim(), was }))
            .filter(e => e.value !== e.was && (e.value === '' || Number.isFinite(Number(e.value))));
        return writeElementData(this.graph, edits);
    }

    show(callback) {
        super.show(async (values) => {
            const params = values && typeof values === 'object' && !Array.isArray(values) ? values : {};
            saveSettings(params);
            this._writeElementEdits();
            if (callback) callback(params);
        });
    }
}
