// EigenvalueAnalysisDialog.js - ANDES small-signal stability parameters
import { Dialog } from '../Dialog.js';

export class EigenvalueAnalysisDialog extends Dialog {
    constructor(editorUi) {
        super('Eigenvalue Analysis (ANDES EIG)', 'Run Analysis');
        this.requiresSubscription = true;
        this.subscriptionFeatureName = 'Eigenvalue Analysis (ANDES)';
        this.useStudyModalShell = true;
        this.studyModalBoxWidth = 640;
        this.ui = editorUi || window.App?.main?.editor?.editorUi;
        this.graph = this.ui?.editor?.graph;

        this.parameters = [
            {
                id: 'frequency',
                label: 'System Frequency (Hz)',
                type: 'number',
                value: '50',
                min: '1',
                step: '1'
            },
            {
                id: 'sn_mva',
                label: 'System Base (MVA)',
                type: 'number',
                value: '100',
                min: '1',
                step: '1'
            },
            {
                id: 'n_modes',
                label: 'Least-Damped Modes to Highlight',
                type: 'number',
                value: '10',
                min: '1',
                max: '50',
                step: '1'
            }
        ];
    }

    getDescription() {
        return 'Small-signal (eigenvalue) stability using ANDES. Linearizes around the power-flow operating point and requires a synchronous Generator or Static Generator with a renewable dynamic plant; External Grid alone is insufficient.';
    }

    /**
     * Values keyed by parameter id. The base Dialog returns them as an array,
     * which the caller read by name - so every field fell back to its
     * default and nothing entered here reached the study.
     */
    getFormValues() {
        const values = super.getFormValues();
        const ids = this.parameters.filter((p) => p.type !== 'section').map((p) => p.id);
        return Object.fromEntries(ids.map((id, i) => [id, values[i]]));
    }
}

if (typeof window !== 'undefined') {
    window.EigenvalueAnalysisDialog = EigenvalueAnalysisDialog;
}

export default EigenvalueAnalysisDialog;
