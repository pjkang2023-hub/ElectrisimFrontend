// dcDiodeDialog.js - a DC diode.
//
// It goes between two DC buses and conducts from its left pin (anode) to its
// right (cathode) only: a server shelf fed from two buses through a diode from
// each - its own lineup and a catcher - takes its power from the higher. The
// load flow settles each diode conducting or blocking; the DC fault and EMT
// studies switch it as the currents drive it. Laid out as the DC load's
// dialog, which it extends.
import { LoadDcDialog } from './loadDcDialog.js';

export const defaultDcDiodeData = {
    name: 'DC Diode',
    v_f_v: 1.6,
    r_on_mohm: 0.1,
    rated_current_ka: 1.5,
    in_service: true,
    cost_per_unit_by_currency: '0'
};

export class DcDiodeDialog extends LoadDcDialog {
    constructor(editorUi) {
        super(editorUi);
        this.title = 'DC Diode Parameters';
        this.data = { ...defaultDcDiodeData };
        const num = (id, label, unit, description, step) => ({
            id, label, symbol: id, unit, description, type: 'number', value: String(this.data[id]), step, min: '0'
        });
        this.loadFlowParameters = [
            { id: 'name', label: 'Name', symbol: 'name', description: 'Name identifier for the DC diode', type: 'text', value: this.data.name },
            num('v_f_v', 'Forward voltage', 'V', 'Its drop conducting, before its on-resistance: 1.6 V is 0.2 % at 800 V.', '0.01'),
            num('r_on_mohm', 'On-resistance', 'mOhm', 'In series with its forward voltage, conducting.', '0.01'),
            num('rated_current_ka', 'Rated current', 'kA', 'Its continuous current: the load flow reports its loading against it.', '0.01'),
            { id: 'in_service', label: 'In service', symbol: 'in_service', description: 'Out of service, it is taken out of every study.', type: 'checkbox', value: this.data.in_service }
        ];
    }

    getDescription() {
        return '<strong>Configure DC Diode Parameters</strong><br>A diode between two DC buses, its anode on the left pin '
            + 'and its cathode on the right. A shelf fed through a diode from each of two buses takes its power from the higher.';
    }
}

if (typeof window !== 'undefined') {
    window.DcDiodeDialog = DcDiodeDialog;
}
