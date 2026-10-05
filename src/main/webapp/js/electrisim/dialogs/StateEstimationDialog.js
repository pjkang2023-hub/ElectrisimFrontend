// StateEstimationDialog.js - Dialog for the state estimation study (pandapower WLS)
import { Dialog } from '../Dialog.js';
import { ensureSubscriptionFunctions } from '../ensureSubscriptionFunctions.js';

// The last settings and entered measurement table, kept in this browser.
export const STATE_ESTIMATION_SETTINGS_KEY = 'electrisim.stateEstimation.settings';

export function loadStateEstimationSettings() {
    try {
        const raw = localStorage.getItem(STATE_ESTIMATION_SETTINGS_KEY);
        const saved = raw ? JSON.parse(raw) : null;
        return saved && typeof saved === 'object' ? saved : {};
    } catch (e) {
        return {};
    }
}

export function saveStateEstimationSettings(values) {
    try {
        localStorage.setItem(STATE_ESTIMATION_SETTINGS_KEY, JSON.stringify(values));
    } catch (e) {
        // Private windows and blocked storage: the dialog opens with its defaults.
    }
}

const CSV_EXAMPLE = [
    'type,element_type,element,side,value,std_dev',
    'v,bus,Busbar 1,,1.012,0.005',
    'p,line,Line 1,from,4.85,0.15',
    'q,line,Line 1,from,1.22,0.15',
    'p,trafo,Transformer 1,hv,9.7,0.25',
    'p,bus,Busbar 3,,2.1,0.1'
].join('\n');

export class StateEstimationDialog extends Dialog {
    constructor(editorUi) {
        super('State Estimation', 'Estimate');

        this.useStudyModalShell = true;
        this.studyModalBoxWidth = 760;

        this.ui = editorUi || window.App?.main?.editor?.editorUi;
        this.graph = this.ui?.editor?.graph;

        this.parameters = [
            { id: 'measurements_section', label: 'Measurements', type: 'section' },
            {
                id: 'measurement_source',
                label: 'Measurement set',
                type: 'radio',
                options: [
                    { value: 'simulated', label: 'Simulated metering: meters placed by the rules below read the load flow, each with a random error of its accuracy', default: true },
                    { value: 'entered', label: 'Entered measurements: the readings in the table below' }
                ]
            },
            {
                id: 'simulated_section', label: 'Simulated metering', type: 'section',
                subtitle: 'To judge a metering plan: the estimate is compared with the load flow it should recover.'
            },
            {
                id: 'v_meas',
                label: 'Voltage magnitude meters',
                type: 'select',
                options: [
                    { value: 'all', label: 'At every bus', default: true },
                    { value: 'sources', label: 'At buses with an External Grid, generator, static generator or storage' },
                    { value: 'none', label: 'None' }
                ]
            },
            {
                id: 'flow_meas',
                label: 'P and Q flow meters on lines and transformers',
                type: 'select',
                options: [
                    { value: 'all_ends', label: 'At every end', default: true },
                    { value: 'sending_end', label: 'At the from end of lines and the HV side of transformers' },
                    { value: 'none', label: 'None' }
                ]
            },
            {
                id: 'injection_meas',
                label: 'P and Q injection meters at every bus with a load or generation',
                type: 'checkbox',
                value: true
            },
            {
                id: 'v_std_percent',
                label: 'Voltage meter accuracy, standard deviation (%)',
                type: 'number', value: '0.5', min: '0.001', step: '0.1'
            },
            {
                id: 'pq_std_percent',
                label: 'P and Q meter accuracy, standard deviation (% of the branch rating, or of the injection)',
                type: 'number', value: '1', min: '0.001', step: '0.1'
            },
            {
                id: 'add_noise',
                label: 'Add the random meter errors (untick for exact readings)',
                type: 'checkbox',
                value: true
            },
            {
                id: 'seed',
                label: 'Random seed (the same seed gives the same readings)',
                type: 'number', value: '1', min: '0', step: '1'
            },
            {
                id: 'entered_section', label: 'Entered measurements', type: 'section',
                subtitle: 'One reading per row: type (v, p or q), element type (bus, line, trafo or trafo3w), the element name as on the diagram, side (from/to for a line, hv/mv/lv for a transformer, empty at a bus), value (p.u., MW or Mvar) and standard deviation in the same unit. Bus P and Q are in the load convention: consumption positive. The results of a run offer their readings as this table.'
            },
            { id: 'measurements_csv', label: 'Measurement table (CSV)', type: 'custom' },
            {
                id: 'pseudo_measurements',
                label: 'Pseudo-measurements: the drawn loads and generation, at buses without a P or Q reading',
                type: 'checkbox',
                value: true
            },
            {
                id: 'pseudo_std_percent',
                label: 'Pseudo-measurement accuracy, standard deviation (% of the drawn injection)',
                type: 'number', value: '30', min: '1', step: '1'
            },
            { id: 'estimator_section', label: 'Estimator', type: 'section' },
            {
                id: 'estimator',
                label: 'Estimator',
                type: 'radio',
                options: [
                    { value: 'wls', label: 'Weighted least squares (WLS), with the chi-square and largest normalized residual tests', default: true },
                    { value: 'lav', label: 'Least absolute value (LAV): robust to bad data by itself, no residual tests' }
                ]
            },
            {
                id: 'zero_injection',
                label: 'Buses with nothing connected are zero-injection (exact virtual measurements)',
                type: 'checkbox',
                value: true
            },
            {
                id: 'bad_data',
                label: 'Identify and remove bad data, one reading at a time (WLS)',
                type: 'checkbox',
                value: true
            },
            {
                id: 'rn_threshold',
                label: 'Normalized residual threshold for bad data',
                type: 'number', value: '3', min: '1', step: '0.1'
            },
            {
                id: 'chi2_confidence',
                label: 'Chi-square test confidence',
                type: 'select',
                options: [
                    { value: '0.95', label: '95 %', default: true },
                    { value: '0.99', label: '99 %' }
                ]
            }
        ];
        this._applySaved(loadStateEstimationSettings());
    }

    /** The last run's settings, so the measurement table and choices carry over. */
    _applySaved(saved) {
        this.parameters.forEach((param) => {
            if (!(param.id in saved) || saved[param.id] == null) return;
            const value = saved[param.id];
            if (param.type === 'radio') {
                if (param.options.some(o => o.value === value)) {
                    param.options.forEach(o => { o.default = o.value === value; });
                }
            } else if (param.type === 'checkbox') {
                param.value = value === true || value === 'true';
            } else {
                param.value = String(value);
            }
        });
    }

    createCustomParameter(param) {
        const area = document.createElement('textarea');
        area.id = param.id;
        area.rows = 8;
        area.spellcheck = false;
        area.placeholder = CSV_EXAMPLE;
        area.value = param.value || '';
        Object.assign(area.style, {
            width: '100%',
            boxSizing: 'border-box',
            padding: '6px 10px',
            border: '1px solid #ced4da',
            borderRadius: '4px',
            fontSize: '12px',
            fontFamily: 'Consolas, Menlo, monospace',
            resize: 'vertical'
        });
        this.inputs.set(param.id, area);
        return area;
    }

    getDescription() {
        return '<strong>State estimation</strong><br>' +
            'Estimates every bus voltage and angle from a set of measurements by weighted least squares ' +
            '(pandapower). The estimate is tested for bad data with the chi-square test of its objective J, ' +
            'and bad readings are found by the largest normalized residual. The network must be observable: ' +
            'enough voltage, flow and injection readings to fix two states per bus.';
    }

    /** Values keyed by parameter id. */
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
                        alert('A subscription is required to use the State Estimation feature.');
                    }
                    return;
                }
                const params = values && typeof values === 'object' && !Array.isArray(values) ? values : {};
                saveStateEstimationSettings(params);
                if (callback) {
                    callback(params);
                }
            } catch (error) {
                console.error('StateEstimationDialog: Error checking subscription status:', error);
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
            console.error('StateEstimationDialog: Error in checkSubscriptionStatus:', error);
            return false;
        }
    }
}
