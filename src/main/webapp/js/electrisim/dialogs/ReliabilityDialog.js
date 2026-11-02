// ReliabilityDialog.js - Dialog for the reliability study: contingency enumeration over the protection zones
import { Dialog } from '../Dialog.js';

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

export class ReliabilityDialog extends Dialog {
    constructor(editorUi) {
        super('Reliability', 'Calculate');

        this.useStudyModalShell = true;
        this.studyModalBoxWidth = 680;
        this.ui = editorUi || window.App?.main?.editor?.editorUi;

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
            num('zone_kv', 'Protection zones at and above (kV)', 10)
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
