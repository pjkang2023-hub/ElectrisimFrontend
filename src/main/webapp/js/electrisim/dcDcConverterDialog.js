// dcDcConverterDialog.js - a DC/DC converter between two DC networks.
//
// Its input (left pin) draws what its output (right pin) delivers, divided by
// its efficiency, plus its no-load loss. In voltage mode it holds its output
// voltage; in power mode it delivers a set power into an output network
// another element holds. Laid out as the DC load's dialog, which it extends.
import { LoadDcDialog } from './loadDcDialog.js';

export const defaultDcDcConverterData = {
    name: 'DC/DC Converter',
    control_mode: 'voltage',
    vm_out_pu: 1.0,
    p_set_mw: 0.1,
    rated_mw: 1.0,
    vn_in_kv: 0.8,
    vn_out_kv: 0.4,
    efficiency_percent: 98,
    no_load_loss_kw: 1,
    bidirectional: false,
    in_service: true,
    cost_per_unit_by_currency: '0'
};

export class DcDcConverterDialog extends LoadDcDialog {
    constructor(editorUi) {
        super(editorUi);
        this.title = 'DC/DC Converter Parameters';
        this.data = { ...defaultDcDcConverterData };
        const num = (id, label, unit, description, step) => ({
            id, label, symbol: id, unit, description, type: 'number', value: String(this.data[id]), step, min: '0'
        });
        this.loadFlowParameters = [
            { id: 'name', label: 'Name', symbol: 'name', description: 'Name identifier for the DC/DC converter', type: 'text', value: this.data.name },
            {
                id: 'control_mode',
                label: 'Control',
                symbol: 'control_mode',
                description: 'Hold the output voltage (the converter supplies its output network), or deliver a set power into an output network a VSC or another converter holds.',
                type: 'select',
                options: [
                    { value: 'voltage', label: 'Hold output voltage' },
                    { value: 'power', label: 'Deliver a set power' }
                ],
                value: this.data.control_mode
            },
            num('vm_out_pu', 'Output voltage set point', 'p.u.', 'Voltage mode: the output bus voltage it holds.', '0.01'),
            { ...num('p_set_mw', 'Set power', 'MW', 'Power mode: what it delivers at its output. Negative sends power from the output to the input.', '0.01'), min: undefined },
            num('rated_mw', 'Rated power', 'MW', 'Its loading is reported against it.', '0.1'),
            num('vn_in_kv', 'Input nominal voltage', 'kV', 'Checked against the input (left) DC bus.', '0.01'),
            num('vn_out_kv', 'Output nominal voltage', 'kV', 'Checked against the output (right) DC bus.', '0.01'),
            num('efficiency_percent', 'Efficiency', '%', 'Its input draws the output power divided by this, plus the no-load loss.', '0.1'),
            num('no_load_loss_kw', 'No-load loss', 'kW', 'Drawn at its input whatever it delivers.', '0.1'),
            { id: 'bidirectional', label: 'Bidirectional', symbol: 'bidirectional', description: 'Power may flow from its output to its input; otherwise such a flow is warned about.', type: 'checkbox', value: this.data.bidirectional },
            { id: 'in_service', label: 'In service', symbol: 'in_service', description: 'Out of service, it neither draws nor delivers power.', type: 'checkbox', value: this.data.in_service }
        ];
    }

    getDescription() {
        return '<strong>Configure DC/DC Converter Parameters</strong><br>Between two DC networks: the input on its left pin, '
            + 'the output on its right. Its input draws the output power ÷ efficiency + no-load loss.';
    }
}

if (typeof window !== 'undefined') {
    window.DcDcConverterDialog = DcDcConverterDialog;
}
