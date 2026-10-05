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
