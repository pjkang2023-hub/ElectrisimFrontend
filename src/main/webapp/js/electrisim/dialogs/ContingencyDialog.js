// ContingencyDialog.js - Dialog for Contingency Analysis parameters
import { Dialog } from '../Dialog.js';

export class ContingencyDialog extends Dialog {
    constructor(editorUi) {
        super('Contingency Analysis Parameters', 'Analyze');

        /** Full-viewport modal shell (matches Load Flow dialog layout). */
        this.useStudyModalShell = true;
        this.studyModalBoxWidth = 740;
        
        // Use global App if editorUi is not valid
        this.ui = editorUi || window.App?.main?.editor?.editorUi;
        this.graph = this.ui?.editor?.graph;
        this.parameters = [
            {
                id: 'element_type',
                label: 'Element Type to Analyze',
                type: 'radio',
                options: [
                    { value: 'line', label: 'Transmission Lines', default: true },
                    { value: 'transformer', label: 'Transformers' },
                    { value: 'generator', label: 'Generators' },
                    // Each rectifier (VSC), solid-state transformer and DC/DC converter: on a DC site
                    // most of what can fail. They ran only under "All Elements".
                    { value: 'converter', label: 'Converters (VSC, SST, DC/DC)' },
                    { value: 'all', label: 'All Elements' }
                ]
            },
            {
                id: 'voltage_limits',
                label: 'Check Voltage Limits',
                type: 'radio',
                options: [
                    { value: 'true', label: 'Yes', default: true },
                    { value: 'false', label: 'No' }
                ]
            },
            {
                id: 'thermal_limits',
                label: 'Check Thermal Limits',
                type: 'radio',
                options: [
                    { value: 'true', label: 'Yes', default: true },
                    { value: 'false', label: 'No' }
                ]
            },
            { 
                id: 'min_vm_pu', 
                label: 'Minimum Voltage (p.u.)', 
                type: 'number', 
                value: '0.95',
                min: '0.5',
                max: '1.0',
                step: '0.01'
            },
            { 
                id: 'max_vm_pu', 
                label: 'Maximum Voltage (p.u.)', 
                type: 'number', 
                value: '1.05',
                min: '1.0',
                max: '1.5',
                step: '0.01'
            },
            { 
                id: 'max_loading_percent', 
                label: 'Maximum Loading (%)', 
                type: 'number', 
                value: '100',
                min: '50',
                max: '200',
                step: '1'
            }
        ];
    }

    getDescription() {
        return '<strong>Configure contingency analysis parameters</strong><br>' +
               'Each in-service element of the selected type is switched out one at a time (N-1 screening) ' +
               'and an AC load flow is run to check voltage and thermal limits. ' +
               'See the <a href="https://electrisim.com/documentation.html#contingency-analysis" target="_blank" rel="noopener noreferrer">Electrisim documentation</a>.';
    }

    show(callback) {
        console.log('ContingencyDialog.show() called');
        super.show(async (values) => {
            console.log('ContingencyDialog Analyze button clicked, values:', values);

            // Array order matches contingencyAnalysis.js: element_type, voltage_limits, thermal_limits, min/max V, max loading
            const valuesArray = [
                values[0],  // element_type
                values[1],  // voltage_limits
                values[2],  // thermal_limits
                values[3],  // min_vm_pu
                values[4],  // max_vm_pu
                values[5]   // max_loading_percent
            ];

            console.log('ContingencyDialog: Calling callback with values array:', valuesArray);

            if (callback) {
                callback(valuesArray);
            }
        });
    }
}

// Make ContingencyDialog available globally
globalThis.ContingencyDialog = ContingencyDialog; 