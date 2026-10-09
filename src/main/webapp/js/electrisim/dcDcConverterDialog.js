// dcDcConverterDialog.js - a DC/DC converter between two DC networks.
//
// Its input (left pin) draws what its output (right pin) delivers, divided by
// its efficiency, plus its no-load loss. In voltage mode it holds its output
// voltage, in droop lowering it with its power; in power mode it delivers a
// set power into an output network another element holds. Behind a source or
// store (on its input): dispatch (a set power), MPPT (its PV array's maximum
// power), follower (its SOFC's set power) or smoothing (its store takes its
// output network's load swings; none in a load flow). Laid out as the DC
// load's dialog, which it extends.
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
    droop_percent: 5,           // droop: its output voltage falls this much at its rated current
    smoothing_tau_s: 10,        // smoothing: its store takes the load's changes faster than this
    soc_ref_percent: 50,        // smoothing: the state of charge its store is brought back to
    soc_gain: 0.1,              // smoothing: how strongly, in p.u. of its rating per unit of state of charge
    emt_model: 'average',       // EMT study: a dual active bridge, averaged or switched
    switching_khz: 20,          // EMT study: its bridges' switching frequency
    current_limit_pu: 1.2,      // EMT study: its output current limit, per unit of its rated current
    c_out_mf: 0,                // EMT and DC fault studies: its output capacitor; 0 = 2 ms of its rating stored
    c_out_esr_mohm: 0,          // EMT and DC fault studies: its output capacitor's series resistance; 0 = none
    c_out_esl_uh: 0,            // ... and series inductance; 0 = none
    c_in_esr_mohm: 0,           // EMT and DC fault studies: its input capacitor's (2 ms of its rating) series resistance
    c_in_esl_uh: 0,             // ... and series inductance; 0 = none
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
                description: "Hold the output voltage (it supplies its output network), lowered with its power in droop; or deliver power into an output network a VSC or another converter holds: a set power, or - with a source or store on its input - dispatch (its set power), MPPT (its PV array's maximum power), follower (its SOFC's set power), or smoothing (its store takes its output network's load swings; none in a load flow).",
                type: 'select',
                options: [
                    { value: 'voltage', label: 'Hold output voltage' },
                    { value: 'droop', label: 'Droop (voltage falls with current)' },
                    { value: 'power', label: 'Deliver a set power' },
                    { value: 'dispatch', label: 'Dispatch its store or source' },
                    { value: 'mppt', label: 'MPPT (PV array)' },
                    { value: 'follower', label: 'Follower (SOFC)' },
                    { value: 'smoothing', label: 'Smoothing (store takes load swings)' }
                ],
                value: this.data.control_mode
            },
            num('vm_out_pu', 'Output voltage set point', 'p.u.', 'Voltage mode: the output bus voltage it holds.', '0.01'),
            { ...num('p_set_mw', 'Set power', 'MW', 'Power and dispatch modes: what it delivers at its output. Negative sends power from the output to the input (charging a store on its input).', '0.01'), min: undefined },
            num('rated_mw', 'Rated power', 'MW', 'Its loading is reported against it.', '0.1'),
            num('droop_percent', 'Droop', '%', 'Droop: its output voltage falls by this at its rated current - its set voltage behind a virtual resistance, droop x V0^2 / P_rated.', '0.5'),
            num('smoothing_tau_s', 'Smoothing time constant', 's', "Smoothing: its store takes its output network's load changes faster than this; slower ones pass to the network (time-series and EMT studies).", '1'),
            num('soc_ref_percent', 'Smoothing: state of charge to return to', '%', "Smoothing: its store's state of charge is brought back toward this.", '1'),
            num('soc_gain', 'Smoothing: state-of-charge gain', 'p.u.', 'Smoothing: how strongly - its rating per unit of state of charge away from the reference.', '0.01'),
            num('vn_in_kv', 'Input nominal voltage', 'kV', 'Checked against the input (left) DC bus.', '0.01'),
            num('vn_out_kv', 'Output nominal voltage', 'kV', 'Checked against the output (right) DC bus.', '0.01'),
            num('efficiency_percent', 'Efficiency', '%', 'Its input draws the output power divided by this, plus the no-load loss.', '0.1'),
            num('no_load_loss_kw', 'No-load loss', 'kW', 'Drawn at its input whatever it delivers.', '0.1'),
            { id: 'bidirectional', label: 'Bidirectional', symbol: 'bidirectional', description: 'Power may flow from its output to its input; otherwise such a flow is warned about. In the EMT study its current limit then holds either way; otherwise it cannot send power back.', type: 'checkbox', value: this.data.bidirectional },
            {
                id: 'emt_model',
                label: 'Model (EMT)',
                symbol: 'emt_model',
                description: 'For the EMT study: a dual active bridge - two full bridges and a transformer - average (its phase shift giving its average currents: fast) or switching (its bridges switched, with a time step of a fiftieth of its switching period or less).',
                type: 'select',
                options: [
                    { value: 'average', label: 'Average value' },
                    { value: 'switching', label: 'Switching' }
                ],
                value: this.data.emt_model
            },
            num('switching_khz', 'Switching frequency (EMT)', 'kHz', 'For the EMT study: its bridges\' square waves. Its controller samples at each half period, in both models.', '1'),
            num('current_limit_pu', 'Current limit (EMT)', 'p.u.', 'For the EMT study: the most output current its controls let it deliver, per unit of its rated current. It blocks when its input or output voltage falls below 0.8 p.u.', '0.05'),
            num('c_out_mf', 'Output capacitance (EMT)', 'mF', 'For the EMT and DC fault studies: its output capacitor. 0 stores 2 ms of its rating at its output voltage.', '0.1'),
            num('c_out_esr_mohm', 'Output capacitor ESR (EMT, DC fault)', 'mOhm', 'Its output capacitor\'s series resistance, which limits its discharge into a DC fault on its output bus. 0: none - into a hard fault there its peak is then not resolved.', '0.1'),
            num('c_out_esl_uh', 'Output capacitor ESL (EMT, DC fault)', 'uH', 'Its output capacitor\'s series inductance, with its busbars. 0: none.', '0.01'),
            num('c_in_esr_mohm', 'Input capacitor ESR (EMT, DC fault)', 'mOhm', 'Its input capacitor (2 ms of its rating at its input voltage): its series resistance, which limits its discharge into a DC fault on its input bus. 0: none.', '0.1'),
            num('c_in_esl_uh', 'Input capacitor ESL (EMT, DC fault)', 'uH', 'Its input capacitor\'s series inductance, with its busbars. 0: none.', '0.01'),
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
