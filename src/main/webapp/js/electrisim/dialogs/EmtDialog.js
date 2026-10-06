// EmtDialog.js - Dialog for the EMT study of the DC networks
import { Dialog } from '../Dialog.js';
import { ensureSubscriptionFunctions } from '../ensureSubscriptionFunctions.js';

// The last settings, kept in this browser.
export const EMT_SETTINGS_KEY = 'electrisim.emt.settings';

function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(EMT_SETTINGS_KEY) || 'null');
        return saved && typeof saved === 'object' ? saved : {};
    } catch (e) {
        return {};
    }
}

function saveSettings(values) {
    try {
        localStorage.setItem(EMT_SETTINGS_KEY, JSON.stringify(values));
    } catch (e) {
        // Private windows and blocked storage: the dialog opens with its defaults.
    }
}

/** The cells drawn as ``shape``, as {value: cell id, label: name}. */
function cellOptions(graph, shape) {
    const model = graph?.getModel?.();
    if (!model) return [];
    const re = new RegExp(`shapeELXXX=${shape}(;|$)`);
    return Object.values(model.cells || {})
        .filter(c => c.vertex && re.test(String(c.style || '')))
        .map(c => ({
            value: String(c.id),
            label: (c.value && c.value.getAttribute ? c.value.getAttribute('name') : '') || String(c.id)
        }))
        .sort((a, b) => a.label.localeCompare(b.label));
}

export class EmtDialog extends Dialog {
    constructor(editorUi) {
        super('EMT Study', 'Calculate');

        this.useStudyModalShell = true;
        this.studyModalBoxWidth = 640;

        this.ui = editorUi || window.App?.main?.editor?.editorUi;
        this.graph = this.ui?.editor?.graph;

        this.parameters = [
            { id: 'ac_fault_section', label: 'An AC fault', type: 'section', subtitle: 'Through a resistance from each faulted phase to a star point, grounded through the same resistance for a ground fault.' },
            {
                id: 'ac_fault_bus',
                label: 'Faulted AC bus',
                type: 'select',
                options: [{ value: 'none', label: 'None', default: true }, ...cellOptions(this.graph, 'Bus')]
            },
            {
                id: 'ac_fault_type',
                label: 'Fault type',
                type: 'select',
                options: [
                    { value: 'abcg', label: 'Three-phase to ground', default: true },
                    { value: 'abc', label: 'Three-phase' },
                    { value: 'ag', label: 'Single line to ground (phase a)' },
                    { value: 'bc', label: 'Line to line (b-c)' },
                    { value: 'bcg', label: 'Double line to ground (b-c)' }
                ]
            },
            { id: 'ac_fault_resistance_ohm', label: 'Fault resistance (Ω)', type: 'number', value: '0.001', min: '0', step: '0.001' },
            { id: 'ac_fault_time_ms', label: 'Fault time (ms)', type: 'number', value: '20', min: '0', step: '5' },
            { id: 'ac_fault_duration_ms', label: 'Fault duration (ms; 0 stays)', type: 'number', value: '60', min: '0', step: '10' },
            { id: 'fault_section', label: 'A DC fault', type: 'section', subtitle: 'Pole to pole, on a DC bus.' },
            {
                id: 'fault_bus',
                label: 'Faulted DC bus',
                type: 'select',
                options: [{ value: 'none', label: 'None', default: true }, ...cellOptions(this.graph, 'DC Bus')]
            },
            { id: 'fault_time_ms', label: 'Fault time (ms)', type: 'number', value: '5', min: '0', step: '0.5' },
            { id: 'fault_resistance_mohm', label: 'Fault resistance (mΩ)', type: 'number', value: '1', min: '0', step: '0.1' },
            { id: 'step_section', label: 'A load step', type: 'section', subtitle: 'A DC load\'s power stepping up or down, to see whether the network settles.' },
            {
                id: 'step_load',
                label: 'DC load',
                type: 'select',
                options: [{ value: 'none', label: 'None', default: true }, ...cellOptions(this.graph, 'Load DC')]
            },
            { id: 'step_percent', label: 'Step (% of its power; negative steps down)', type: 'number', value: '20', step: '5' },
            { id: 'step_time_ms', label: 'Step time (ms)', type: 'number', value: '5', min: '0', step: '0.5' },
            {
                id: 'model_section', label: 'Model',
                subtitle: 'Breakers trip above their trip current and open after their opening time, into their surge arresters. A VSC on the AC network runs under its controls - its DC voltage or power, its reactive power or AC voltage - within its current limit, as an average-value or a switching model (set in its dialog), and blocks on DC undervoltage or overcurrent. DC/DC converter and SST outputs hold their DC voltage until they block on undervoltage; converter inputs are constant-power loads.',
                type: 'section'
            },
            { id: 'vsc_block_pu', label: 'Converters block below (p.u. of their DC voltage)', type: 'number', value: '0.8', min: '0', step: '0.05' },
            { id: 'max_section_km', label: 'Longest pi section of a DC cable (km)', type: 'number', value: '1', min: '0.001', step: '0.1' },
            { id: 'ac_max_section_km', label: 'Longest pi section of an AC line (km)', type: 'number', value: '50', min: '0.001', step: '5' },
            { id: 'run_section', label: 'Simulation', type: 'section', subtitle: 'The step holds until 10 ms after the last event, then is ten times longer (20 µs at most, and a fiftieth of the switching period of a switching VSC at most).' },
            { id: 'time_step_us', label: 'Time step (µs)', type: 'number', value: '1', min: '0.01', step: '0.5' },
            { id: 'duration_ms', label: 'Duration (ms)', type: 'number', value: '50', min: '1', step: '10' }
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
            } else if (param.type !== 'section') {
                param.value = value;
            }
        });
    }

    getDescription() {
        return '<strong>EMT study: the AC and DC networks</strong><br>' +
            'Voltages and currents in time from the load flow, through a fault or a load step: cables as pi sections, ' +
            'DC loads by their model behind their input filters - so a constant-power load\'s stability shows - and ' +
            'breakers clearing into their surge arresters; the three-phase AC network - grids, lines, transformers by their ' +
            'vector group, loads and generation - from its own steady state, through AC faults of any kind.';
    }

    getFormValues() {
        const values = super.getFormValues();
        const ids = this.parameters.filter(p => p.type !== 'section').map(p => p.id);
        return Object.fromEntries(ids.map((id, i) => [id, values[i]]));
    }

    show(callback) {
        super.show(async (values) => {
            try {
                const hasSubscription = await this.checkSubscriptionStatus();
                if (!hasSubscription) {
                    if (window.showSubscriptionModal) {
                        window.showSubscriptionModal();
                    } else {
                        alert('A subscription is required to use the EMT Study.');
                    }
                    return;
                }
                const params = values && typeof values === 'object' && !Array.isArray(values) ? values : {};
                saveSettings(params);
                if (callback) callback(params);
            } catch (error) {
                console.error('EmtDialog: Error checking subscription status:', error);
                alert('Unable to verify subscription status. Please try again.');
            }
        });
    }

    async checkSubscriptionStatus() {
        try {
            await ensureSubscriptionFunctions();
            if (window.checkSubscriptionStatus) {
                return await window.checkSubscriptionStatus();
            }
            if (window.SubscriptionManager && window.SubscriptionManager.checkSubscriptionStatus) {
                return await window.SubscriptionManager.checkSubscriptionStatus();
            }
            return false;
        } catch (error) {
            console.error('EmtDialog: Error in checkSubscriptionStatus:', error);
            return false;
        }
    }
}
