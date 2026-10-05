// dcBreakerDialog.js - a DC circuit breaker.
//
// It goes between a DC bus and a DC cable, a VSC's DC terminal, a DC load or
// source, or a second DC bus. Open, the load flow takes what it switches out
// (or, between two DC buses, separates them). Its ratings are checked against
// the load flow; the arrester and current-limiting data are for the DC fault
// and EMT studies. Laid out as the DC load's dialog, which it extends.
import { LoadDcDialog } from './loadDcDialog.js';

export const defaultDcBreakerData = {
    name: 'DC Breaker',
    closed: true,
    breaker_type: 'solid_state',
    rated_voltage_kv: 1.0,
    rated_current_ka: 1.0,
    breaking_capacity_ka: 20,
    opening_time_ms: 0.01,
    limiting_inductance_mh: 0.01,
    arrester_clamp_kv: 1.5,
    arrester_energy_kj: 50,
    cost_per_unit_by_currency: '0'
};

export class DcBreakerDialog extends LoadDcDialog {
    constructor(editorUi) {
        super(editorUi);
        this.title = 'DC Breaker Parameters';
        this.data = { ...defaultDcBreakerData };
        const num = (id, label, unit, description, step) => ({
            id, label, symbol: id, unit, description, type: 'number', value: String(this.data[id]), step, min: '0'
        });
        this.loadFlowParameters = [
            { id: 'name', label: 'Name', symbol: 'name', description: 'Name identifier for the DC breaker', type: 'text', value: this.data.name },
            { id: 'closed', label: 'Closed', symbol: 'closed', description: 'Open, the load flow takes what it switches out, or separates the two DC buses it joins.', type: 'checkbox', value: this.data.closed },
            {
                id: 'breaker_type',
                label: 'Type',
                symbol: 'breaker_type',
                description: 'How it interrupts DC current: semiconductors alone, semiconductors with a mechanical path, or a mechanical breaker with a commutation circuit.',
                type: 'select',
                options: [
                    { value: 'solid_state', label: 'Solid-state' },
                    { value: 'hybrid', label: 'Hybrid' },
                    { value: 'mechanical', label: 'Mechanical' }
                ],
                value: this.data.breaker_type
            },
            num('rated_voltage_kv', 'Rated voltage', 'kV', 'Checked against its DC bus\'s nominal voltage.', '0.01'),
            num('rated_current_ka', 'Rated current', 'kA', 'Its continuous current: the load flow reports its loading against it.', '0.01'),
            num('breaking_capacity_ka', 'Breaking capacity', 'kA', 'The largest DC fault current it interrupts, for the DC fault study.', '0.1'),
            num('opening_time_ms', 'Opening time', 'ms', 'From trip to current interruption, for the DC fault and EMT studies.', '0.001'),
            num('limiting_inductance_mh', 'Current-limiting inductance', 'mH', 'In series with it, slowing the fault current\'s rise.', '0.001'),
            num('arrester_clamp_kv', 'Surge arrester clamping voltage', 'kV', 'Solid-state and hybrid types: the voltage that forces the current down at interruption.', '0.01'),
            num('arrester_energy_kj', 'Surge arrester energy rating', 'kJ', 'Solid-state and hybrid types: the energy its arrester absorbs at interruption.', '1')
        ];
    }

    getDescription() {
        return '<strong>Configure DC Breaker Parameters</strong><br>A DC circuit breaker between a DC bus and a DC cable, '
            + 'a VSC, a DC load or source, or a second DC bus.';
    }
}

if (typeof window !== 'undefined') {
    window.DcBreakerDialog = DcBreakerDialog;
}
