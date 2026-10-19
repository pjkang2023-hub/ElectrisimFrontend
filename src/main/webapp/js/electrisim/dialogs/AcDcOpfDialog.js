// AcDcOpfDialog.js - Dialog for the AC/DC optimal power flow with least shed
import { Dialog } from '../Dialog.js';

// The last settings, kept in this browser.
export const ACDC_OPF_SETTINGS_KEY = 'electrisim.acdcOpf.settings';

function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(ACDC_OPF_SETTINGS_KEY) || 'null');
        return saved && typeof saved === 'object' ? saved : {};
    } catch (e) {
        return {};
    }
}

function saveSettings(values) {
    try {
        localStorage.setItem(ACDC_OPF_SETTINGS_KEY, JSON.stringify(values));
    } catch (e) {
        // Private windows and blocked storage: the dialog opens with its defaults.
    }
}

const YES_NO = (yes) => [
    { value: 'true', label: 'Yes', default: yes },
    { value: 'false', label: 'No', default: !yes }
];

export class AcDcOpfDialog extends Dialog {
    constructor(editorUi) {
        super('AC/DC Optimal Power Flow', 'Calculate');

        this.useStudyModalShell = true;
        this.studyModalBoxWidth = 640;
        this.ui = editorUi || window.App?.main?.editor?.editorUi;

        this.parameters = [
            { id: 'objective_section', label: 'Objective', type: 'section' },
            {
                id: 'objective',
                label: 'Objective',
                type: 'select',
                options: [
                    { value: 'shed', label: 'Least shed, then least losses', default: true },
                    { value: 'losses', label: 'Least losses, every load served' }
                ]
            },
            { id: 'shed_dc_loads', label: 'DC loads (racks) may be shed', type: 'select', options: YES_NO(true) },
            { id: 'shed_ac_loads', label: 'AC loads may be shed', type: 'select', options: YES_NO(false) },
            { id: 'limits_section', label: 'Limits', type: 'section' },
            {
                id: 'batteries',
                label: 'Batteries may discharge (priced at twice the grid\'s energy, so only where needed)',
                type: 'select',
                options: YES_NO(false)
            },
            { id: 'branch_limits', label: 'Enforce line and transformer ratings', type: 'select', options: YES_NO(true) },
            {
                id: 'transformer_factor',
                label: 'Transformer rating factor (1.1 = a 10 % overload allowed)',
                type: 'number', value: '1', min: '0.5', max: '2', step: '0.05'
            },
            {
                id: 'frequency',
                label: 'Frequency',
                type: 'select',
                options: [{ value: '50', label: '50 Hz', default: true }, { value: '60', label: '60 Hz' }]
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
        return '<strong>AC/DC optimal power flow</strong><br>' +
            'The network as the load flow builds it, with its DC side: each AFE and grid-forming PCS within its ' +
            'derated rating circle (the PCS within its reactive cap), the SSTs with their stage losses, the batteries ' +
            'within their C-rates, the DC buses joined by their cables and breakers. <em>Least shed</em> answers ' +
            'how much load must go when no dispatch serves it all - where the Optimal Power Flow can only say it did ' +
            'not converge. Solved with Ipopt. DC/DC converters, DC diodes, supercapacitors, fuel cells and PV arrays ' +
            'are not modelled yet: a network with them is refused, naming them.';
    }

    getFormValues() {
        const values = super.getFormValues();
        const ids = this.parameters.filter(p => p.type !== 'section').map(p => p.id);
        return Object.fromEntries(ids.map((id, i) => [id, values[i]]));
    }

    show(callback) {
        super.show(async (values) => {
            const params = values && typeof values === 'object' && !Array.isArray(values) ? values : {};
            saveSettings(params);
            if (callback) callback(params);
        });
    }
}
