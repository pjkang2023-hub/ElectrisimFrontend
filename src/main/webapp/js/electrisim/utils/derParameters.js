// derParameters.js - the microgrid's sources and stores: battery, supercapacitor,
// flywheel, SOFC system and PV array. Each sits on a DC bus: on its own bus
// behind a DC/DC converter (whose control - MPPT, follower, dispatch, droop,
// smoothing - sets its power), or directly on a network bus. Each is generic in
// its sizing: its voltage, capacity and power are entered as ratings, or built
// from a module times modules in series and strings in parallel.
//
// The PCS joins one of them to an AC bus: grid-following or grid-forming.
//
// One list per kind serves its dialog, its defaults on drop and its payload.

export const DER_TYPES = ['Battery', 'Supercapacitor', 'Flywheel', 'SOFC', 'PV Array'];

const num = (id, label, unit, value, description, step = '0.1', min = '0') =>
    ({ id, label, symbol: id, unit, description, type: 'number', value: String(value), step, min });
const sel = (id, label, value, options, description) =>
    ({ id, label, symbol: id, description, type: 'select', value, options });
const name = (value) => ({ id: 'name', label: 'Name', symbol: 'name', description: 'Name identifier', type: 'text', value });
const inService = { id: 'in_service', label: 'In service', symbol: 'in_service', description: 'Out of service, it is left out of every study.', type: 'checkbox', value: true };

export const DER_PARAMETERS = {
    Battery: [
        name('Battery'),
        sel('sizing', 'Sizing', 'ratings', [
            { value: 'ratings', label: 'By its ratings' },
            { value: 'cells', label: 'Cell x series x parallel' }
        ], 'Its voltage, capacity and resistance as ratings, or built from its cell: cells in series set its voltage, strings in parallel its capacity.'),
        num('vn_v', 'Ratings: nominal voltage', 'V', 800, 'Its nominal voltage: 800 V on a row bus, 51.2 V in a 48 V rack.', '1'),
        num('capacity_kwh', 'Ratings: energy', 'kWh', 224, 'Its capacity: energy over nominal voltage gives its ampere-hours.', '1'),
        num('r0_mohm', 'Ratings: series resistance R0', 'mOhm', 62.5, 'Its ohmic resistance: what limits its current at a DC fault.', '0.1'),
        num('cells_series', 'Cells: in series', '', 250, 'By cells: its voltage is cells in series x the cell voltage.', '1', '1'),
        num('strings_parallel', 'Cells: strings in parallel', '', 1, 'By cells: its capacity is strings x the cell capacity.', '1', '1'),
        num('cell_v', 'Cells: cell nominal voltage', 'V', 3.2, 'LFP 3.2 V, NMC 3.6-3.7 V.', '0.01'),
        num('cell_ah', 'Cells: cell capacity', 'Ah', 280, 'One cell.', '1'),
        num('cell_r_mohm', 'Cells: cell resistance', 'mOhm', 0.25, 'One cell\'s ohmic resistance.', '0.01'),
        num('r1_percent', 'RC pair resistance R1', '% of R0', 40, 'Its polarisation: R1 in series with R0 once it has settled (steady state), with time constant tau1.', '1'),
        num('tau1_s', 'RC pair time constant tau1', 's', 30, 'For the time-series and EMT studies; over a fault\'s milliseconds it holds its voltage.', '1'),
        num('soc_percent', 'State of charge', '%', 50, 'Sets its open-circuit voltage, from its OCV table.', '1'),
        num('soc_min_percent', 'State of charge: lowest', '%', 10, 'Its window: outside it is warned about.', '1'),
        num('soc_max_percent', 'State of charge: highest', '%', 90, 'Its window: outside it is warned about.', '1'),
        num('c_rate_discharge', 'Most discharging current', 'C', 1, 'Its discharging current over its capacity: above it is warned about.', '0.1'),
        num('c_rate_charge', 'Most charging current', 'C', 0.5, 'Its charging current over its capacity: above it is warned about.', '0.1'),
        num('coulombic_efficiency_percent', 'Coulombic efficiency', '%', 99, 'Of the charge it takes, the share it stores (time-series study).', '0.1'),
        { id: 'ocv_table', label: 'OCV table (per cell)', symbol: 'ocv_table', description: 'State of charge : volts per cell pairs, e.g. 0:2.5, 10:3.19, 50:3.3, 100:3.6. Empty: an LFP cell\'s, scaled to its nominal voltage.', type: 'text', value: '' },
        num('l_uh', 'Series inductance (DC fault)', 'uH', 0, 'Its cells\' and busbars\' inductance: slows its current\'s rise at a DC fault.', '0.1'),
        inService
    ],
    Supercapacitor: [
        name('Supercapacitor'),
        sel('coupling', 'Connection', 'converter', [
            { value: 'converter', label: 'Behind a DC/DC converter' },
            { value: 'direct', label: 'Directly on the bus (passive)' }
        ], 'Behind its converter (on its own bus, the converter between it and the network) its voltage swings over its window; directly on a network bus it is that bus\'s DC-link capacitance, at its voltage.'),
        sel('sizing', 'Sizing', 'modules', [
            { value: 'ratings', label: 'By its ratings' },
            { value: 'modules', label: 'Module x series x parallel' }
        ], 'Its capacitance, voltage and ESR as ratings, or built from its module.'),
        num('c_f', 'Ratings: capacitance', 'F', 130, 'The whole bank.', '0.1'),
        num('v_rated', 'Ratings: rated voltage', 'V', 54, 'The whole bank.', '1'),
        num('esr_mohm', 'Ratings: ESR', 'mOhm', 4, 'Its series resistance: what limits its current at a DC fault.', '0.1'),
        num('esl_uh', 'Ratings: ESL (DC fault)', 'uH', 0, 'Its series inductance.', '0.01'),
        num('module_c_f', 'Modules: module capacitance', 'F', 130, 'A 54 V, 130 F module stores 190 kJ.', '0.1'),
        num('module_v', 'Modules: module rated voltage', 'V', 54, 'One module.', '1'),
        num('module_esr_mohm', 'Modules: module ESR', 'mOhm', 4, 'One module.', '0.1'),
        num('module_esl_uh', 'Modules: module ESL (DC fault)', 'uH', 0, 'One module.', '0.01'),
        num('modules_series', 'Modules: in series', '', 1, 'Its voltage: one module for a 48 V rack bus, 15 for an 800 V bus.', '1', '1'),
        num('strings_parallel', 'Modules: strings in parallel', '', 1, 'Its capacitance.', '1', '1'),
        num('v0_percent', 'Voltage', '% of rated', 90, 'Its present voltage, behind its converter: its state of charge.', '1'),
        num('v_min_percent', 'Lowest voltage', '% of rated', 50, 'Its usable energy is 1/2 C (V^2 - Vmin^2): 75 % of what it stores at half its voltage.', '1'),
        num('p_rated_kw', 'Rated power', 'kW', 0, '0: its ESR\'s matched-load power, V^2 / 4 ESR.', '1'),
        num('r_leak_ohm', 'Leakage resistance', 'Ohm', 10000, 'Its self-discharge (time-series study).', '100'),
        inService
    ],
    Flywheel: [
        name('Flywheel'),
        num('v_dc', 'DC link voltage', 'V', 800, 'Its machine converter\'s DC link, which it holds: 800 V on a row bus, 54 V in a rack.', '1'),
        num('p_rated_kw', 'Rated power', 'kW', 250, 'Its machine and converter\'s rating, from base speed up.', '1'),
        num('e_max_kwh', 'Energy at full speed', 'kWh', 2, '1/2 J w^2 at its top speed.', '0.01'),
        num('speed_percent', 'Speed', '% of top', 90, 'Its present speed: its state of charge.', '1'),
        num('speed_min_percent', 'Lowest speed', '% of top', 50, 'Its usable energy is what it stores above this speed: 75 % at half speed.', '1'),
        num('speed_base_percent', 'Base speed', '% of top', 50, 'Below it its torque limit holds its power to P_rated x speed / base speed.', '1'),
        num('efficiency_percent', 'Efficiency (one way)', '%', 95, 'Machine and converter (time-series study).', '0.1'),
        num('standby_loss_percent_h', 'Standby loss', '% per hour', 2, 'Bearing and windage losses, of its energy at full speed (time-series study).', '0.1'),
        num('r_dc_mohm', 'DC resistance', 'mOhm', 1, 'Between its DC link and its terminals.', '0.1'),
        { ...num('p_set_kw', 'Set power (directly on a bus)', 'kW', 0, 'Directly on a network bus: what it delivers (negative: it charges). Behind a DC/DC converter, the converter sets it.', '1'), min: undefined },
        inService
    ],
    SOFC: [
        name('SOFC system'),
        num('p_rated_kw', 'Rated power', 'kW', 100, 'Its stacks\' rating; its auxiliary load is drawn from it.', '1'),
        num('v_rated', 'Rated stack voltage', 'V', 800, 'Its cells in series give this at its rated power.', '1'),
        num('p_set_kw', 'Set power', 'kW', 80, 'What it delivers, net of its auxiliary load: held between its minimum load and its rating less its auxiliary load. Behind a converter in follower mode, what the converter delivers from it.', '1'),
        num('fuel_utilisation_percent', 'Fuel utilisation', '%', 85, 'The share of the hydrogen fed that reacts.', '1'),
        num('min_load_percent', 'Minimum load', '%', 30, 'Below it the stack is not run.', '1'),
        num('aux_load_percent', 'Auxiliary load', '% of rated', 5, 'Its balance of plant: blowers, pumps, controls.', '0.1'),
        num('ramp_percent_s', 'Ramp rate', '% per s', 1, 'How fast its power may change (time-series and EMT studies).', '0.1'),
        inService
    ],
    'PV Array': [
        name('PV Array'),
        num('module_pmpp_w', 'Module: maximum power', 'W', 550, 'Datasheet, at standard test conditions (1000 W/m2, 25 C).', '1'),
        num('module_vmpp', 'Module: voltage at maximum power', 'V', 41.9, 'Datasheet.', '0.01'),
        num('module_impp', 'Module: current at maximum power', 'A', 13.13, 'Datasheet.', '0.01'),
        num('module_voc', 'Module: open-circuit voltage', 'V', 49.9, 'Datasheet.', '0.01'),
        num('module_isc', 'Module: short-circuit current', 'A', 14.0, 'Datasheet.', '0.01'),
        num('module_cells_series', 'Module: cells in series', '', 72, 'A 144 half-cut-cell module has 72 in series.', '1', '1'),
        { ...num('alpha_isc_percent_k', 'Module: Isc temperature coefficient', '%/K', 0.048, 'Datasheet.', '0.001'), min: undefined },
        { ...num('beta_voc_percent_k', 'Module: Voc temperature coefficient', '%/K', -0.27, 'Datasheet.', '0.01'), min: undefined },
        num('noct_c', 'Module: NOCT', 'C', 45, 'Its cells are at ambient + (NOCT - 20) x G / 800.', '1'),
        num('modules_series', 'Modules in series', '', 18, 'Its string voltage.', '1', '1'),
        num('strings_parallel', 'Strings in parallel', '', 10, 'Its current.', '1', '1'),
        num('loss_percent', 'Losses', '%', 3, 'Wiring, mismatch and soiling, taken from its current.', '0.1'),
        num('irradiance_wm2', 'Irradiance', 'W/m2', 1000, 'On its modules\' plane. In the time series, its profile\'s value at each step if it has one.', '10'),
        { ...num('ambient_c', 'Ambient temperature', 'C', 25, 'Its cells run hotter, by its NOCT.', '1'), min: undefined },
        { ...sel('irradiance_profile_id', 'Irradiance profile (time series)', '', [], 'An irradiance profile (W/m2) from the diagram\'s load profile library, followed through a time series.'), profileKind: 'irradiance' },
        { ...sel('temperature_profile_id', 'Temperature profile (time series)', '', [], 'An ambient temperature profile (C) from the library, followed through a time series.'), profileKind: 'temperature' },
        inService
    ]
};

DER_PARAMETERS.PCS = [
    name('PCS'),
    sel('control', 'Control', 'grid_following', [
        { value: 'grid_following', label: 'Grid-following' },
        { value: 'grid_forming', label: 'Grid-forming' }
    ], 'Grid-following: it delivers the power its source gives (a PV array\'s maximum power, an SOFC\'s set power) or its set power (a battery, a flywheel), with its Q. Grid-forming: it holds its bus\'s voltage; islanded, the grid-forming PCS share the load by their P-f droops.'),
    num('s_rated_mva', 'Rated power', 'MVA', 1, 'Its P and Q stay within this circle, its active power first.', '0.1'),
    num('vn_ac_kv', 'AC voltage', 'kV', 0, 'Checked against its AC bus: a PCS at 0.69 kV on an 11 or 25 kV bus needs its transformer drawn between them. 0: not checked.', '0.01'),
    num('efficiency_percent', 'Efficiency', '%', 98, 'Its DC side draws the AC power over this, plus its no-load loss.', '0.1'),
    num('no_load_loss_kw', 'No-load loss', 'kW', 0, 'Drawn from its DC side whatever it delivers.', '0.1'),
    { ...num('p_set_mw', 'Set power', 'MW', 0, 'A battery\'s or flywheel\'s AC power: positive discharges, negative charges. Grid-forming: its share of the load before droop.', '0.01'), min: undefined },
    sel('q_mode', 'Reactive power', 'q', [
        { value: 'q', label: 'Set Q' },
        { value: 'pf', label: 'Power factor' },
        { value: 'qv', label: 'Q(V) droop' }
    ], 'Grid-following: a set Q, a power factor (negative absorbs Q), or Q from its bus voltage.'),
    { ...num('q_set_mvar', 'Set Q', 'Mvar', 0, 'Positive supplies Q.', '0.01'), min: undefined },
    { ...num('pf', 'Power factor', '', 1, 'Negative absorbs Q.', '0.01'), min: '-1' },
    num('qv_droop_percent', 'Q(V) droop', '%', 5, 'Grid-following Q(V): its rated Q at this voltage deviation from its voltage set point.', '0.5'),
    num('vm_set_pu', 'Voltage set point', 'p.u.', 1, 'Grid-forming: the voltage it holds at no Q; grid-following Q(V): its reference.', '0.01'),
    num('droop_pf_percent', 'P-f droop', '%', 2, 'Grid-forming: its frequency falls by this at its rated power above its set power. Islanded units share the load by rating / droop.', '0.1'),
    num('droop_qv_percent', 'Q-V droop', '%', 5, 'Grid-forming: its voltage falls by this at its rated Q. 0 holds its set point.', '0.5'),
    num('current_limit_pu', 'Current limit', 'p.u.', 1.2, 'Short circuit: it feeds this times its rated current (IEC and ANSI), grid-forming or grid-following.', '0.05'),
    num('current_loop_hz', 'Current loop bandwidth (EMT)', 'Hz', 500, 'Grid-following, for the EMT study: the bandwidth of its current control. 500 Hz is fast; against a weak network - an island no grid holds - a loop this fast can meet the resonance of the network: f_sw / 20 (250 Hz at 5 kHz) is usual for converters of some MW.', '10'),
    { ...num('opf_marginal_cost_eur_per_mwh', 'OPF marginal cost', 'EUR/MWh', '', 'Optimal power flow: what each MWh it delivers costs (charging, what each MWh it takes earns). Blank: the study’s default. It is dispatched within its source’s window: a battery’s state of charge and C-rates, an SOFC system’s minimum load and rating, a PV array’s MPP.', '1'), min: undefined },
    inService
];

// A zigzag grounding transformer: an AC element, its dialog built the same way.
DER_PARAMETERS['Grounding Transformer'] = [
    name('Grounding transformer'),
    num('vn_kv', 'Rated voltage', 'kV', 0, 'Checked against its bus. 0: its bus\u2019s voltage.', '0.1'),
    num('i_rated_a', 'Rated neutral current', 'A', 400, 'The ground fault current it is rated to carry, for its rated time; with no neutral resistor given, the one that passes this current.', '10'),
    num('t_rated_s', 'Rated time', 's', 10, 'How long it carries its rated neutral current.', '1'),
    { ...num('r_n_ohm', 'Neutral resistor', '\u03a9', '', 'Between its star point and ground. Blank: V_ph / its rated neutral current (low-resistance grounding). 0: solidly grounded.', '0.1'), min: '0' },
    num('x_n_ohm', 'Neutral reactor', '\u03a9', 0, 'In series with the neutral resistor, if any.', '0.1'),
    { ...num('x0_ohm', 'Zero-sequence reactance', '\u03a9', '', 'Its own, per phase. Blank: 12 % of V_ph / its rated neutral current.', '0.01'), min: '0' },
    { ...num('r0_ohm', 'Zero-sequence resistance', '\u03a9', '', 'Its own, per phase. Blank: a tenth of its zero-sequence reactance.', '0.01'), min: '0' },
    inService
];

/** Each kind's defaults, as attributes on its cell. */
export function derDefaults(kind) {
    const out = {};
    (DER_PARAMETERS[kind] || []).forEach((p) => { out[p.id] = p.value; });
    return out;
}

/** The fields its payload row carries. */
export function derFields(kind) {
    return (DER_PARAMETERS[kind] || []).map(p => p.id).filter(id => id !== 'name');
}

export const DER_DESCRIPTIONS = {
    Battery: 'Its open-circuit voltage by state of charge behind R0 and an RC pair. On its own DC bus behind a DC/DC converter (dispatch, droop or smoothing), or directly on a network bus.',
    Supercapacitor: 'A capacitance behind its ESR. Behind a DC/DC converter on its own bus (its voltage swings over its window), or directly on a bus as DC-link capacitance - in a 48 V rack or on the 800 V row bus.',
    Flywheel: 'Its rotor\'s energy, 1/2 J w^2, its machine converter holding its DC link: on its own bus behind a DC/DC converter (smoothing or dispatch), or directly on a bus at a set power.',
    SOFC: 'Its stacks\' polarisation curve (Padulles), scaled to its rating and voltage. On its own bus behind a DC/DC converter in follower mode, or directly on a bus at the current its curve gives there.',
    'PV Array': 'Its module\'s single-diode model, fitted to its datasheet, at its irradiance and temperature. On its own bus behind a DC/DC converter in MPPT mode, or directly on a bus on its I-V curve.',
    PCS: 'A bidirectional inverter joining a battery, supercapacitor, flywheel, SOFC system or PV array to an AC bus: its AC pin (top) on the AC bus, its DC pin (bottom) wired to its source, or to a DC bus with only its source on it. Grid-forming with a supercapacitor and no set power, it is an eSTATCOM.',
    'Grounding Transformer': 'A zigzag grounding transformer: the ground of a three-wire network, on the grid and islanded. It carries no balanced current; a ground fault sees its zero-sequence impedance plus three times its neutral resistor. Its pin (top) on its bus, directly or through its breaker (a Switch).'
};
