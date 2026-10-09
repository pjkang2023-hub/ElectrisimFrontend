// sstDialog.js - a solid-state transformer: MV AC to LV DC, and optionally LV AC.
//
// Three stages, each drawing its output divided by its efficiency plus its
// no-load loss: a rectifier from the MV bus into an internal DC link at the
// voltage set here; a DC/DC stage holding the LV DC port; and, when the LV AC
// port (the bottom pin) is connected, an inverter - grid-following, a set P
// and Q into an LV AC network another source holds, or grid-forming, holding
// an islanded LV AC network's voltage. Laid out as the DC load's dialog.
import { LoadDcDialog } from './loadDcDialog.js';

export const defaultSstData = {
    name: 'SST',
    vn_mv_kv: 20, vn_lv_dc_kv: 0.8, vn_lv_ac_kv: 0.4, link_kv: 30,
    q_mv_mvar: 0,
    rect_rated_mw: 1, rect_efficiency_percent: 98.5, rect_no_load_kw: 2,
    dcdc_rated_mw: 1, dcdc_efficiency_percent: 98, dcdc_no_load_kw: 2, vm_lv_dc_pu: 1.0,
    inverter_mode: 'grid_following',
    inv_rated_mw: 0.5, inv_efficiency_percent: 97.5, inv_no_load_kw: 1, p_ac_mw: 0.1, q_ac_mvar: 0, vm_lv_ac_pu: 1.0,
    // EMT study: its stages' model, switching frequencies and current limit
    emt_model: 'average', switching_khz: 5, dcdc_switching_khz: 20, current_limit_pu: 1.2, current_loop_hz: 500,
    // Harmonic study: its rectifier's harmonic currents at the MV bus
    spectrum: 'afe',
    // EMT and DC fault studies: its stages' capacitors' series resistance and inductance; 0 = none
    rect_dc_link_esr_mohm: 0, rect_dc_link_esl_uh: 0, dcdc_c_in_esr_mohm: 0, dcdc_c_in_esl_uh: 0,
    dcdc_c_out_esr_mohm: 0, dcdc_c_out_esl_uh: 0, inv_dc_link_esr_mohm: 0, inv_dc_link_esl_uh: 0,
    in_service: true,
    cost_per_unit_by_currency: '0'
};

export class SstDialog extends LoadDcDialog {
    constructor(editorUi) {
        super(editorUi);
        this.title = 'Solid-State Transformer Parameters';
        this.data = { ...defaultSstData };
        const num = (id, label, unit, description, step, min = '0') => ({
            id, label, symbol: id, unit, description, type: 'number', value: String(this.data[id]), step, min
        });
        this.loadFlowParameters = [
            { id: 'name', label: 'Name', symbol: 'name', description: 'Name identifier for the solid-state transformer', type: 'text', value: this.data.name },
            num('vn_mv_kv', 'MV AC port, nominal voltage', 'kV', 'The left pin. Checked against its bus.', '0.1'),
            num('vn_lv_dc_kv', 'LV DC port, nominal voltage', 'kV', 'The right pin. Checked against its bus.', '0.01'),
            num('vn_lv_ac_kv', 'LV AC port, nominal voltage', 'kV', 'The bottom pin, optional. Checked against its bus.', '0.01'),
            num('link_kv', 'Internal DC link voltage', 'kV', 'Between the rectifier and the DC/DC stage; reported, as the load flow sees only each stage\'s power.', '0.1'),
            num('q_mv_mvar', 'Reactive power at the MV port', 'Mvar', 'Drawn from the MV grid; negative supplies it.', '0.01', undefined),
            num('rect_rated_mw', 'Rectifier: rated power', 'MW', 'Its loading is reported against it.', '0.1'),
            num('rect_efficiency_percent', 'Rectifier: efficiency', '%', 'The MV port draws the link power divided by this, plus the no-load loss.', '0.1'),
            num('rect_no_load_kw', 'Rectifier: no-load loss', 'kW', 'Drawn whatever it delivers.', '0.1'),
            num('dcdc_rated_mw', 'DC/DC stage: rated power', 'MW', 'Its loading is reported against it.', '0.1'),
            num('dcdc_efficiency_percent', 'DC/DC stage: efficiency', '%', 'The link supplies the LV DC power divided by this, plus the no-load loss.', '0.1'),
            num('dcdc_no_load_kw', 'DC/DC stage: no-load loss', 'kW', 'Drawn whatever it delivers.', '0.1'),
            num('vm_lv_dc_pu', 'LV DC voltage set point', 'p.u.', 'The DC/DC stage holds the LV DC port at this.', '0.01'),
            {
                id: 'inverter_mode',
                label: 'Inverter mode',
                symbol: 'inverter_mode',
                description: 'Grid-following: a set P and Q into an LV AC network another source holds. Grid-forming: it holds an islanded LV AC network\'s voltage and supplies what it draws.',
                type: 'select',
                options: [
                    { value: 'grid_following', label: 'Grid-following' },
                    { value: 'grid_forming', label: 'Grid-forming' }
                ],
                value: this.data.inverter_mode
            },
            num('inv_rated_mw', 'Inverter: rated power', 'MW', 'Its loading is reported against it; grid-forming, its current limit sets its short-circuit power (1.2 times).', '0.1'),
            num('inv_efficiency_percent', 'Inverter: efficiency', '%', 'The LV DC port supplies the LV AC power divided by this, plus the no-load loss.', '0.1'),
            num('inv_no_load_kw', 'Inverter: no-load loss', 'kW', 'Drawn whatever it delivers.', '0.1'),
            num('p_ac_mw', 'Grid-following: active power', 'MW', 'Into the LV AC port. Negative draws power from it.', '0.01', undefined),
            num('q_ac_mvar', 'Grid-following: reactive power', 'Mvar', 'Into the LV AC port.', '0.01', undefined),
            num('vm_lv_ac_pu', 'Grid-forming: LV AC voltage set point', 'p.u.', 'The voltage it holds at the LV AC port.', '0.01'),
            {
                id: 'emt_model',
                label: 'Model (EMT)',
                symbol: 'emt_model',
                description: 'For the EMT study, its stages: its rectifier (a VSC on the MV bus holding its link), its DC/DC stage (a dual active bridge holding its LV DC port) and a grid-following inverter (a VSC delivering its set power) - average (fast) or switching. A grid-forming inverter stays a source behind its impedance.',
                type: 'select',
                options: [
                    { value: 'average', label: 'Average value' },
                    { value: 'switching', label: 'Switching' }
                ],
                value: this.data.emt_model
            },
            {
                id: 'spectrum',
                label: 'Harmonic spectrum (MV)',
                symbol: 'spectrum',
                description: "For the harmonic study: the harmonic currents its rectifier draws at the MV bus - an active front end's (2 % fifth, 1.5 % seventh, falling after), a six-pulse diode bridge's, or none. Generic values until a vendor's.",
                type: 'select',
                options: [
                    { value: 'afe', label: 'Active front end (two-level, filtered)' },
                    { value: 'six_pulse', label: 'Six-pulse diode bridge' },
                    { value: 'none', label: 'None' }
                ],
                value: this.data.spectrum
            },
            num('switching_khz', 'Rectifier and inverter: switching frequency (EMT)', 'kHz', 'For the EMT study: their PWM carrier.', '0.5'),
            num('dcdc_switching_khz', 'DC/DC stage: switching frequency (EMT)', 'kHz', 'For the EMT study: its bridges\' square waves.', '1'),
            num('current_limit_pu', 'Current limit (EMT)', 'p.u.', 'For the EMT study: each stage\'s current limit, per unit of its rated current. Each blocks when its DC voltage falls below 0.8 p.u.', '0.05'),
            num('rect_dc_link_esr_mohm', 'Rectifier: DC-link ESR (EMT)', 'mOhm', 'For the EMT study: the series resistance of the rectifier DC-link capacitor, on the internal DC link, with its busbars. 0: none.', '0.1'),
            num('rect_dc_link_esl_uh', 'Rectifier: DC-link ESL (EMT)', 'uH', 'For the EMT study: the series inductance of the rectifier DC-link capacitor, on the internal DC link, with its busbars. 0: none.', '0.01'),
            num('dcdc_c_in_esr_mohm', 'DC/DC stage: input capacitor ESR (EMT)', 'mOhm', 'For the EMT study: the series resistance of the DC/DC stage input capacitor, on the internal DC link, with its busbars. 0: none.', '0.1'),
            num('dcdc_c_in_esl_uh', 'DC/DC stage: input capacitor ESL (EMT)', 'uH', 'For the EMT study: the series inductance of the DC/DC stage input capacitor, on the internal DC link, with its busbars. 0: none.', '0.01'),
            num('dcdc_c_out_esr_mohm', 'DC/DC stage: output capacitor ESR (EMT, DC fault)', 'mOhm', 'For the EMT and DC fault studies: the series resistance of the DC/DC stage output capacitor, on the LV DC port, with its busbars; it limits its discharge into a DC fault there. 0: none.', '0.1'),
            num('dcdc_c_out_esl_uh', 'DC/DC stage: output capacitor ESL (EMT, DC fault)', 'uH', 'For the EMT and DC fault studies: the series inductance of the DC/DC stage output capacitor, on the LV DC port, with its busbars. 0: none.', '0.01'),
            num('inv_dc_link_esr_mohm', 'Inverter: DC-link ESR (EMT, DC fault)', 'mOhm', 'For the EMT and DC fault studies: the series resistance of the inverter DC-link capacitor, on the LV DC port, with its busbars; it limits its discharge into a DC fault there. 0: none.', '0.1'),
            num('inv_dc_link_esl_uh', 'Inverter: DC-link ESL (EMT, DC fault)', 'uH', 'For the EMT and DC fault studies: the series inductance of the inverter DC-link capacitor, on the LV DC port, with its busbars. 0: none.', '0.01'),
            num('current_loop_hz', 'Rectifier and inverter: current loop bandwidth (EMT)', 'Hz', 'For the EMT study: the bandwidth of their current control. 500 Hz is fast; in an island no grid holds, f_sw / 20 (250 Hz at 5 kHz) keeps it clear of the resonance of the network.', '10'),
            { id: 'in_service', label: 'In service', symbol: 'in_service', description: 'Out of service, it neither draws nor delivers power.', type: 'checkbox', value: this.data.in_service }
        ];
    }

    getDescription() {
        return '<strong>Configure Solid-State Transformer Parameters</strong><br>MV AC on the left pin, LV DC on the right, '
            + 'and optionally LV AC on the bottom pin: a rectifier, a DC/DC stage and an inverter, each drawing its output '
            + '÷ efficiency + no-load loss.';
    }
}

if (typeof window !== 'undefined') {
    window.SstDialog = SstDialog;
}
