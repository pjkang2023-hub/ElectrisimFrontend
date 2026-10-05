// dcCapacitorDialog.js - a DC-link capacitor on a DC bus.
//
// It draws nothing in steady state: the load flow reports the energy it holds,
// and the DC fault and EMT studies use its capacitance, series resistance and
// inductance. Laid out as the DC load's dialog, which it extends.
import { LoadDcDialog } from './loadDcDialog.js';

export const defaultDcCapacitorData = {
    name: 'DC Capacitor',
    c_mf: 10,
    esr_mohm: 2,
    esl_uh: 0.1,
    in_service: true,
    cost_per_unit_by_currency: '0'
};

export class DcCapacitorDialog extends LoadDcDialog {
    constructor(editorUi) {
        super(editorUi);
        this.title = 'DC Capacitor Parameters';
        this.data = { ...defaultDcCapacitorData };
        this.loadFlowParameters = [
            {
                id: 'name',
                label: 'Name',
                symbol: 'name',
                description: 'Name identifier for the DC-link capacitor',
                type: 'text',
                value: this.data.name
            },
            {
                id: 'c_mf',
                label: 'Capacitance',
                symbol: 'C',
                unit: 'mF',
                description: 'Its capacitance. The load flow reports the energy it holds, C V^2 / 2.',
                type: 'number',
                value: String(this.data.c_mf),
                step: '0.1',
                min: '0'
            },
            {
                id: 'esr_mohm',
                label: 'Equivalent series resistance',
                symbol: 'ESR',
                unit: 'mOhm',
                description: 'Limits its discharge current into a DC fault.',
                type: 'number',
                value: String(this.data.esr_mohm),
                step: '0.1',
                min: '0'
            },
            {
                id: 'esl_uh',
                label: 'Equivalent series inductance',
                symbol: 'ESL',
                unit: 'uH',
                description: 'With the cable inductance, sets how fast its fault current rises.',
                type: 'number',
                value: String(this.data.esl_uh),
                step: '0.01',
                min: '0'
            },
            {
                id: 'in_service',
                label: 'In Service',
                symbol: 'in_service',
                description: 'Specifies if the capacitor is in service',
                type: 'checkbox',
                value: this.data.in_service
            }
        ];
    }

    getDescription() {
        return '<strong>Configure DC Capacitor Parameters</strong><br>A DC-link capacitor on a DC bus. '
            + 'It draws no current in steady state; the DC fault and EMT studies use it.';
    }
}

if (typeof window !== 'undefined') {
    window.DcCapacitorDialog = DcCapacitorDialog;
}
