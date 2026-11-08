// StabilityStudyDialogs.js - settings for the critical clearing time, the contingency batch, PV and QV curves, and parameter sweeps
import { Dialog } from '../Dialog.js';

function attr(cell, name) {
    const attrs = cell?.value?.attributes;
    if (!attrs) return null;
    for (let i = 0; i < attrs.length; i++) {
        if (attrs[i].nodeName === name) return attrs[i].nodeValue;
    }
    return null;
}

/** The bus a device is drawn on. */
function busOf(cell) {
    for (const edge of cell.edges || []) {
        const other = edge.source === cell ? edge.target : edge.source;
        if ((other?.getStyle?.() || '').includes('shapeELXXX=Bus')) return other.mxObjectId?.replace('#', '_') || String(other.id);
    }
    return '';
}

/** The drawing's buses, the names its other elements are sent by, and the first generator's bus, for pickers. */
export function drawnElements(graph) {
    const buses = [];
    const elements = [];
    let generatorBus = '';
    if (!graph?.getModel) return { buses, elements, generatorBus };
    const cells = graph.getModel().getChildCells(graph.getDefaultParent(), true, true) || [];
    for (const cell of cells) {
        const style = cell.getStyle?.() || '';
        if (style.includes('Result')) continue;
        const match = /shapeELXXX=([^;]+)/.exec(style);
        if (!match) continue;
        const kind = match[1];
        const value = cell.mxObjectId?.replace('#', '_') || String(cell.id);
        const label = attr(cell, 'name') || value;
        if (kind === 'Bus' || kind === 'Busbar') buses.push({ value, label });
        if (kind !== 'NotEditableLine') elements.push({ value, label: `${label} (${kind})` });
        if (kind === 'Generator' && !generatorBus) generatorBus = busOf(cell);
    }
    return { buses, elements, generatorBus };
}

class StudyDialog extends Dialog {
    constructor(editorUi, title, button, width = 680) {
        super(title, button);
        this.useStudyModalShell = true;
        this.studyModalBoxWidth = width;
        this.ui = editorUi || window.App?.main?.editor?.editorUi;
        this.graph = this.ui?.editor?.graph || window.App?.main?.editor?.graph;
    }

    /** Values keyed by parameter id, as the base Dialog returns them in order. */
    getFormValues() {
        const values = super.getFormValues();
        const ids = this.parameters.filter((p) => p.type !== 'section').map((p) => p.id);
        return Object.fromEntries(ids.map((id, i) => [id, values[i]]));
    }
}

const ANDES_BASE = [
    { id: 'frequency', label: 'System frequency (Hz)', type: 'number', value: '50', min: '1', step: '1' },
    { id: 'sn_mva', label: 'System base (MVA)', type: 'number', value: '100', min: '1', step: '1' },
    {
        id: 'load_model', label: 'Loads in the run', type: 'select',
        options: [{ value: 'impedance', label: 'Constant impedance', default: true }, { value: 'power', label: 'Constant power' }]
    },
    {
        id: 'motor_model', label: 'Motors in the run', type: 'select',
        options: [{ value: 'static', label: 'Static loads at their load-flow power', default: true }, { value: 'dynamic', label: 'Induction machines (ANDES Motor3): their slip and inertia, stalling if the voltage falls too long' }]
    }
];

export class CriticalClearingDialog extends StudyDialog {
    constructor(editorUi) {
        super(editorUi, 'Critical Clearing Time (ANDES)', 'Find It');
        const { buses, generatorBus } = drawnElements(this.graph);
        this.parameters = [
            ...ANDES_BASE,
            { id: 'fault_section', label: 'The fault', type: 'section', subtitle: 'A bolted three-phase fault at this bus, applied at 1 s.' },
            // The first generator's bus by default: an external grid's bus is held at its voltage in ANDES, so a fault there does nothing.
            {
                id: 'fault_bus', label: 'Faulted bus', type: 'select', options: buses.length ? buses : [{ value: '', label: '(no bus drawn)' }],
                value: buses.some((b) => b.value === generatorBus) ? generatorBus : ''
            },
            { id: 'search_section', label: 'The search', type: 'section', subtitle: 'A ladder of durations first, so that a case holding again above the first failure is seen, then bisection.' },
            { id: 'cct_max_s', label: 'Longest fault tried (s)', type: 'number', value: '1.0', min: '0.01', step: '0.05' },
            { id: 'cct_ladder', label: 'Steps in the first ladder', type: 'number', value: '8', min: '2', step: '1' },
            { id: 'cct_tolerance_s', label: 'Tolerance (s)', type: 'number', value: '0.01', min: '0.001', step: '0.005' },
            { id: 'cct_watch_s', label: 'Watched after clearing (s)', type: 'number', value: '5', min: '1', step: '1' }
        ];
    }

    getDescription() {
        return 'The longest fault at a bus the system survives: every machine in synchronism and the buses still fed back above 0.8 pu. Each step is a full transient stability run, so a search takes a dozen or more.';
    }
}

export class ContingencyBatchDialog extends StudyDialog {
    constructor(editorUi) {
        super(editorUi, 'Dynamic Contingency Batch (ANDES)', 'Run Batch');
        this.parameters = [
            ...ANDES_BASE,
            { id: 'list_section', label: 'Contingencies', type: 'section', subtitle: 'Auto: every line out, every generator tripped, and a bolted fault at every bus. Or a JSON list of {"name", "type": line | gen | fault, "element", "clear_s"}.' },
            { id: 'contingencies', label: 'List (auto, or JSON)', type: 'text', value: 'auto' },
            { id: 'clear_s', label: 'Fault clearing time (s)', type: 'number', value: '0.1', min: '0.01', step: '0.01' },
            { id: 'event_t_s', label: 'Event time (s)', type: 'number', value: '1.0', min: '0.1', step: '0.1' },
            { id: 'watch_s', label: 'Watched after the event (s)', type: 'number', value: '5', min: '1', step: '1' }
        ];
    }

    getDescription() {
        return 'Each contingency as its own transient stability run, one summary with the failures first: whether the run reached its end, any machine lost synchronism, and the lowest voltage at its end.';
    }
}

export class VoltageStabilityDialog extends StudyDialog {
    constructor(editorUi) {
        super(editorUi, 'Voltage Stability: PV and QV Curves', 'Trace Curve');
        const { buses } = drawnElements(this.graph);
        this.parameters = [
            { id: 'frequency', label: 'Frequency (Hz)', type: 'select', options: [{ value: '50', label: '50 Hz', default: true }, { value: '60', label: '60 Hz' }] },
            {
                id: 'curve', label: 'Curve', type: 'select',
                options: [{ value: 'pv', label: 'PV: all loads raised together to the nose', default: true }, { value: 'qv', label: 'QV: reactive margin at one bus' }]
            },
            { id: 'pv_section', label: 'PV curve', type: 'section', subtitle: 'Each load at its own power factor; the slack bus takes the rise unless generators scale too. The first line or transformer past its rating is reported as well.' },
            { id: 'step', label: 'Load factor step', type: 'number', value: '0.1', min: '0.001', step: '0.05' },
            { id: 'tolerance', label: 'Nose found to (load factor)', type: 'number', value: '0.002', min: '0.0001', step: '0.001' },
            { id: 'lambda_max', label: 'Stop at this many times the drawn load', type: 'number', value: '20', min: '1', step: '1' },
            { id: 'scale_gens', label: 'Generators', type: 'select', options: [{ value: 'false', label: 'Hold their set power', default: true }, { value: 'true', label: 'Scale with the load' }] },
            { id: 'q_limits', label: 'Generators’ reactive limits', type: 'select', options: [{ value: 'true', label: 'Held: a machine at its limit lets its voltage go', default: true }, { value: 'false', label: 'Ignored' }] },
            { id: 'lower_branch', label: 'Past the nose', type: 'select', options: [{ value: 'true', label: 'Trace the lower branch', default: true }, { value: 'false', label: 'Stop at the nose' }] },
            { id: 'lower_v_step_pu', label: 'Lower branch: voltage step (pu)', type: 'number', value: '0.02', min: '0.001', step: '0.01' },
            { id: 'lambda_lower_min', label: 'Lower branch: down to load factor', type: 'number', value: '0.3', min: '0', step: '0.1' },
            { id: 'qv_section', label: 'QV curve', type: 'section', subtitle: 'A fictitious generator holds the bus’s voltage, stepped down; the reactive power it supplies is the curve.' },
            { id: 'qv_bus', label: 'Bus', type: 'select', options: buses.length ? buses : [{ value: '', label: '(no bus drawn)' }] },
            { id: 'v_max_pu', label: 'From (pu)', type: 'number', value: '1.1', min: '0.5', step: '0.05' },
            { id: 'v_min_pu', label: 'Down to (pu)', type: 'number', value: '0.4', min: '0.05', step: '0.05' },
            { id: 'v_step_pu', label: 'Step (pu)', type: 'number', value: '0.02', min: '0.001', step: '0.01' }
        ];
    }

    getDescription() {
        return 'By load flow, the drawn generators held to their reactive limits (each reported where it reaches one). Past the nose, the lower branch: the weakest bus’s voltage stepped down and the load factor found for each. Run it again with an element out for N-1.';
    }
}

export const SWEEPABLE = [
    { value: 'EmtStudy Parameters', label: 'EMT study' },
    { value: 'VoltageStabilityPandaPower Parameters', label: 'Voltage stability (PV / QV)' },
    { value: 'TransientStabilityAndes Parameters', label: 'Transient stability (ANDES)' },
    { value: 'CriticalClearingAndes Parameters', label: 'Critical clearing time' },
    { value: 'EigenvalueAndes Parameters', label: 'Eigenvalues' }
];

export class ParameterSweepDialog extends StudyDialog {
    constructor(editorUi) {
        super(editorUi, 'Parameter Sweep', 'Run Sweep', 760);
        const { elements } = drawnElements(this.graph);
        const example = (elements.find((e) => e.label.endsWith('(Line)')) || elements[0])?.value || 'Line_1';
        this.parameters = [
            { id: 'study_typ', label: 'Study', type: 'select', options: SWEEPABLE },
            { id: 'study_params', label: 'Its settings (JSON, as its dialog sends them)', type: 'text', value: '{"curve": "pv"}' },
            { id: 'axes_section', label: 'What to vary', type: 'section', subtitle: `A JSON list of {"element": a drawn element's name, or "@study" for a study setting, "field", "values": [...]}. Every combination runs. Element names: ${elements.slice(0, 6).map((e) => e.value).join(', ')}${elements.length > 6 ? ', ...' : ''}` },
            { id: 'axes', label: 'Axes', type: 'text', value: `[{"element": "${example}", "field": "length_km", "values": [1, 2, 5]}]` },
            { id: 'metrics', label: 'Results to tabulate (dotted paths, comma-separated)', type: 'text', value: 'voltage_stability.nose.p_total_mw' },
            { id: 'max_runs', label: 'At most this many runs', type: 'number', value: '200', min: '1', step: '10' }
        ];
    }

    getDescription() {
        return 'The same study for each combination of values, through the application’s own entry point, one table back. A run that fails is reported in its row and the rest go on.';
    }
}

if (typeof window !== 'undefined') {
    Object.assign(window, { CriticalClearingDialog, ContingencyBatchDialog, VoltageStabilityDialog, ParameterSweepDialog });
}
