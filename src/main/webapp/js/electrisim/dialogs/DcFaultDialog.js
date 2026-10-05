// DcFaultDialog.js - Dialog for the DC fault study
import { Dialog } from '../Dialog.js';
import { ensureSubscriptionFunctions } from '../ensureSubscriptionFunctions.js';

// The last settings, kept in this browser.
export const DC_FAULT_SETTINGS_KEY = 'electrisim.dcFault.settings';

function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(DC_FAULT_SETTINGS_KEY) || 'null');
        return saved && typeof saved === 'object' ? saved : {};
    } catch (e) {
        return {};
    }
}

function saveSettings(values) {
    try {
        localStorage.setItem(DC_FAULT_SETTINGS_KEY, JSON.stringify(values));
    } catch (e) {
        // Private windows and blocked storage: the dialog opens with its defaults.
    }
}

/** The DC buses on the diagram, as {value: cell id, label: name}. */
function dcBusOptions(graph) {
    const model = graph?.getModel?.();
    if (!model) return [];
    return Object.values(model.cells || {})
        .filter(c => c.vertex && /shapeELXXX=DC Bus(;|$)/.test(String(c.style || '')))
        .map(c => ({
            value: String(c.id),
            label: (c.value && c.value.getAttribute ? c.value.getAttribute('name') : '') || String(c.id)
        }))
        .sort((a, b) => a.label.localeCompare(b.label));
}

export class DcFaultDialog extends Dialog {
    constructor(editorUi) {
        super('DC Fault Study', 'Calculate');

        this.useStudyModalShell = true;
        this.studyModalBoxWidth = 640;

        this.ui = editorUi || window.App?.main?.editor?.editorUi;
        this.graph = this.ui?.editor?.graph;

        this.parameters = [
            { id: 'fault_section', label: 'Fault', type: 'section' },
            {
                id: 'fault_bus',
                label: 'Faulted DC bus',
                type: 'select',
                options: [
                    { value: 'all', label: 'Each DC bus in turn', default: true },
                    ...dcBusOptions(this.graph)
                ]
            },
            {
                id: 'fault_resistance_mohm',
                label: 'Fault resistance, pole to pole (mΩ)',
                type: 'number', value: '0', min: '0', step: '0.1'
            },
            {
                id: 'fault_angle_deg',
                label: 'AC voltage angle at the fault (°): where the converters\' AC sources are in their cycle',
                type: 'number', value: '0', step: '15'
            },
            {
                id: 'run_section', label: 'Simulation', type: 'section',
                subtitle: 'The step holds until 10 ms, then is ten times longer (20 µs at most). With converters feeding the fault the run lasts three AC periods at least: Ik is the mean over the last one.'
            },
            {
                id: 'time_step_us',
                label: 'Time step (µs)',
                type: 'number', value: '1', min: '0.01', step: '0.5'
            },
            {
                id: 'duration_ms',
                label: 'Duration (ms)',
                type: 'number', value: '200', min: '1', step: '10'
            }
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
        return '<strong>DC fault study</strong><br>' +
            'A pole-to-pole fault on a DC bus, simulated in time from the load flow: DC-link capacitors and ' +
            'load input filters discharge, DC sources feed it behind their internal resistance and inductance ' +
            '(Source DC, Short Circuit tab), and each VSC blocks so its diodes feed it from the AC grid. ' +
            'The current is reported in IEC 61660-1\'s terms - peak i<sub>p</sub>, time to peak t<sub>p</sub>, ' +
            'quasi-steady I<sub>k</sub>, rise and decay time constants τ<sub>1</sub>, τ<sub>2</sub> - but not ' +
            'computed by its method. Each DC breaker is checked on the current through it at its opening time.';
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
                        alert('A subscription is required to use the DC Fault Study.');
                    }
                    return;
                }
                const params = values && typeof values === 'object' && !Array.isArray(values) ? values : {};
                saveSettings(params);
                if (callback) callback(params);
            } catch (error) {
                console.error('DcFaultDialog: Error checking subscription status:', error);
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
            console.error('DcFaultDialog: Error in checkSubscriptionStatus:', error);
            return false;
        }
    }
}
