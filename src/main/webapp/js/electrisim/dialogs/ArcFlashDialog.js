// ArcFlashDialog.js - Dialog for IEEE 1584-2018 Arc Flash parameters
import { Dialog } from '../Dialog.js';
import { ensureSubscriptionFunctions } from '../ensureSubscriptionFunctions.js';

export class ArcFlashDialog extends Dialog {
    constructor(editorUi) {
        super('Arc Flash Parameters (IEEE 1584-2018)', 'Calculate');

        this.useStudyModalShell = true;
        this.studyModalBoxWidth = 720;

        this.ui = editorUi || window.App?.main?.editor?.editorUi;
        this.graph = this.ui?.editor?.graph;

        this.parameters = [
            {
                id: 'electrode_config',
                label: 'Electrode Configuration',
                type: 'radio',
                options: [
                    { value: 'VCB', label: 'VCB – Vertical in box (switchgear/MCC)', default: true },
                    { value: 'VCBB', label: 'VCBB – Vertical in box with barrier' },
                    { value: 'HCB', label: 'HCB – Horizontal in box' },
                    { value: 'VOA', label: 'VOA – Vertical open air' },
                    { value: 'HOA', label: 'HOA – Horizontal open air' }
                ]
            },
            {
                id: 'equipment_mode',
                label: 'Gap, enclosure and working distance',
                type: 'radio',
                options: [
                    { value: 'by_voltage', label: 'Typical for each bus voltage (IEEE 1584-2018 Table 8)', default: true },
                    { value: 'uniform', label: 'The values below for every bus' }
                ]
            },
            {
                id: 'working_distance_mm',
                label: 'Working Distance (mm)',
                type: 'number',
                value: '455',
                min: '305',
                step: '1'
            },
            {
                id: 'conductor_gap_mm',
                label: 'Conductor Gap (mm)',
                type: 'number',
                value: '25',
                min: '1',
                step: '1'
            },
            {
                id: 'enclosure_height_mm',
                label: 'Enclosure Height (mm)',
                type: 'number',
                value: '508',
                min: '100',
                step: '1'
            },
            {
                id: 'enclosure_width_mm',
                label: 'Enclosure Width (mm)',
                type: 'number',
                value: '508',
                min: '100',
                step: '1'
            },
            {
                id: 'enclosure_depth_mm',
                label: 'Enclosure Depth (mm)',
                type: 'number',
                value: '508',
                min: '100',
                step: '1'
            },
            {
                id: 'clearing_time_s',
                label: 'Clearing Time at Iarc (s)',
                type: 'number',
                value: '0.2',
                min: '0.001',
                step: '0.001'
            },
            {
                id: 'clearing_time_min_s',
                label: 'Clearing Time at Iarc-min (s)',
                type: 'number',
                value: '0.2',
                min: '0.001',
                step: '0.001'
            },
            {
                // As in the short-circuit study, so its bolted fault currents
                // are the same: c max 1.05 at 6 %, 1.10 at 10 %.
                id: 'lv_tol_percent',
                label: 'Voltage tolerance in low voltage grids (sets c max for the bolted fault current)',
                type: 'radio',
                options: [
                    { value: '6', label: '6%', default: true },
                    { value: '10', label: '10%' }
                ]
            }
        ];
    }

    getDescription() {
        return '<strong>Configure IEEE 1584-2018 arc flash parameters</strong><br>' +
            'A 3-phase max short-circuit study is run first, then incident energy, arc-flash boundary, ' +
            'and PPE category are calculated for each bus. Buses above 15&nbsp;kV use the Ralph Lee method. ' +
            'Typical for each bus voltage: LV switchgear 32&nbsp;mm gap at 610&nbsp;mm, 5&nbsp;kV switchgear ' +
            '104&nbsp;mm at 910&nbsp;mm, 15&nbsp;kV switchgear 152&nbsp;mm at 910&nbsp;mm, above 15&nbsp;kV 910&nbsp;mm.';
    }

    /** Values keyed by parameter id; mapping the array by position broke whenever a field was added. */
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
                        alert('A subscription is required to use the Arc Flash analysis feature.');
                    }
                    return;
                }

                // Prefer named object if Dialog returns one; otherwise map array by parameter order
                let params;
                if (values && typeof values === 'object' && !Array.isArray(values) && ('electrode_config' in values || 'working_distance_mm' in values)) {
                    params = values;
                } else {
                    params = values || {};
                }

                if (callback) {
                    callback(params);
                }
            } catch (error) {
                console.error('ArcFlashDialog: Error checking subscription status:', error);
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
            console.error('ArcFlashDialog: Error in checkSubscriptionStatus:', error);
            return false;
        }
    }
}
