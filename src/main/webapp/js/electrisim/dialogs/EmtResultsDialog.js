// EmtResultsDialog.js - EMT study results: the fault, breakers, loads, and waveforms
import { attachBackdropCloseHandler } from '../utils/dialogStyles.js';

function loadChartJs() {
    return new Promise((resolve, reject) => {
        if (typeof Chart !== 'undefined') {
            resolve(Chart);
            return;
        }
        const existing = document.querySelector('script[data-electrisim-chartjs]');
        if (existing) {
            existing.addEventListener('load', () => resolve(window.Chart));
            existing.addEventListener('error', () => reject(new Error('Chart.js failed')));
            return;
        }
        const script = document.createElement('script');
        script.src = 'js/vendor/chart.umd.min.js';
        script.dataset.electrisimChartjs = '1';
        script.onload = () => resolve(window.Chart);
        script.onerror = () => reject(new Error('Chart.js failed to load'));
        document.head.appendChild(script);
    });
}

const fmt = (x, d = 3) => (x === null || x === undefined || !isFinite(x) ? '—' : Number(x).toFixed(d));
const PALETTE = ['#c0392b', '#007cba', '#e67e22', '#27ae60', '#8e44ad', '#16a085', '#2c3e50', '#d35400', '#7f8c8d'];

export class EmtResultsDialog {
    constructor(results) {
        this.results = results || {};
        this.emt = this.results.emt || {};
        this.chart = null;
    }

    show() {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.55); z-index: 10000; display: flex; align-items: center; justify-content: center; padding: 16px;';
        overlay.className = 'emt-results-overlay';
        const close = () => {
            this.chart?.destroy?.();
            overlay.remove();
        };
        const shell = document.createElement('div');
        shell.style.cssText = "background: #fff; border-radius: 10px; box-shadow: 0 8px 32px rgba(0,0,0,0.28); max-width: 1180px; width: 100%; max-height: 92vh; display: flex; flex-direction: column; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; color: #212529;";
        const header = document.createElement('div');
        header.style.cssText = 'padding: 18px 24px; border-bottom: 1px solid #e9ecef; display: flex; align-items: center; justify-content: space-between;';
        header.innerHTML = '<h2 style="margin:0;font-size:18px;font-weight:700;">EMT Study Results</h2>';
        const x = document.createElement('button');
        x.textContent = '×';
        x.title = 'Close';
        x.style.cssText = 'border:none;background:transparent;font-size:24px;line-height:1;cursor:pointer;color:#6c757d;';
        x.onclick = close;
        header.appendChild(x);
        shell.appendChild(header);

        const body = document.createElement('div');
        body.style.cssText = 'flex: 1; overflow-y: auto; padding: 20px 24px; font-size: 13px;';
        shell.appendChild(body);
        if (this.results.error) {
            body.innerHTML = `<div style="padding:12px;background:#f8d7da;color:#842029;border-radius:6px;">${this._escape(this.results.message || 'The EMT study failed.')}</div>`;
        } else {
            this._renderMethod(body);
            this._renderAc(body);
            this._renderFault(body);
            this._renderConverters(body);
            this._renderDers(body);
            this._renderSmoothing(body);
            this._renderProfiles(body);
            this._renderBreakers(body);
            this._renderLoads(body);
            this._renderBuses(body);
            this._renderWaveforms(body);
        }
        this._renderWarnings(body);

        const footer = document.createElement('div');
        footer.style.cssText = 'padding: 14px 24px; border-top: 1px solid #e9ecef; display: flex; justify-content: flex-end; gap: 8px; background: #fafbfc;';
        if (!this.results.error) {
            const csv = this._button('Export CSV', '#198754');
            csv.onclick = () => this._exportCsv();
            footer.appendChild(csv);
        }
        const closeBtn = this._button('Close', '#007bff');
        closeBtn.onclick = close;
        footer.appendChild(closeBtn);
        shell.appendChild(footer);
        overlay.appendChild(shell);
        attachBackdropCloseHandler(overlay, shell, close);
        document.body.appendChild(overlay);
    }

    _button(label, bg) {
        const btn = document.createElement('button');
        btn.textContent = label;
        btn.style.cssText = `padding: 8px 16px; background: ${bg}; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500;`;
        return btn;
    }

    _escape(text) {
        const div = document.createElement('div');
        div.textContent = String(text ?? '');
        return div.innerHTML;
    }

    _h(body, text) {
        const h = document.createElement('h3');
        h.textContent = text;
        h.style.cssText = 'margin:16px 0 8px;font-size:15px;';
        body.appendChild(h);
    }

    _table(columns, rows) {
        const th = columns.map(c => `<th style="text-align:${c.align || 'right'};padding:6px 8px;border-bottom:2px solid #dee2e6;white-space:nowrap;" title="${this._escape(c.title || '')}">${c.label}</th>`).join('');
        const tr = rows.map(r => '<tr>' + columns.map(c => `<td style="text-align:${c.align || 'right'};padding:5px 8px;border-bottom:1px solid #f1f3f5;${c.style ? c.style(r) : ''}">${c.value(r)}</td>`).join('') + '</tr>').join('');
        const wrap = document.createElement('div');
        wrap.style.overflowX = 'auto';
        wrap.innerHTML = `<table style="border-collapse:collapse;width:100%;font-size:12.5px;"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`;
        return wrap;
    }

    _renderMethod(body) {
        const s = this.emt.settings || {};
        const note = document.createElement('div');
        note.style.cssText = 'padding:10px 12px;background:#e7f1ff;border-radius:6px;color:#084298;';
        note.innerHTML = `<strong>Method.</strong> ${this._escape(this.emt.method || '')}<br><span style="color:#495057;">Time step ${fmt(s.time_step_us, 2)} µs · duration ${fmt(s.duration_ms, 0)} ms · converters block below ${fmt(s.vsc_block_pu, 2)} p.u. · pi sections up to ${fmt(s.max_section_km, 2)} km</span>`;
        body.appendChild(note);
    }

    _renderFault(body) {
        const f = this.emt.fault;
        if (!f) return;
        this._h(body, `Fault on ${f.bus} at ${fmt(f.t_ms, 2)} ms`);
        body.appendChild(this._table([
            { label: 'Peak current (kA)', value: r => fmt(r.ip_ka) },
            { label: 'At (ms)', value: r => fmt(r.tp_ms, 3) },
            { label: 'Fastest rise (kA/ms)', value: r => fmt(r.didt_max_ka_per_ms, 1) },
            { label: 'At the end (kA)', value: r => fmt(r.i_final_ka) }
        ], [f]));
    }

    _renderProfiles(body) {
        const rows = this.emt.profiled_loads || [];
        if (!rows.length) return;
        this._h(body, 'Loads following a profile');
        body.appendChild(this._table([
            { label: 'Load', align: 'left', value: l => `${this._escape(l.label)} <span style="color:#6c757d;">(${l.kind === 'DC load' ? 'DC' : 'AC'})</span>` },
            { label: 'Profile', align: 'left', value: l => this._escape(l.profile) },
            { label: 'Set power (MW)', title: '1.0 p.u. of its profile', value: l => fmt(l.p_set_mw) },
            { label: 'At the start (MW)', value: l => fmt(l.p_start_mw) },
            { label: 'Least / most (MW)', title: 'Its profile\'s, through the run', value: l => `${fmt(l.p_min_mw)} / ${fmt(l.p_max_mw)}` },
            { label: 'Last cycle: profile (MW)', title: 'Its profile\'s mean over the run\'s last cycle', value: l => fmt(l.p_end_mw) },
            { label: 'Last cycle: drawn (MW)', title: 'What it drew over the run\'s last cycle: an AC load, an impedance following its profile, with its voltage; a DC load by its model (constant current below its minimum voltage)', value: l => fmt(l.p_drawn_end_mw) }
        ], rows));
    }

    /** The sources and stores: power, voltage and state at the start and the end. */
    _renderDers(body) {
        const rows = this.emt.ders || [];
        if (!rows.length) return;
        const STATE = {
            Battery: ['soc_percent', 'SoC (%)'], Supercapacitor: ['v_cap_v', 'Capacitor (V)'], Flywheel: ['speed_percent', 'Speed (%)'],
            SOFC: ['p_h2_atm', 'H2 (atm)'], 'PV Array': ['irradiance_wm2', 'Irradiance (W/m²)']
        };
        this._h(body, 'Sources and stores');
        body.appendChild(this._table([
            { label: 'Element', align: 'left', value: d => `${this._escape(d.label)} <span style="color:#6c757d;">(${this._escape(d.kind)}, ${d.coupling === 'direct' ? 'on its bus' : 'behind its converter'})</span>` },
            { label: 'P (MW)', title: 'Delivering, at the start and the end', value: d => `${fmt(d.p_start_mw)} → ${fmt(d.p_end_mw)}` },
            { label: 'Voltage (kV)', title: 'Lowest, and at the end', value: d => `${fmt(d.v_min_kv)} / ${fmt(d.v_end_kv)}` },
            { label: 'State', align: 'left', value: d => { const [k, l] = STATE[d.kind] || []; return k ? `${l} ${fmt(d[k + '_start'], 3)} → ${fmt(d[k + '_end'], 3)}` : '—'; } },
            { label: 'At its limit (ms)', title: 'A flywheel: how long its rotor’s power limit held', value: d => (d.limited_ms != null ? fmt(d.limited_ms, 1) : '—') }
        ], rows));
    }

    /** Smoothing converters: the racks' and the feed's peaks and steepest ramps. */
    _renderSmoothing(body) {
        const rows = (this.emt.converters || []).filter(c => c.smoothing);
        if (!rows.length) return;
        this._h(body, 'Rack smoothing');
        body.appendChild(this._table([
            { label: 'Converter', align: 'left', value: c => this._escape(c.label) },
            { label: 'Racks peak / feed peak (MW)', value: c => `${fmt(c.smoothing.rack_peak_mw)} / ${fmt(c.smoothing.feed_peak_mw)}` },
            { label: 'Racks ramp / feed ramp (MW/s)', title: 'Steepest, between its samples', value: c => `${fmt(c.smoothing.rack_ramp_mw_s, 2)} / ${fmt(c.smoothing.feed_ramp_mw_s, 2)}` },
            { label: 'Store peak (MW)', value: c => fmt(c.smoothing.store_peak_mw) },
            { label: 'At its limits (ms)', value: c => fmt(c.smoothing.limited_ms, 1) }
        ], rows));
    }

    _renderConverters(body) {
        const rows = this.emt.converters || [];
        if (!rows.length) return;
        this._h(body, 'Converters');
        body.appendChild(this._table([
            { label: 'Converter', align: 'left', value: c => `${this._escape(c.label)}${c.kind === 'DC/DC' ? ` <span style="color:#6c757d;">(DC/DC${c.control && !['voltage', 'power'].includes(c.control) ? ', ' + this._escape(c.control) : ''})</span>` : ''}` },
            {
                label: 'Model', align: 'left',
                value: c => (c.model === 'switching' ? `Switching, ${fmt(c.switching_khz, 1)} kHz` : 'Average value')
            },
            { label: 'P out (MW)', title: 'Over its first and its last cycle: a VSC\'s into its AC bus (negative draws from it), a DC/DC converter\'s from its output', value: c => `${fmt(c.p_start_mw)} → ${fmt(c.p_end_mw)}` },
            { label: 'Q out (Mvar)', title: 'Into its AC bus at the fundamental, over its first and its last cycle', value: c => (c.kind === 'DC/DC' ? '—' : `${fmt(c.q_start_mvar)} → ${fmt(c.q_end_mvar)}`) },
            { label: 'DC voltage (kV)', title: 'Lowest, and at the end, its mean over each half period: a VSC\'s DC link, a DC/DC converter\'s output', value: c => `${fmt(c.v_dc_min_kv)} / ${fmt(c.v_dc_end_kv)}` },
            { label: 'Peak current (kA)', title: 'A VSC\'s rms AC current; a DC/DC converter\'s output current (its mean over each half period)', value: c => fmt(c.i_peak_ka) },
            { label: 'Rating (MVA / MW)', value: c => fmt(c.kind === 'DC/DC' ? c.rated_mw : c.rated_mva) },
            { label: 'Limit (kA)', title: 'The most current its controls let it carry', value: c => fmt(c.current_limit_ka) },
            { label: 'At its limit (ms)', title: 'How long its controls held its current at its limit', value: c => fmt(c.limited_ms, 1) },
            {
                label: 'Blocked (ms)', value: c => (c.blocked_ms != null ? fmt(c.blocked_ms, 2) : '—'),
                style: c => (c.blocked_ms != null ? 'color:#842029;font-weight:700;' : '')
            }
        ], rows));
    }

    _renderBreakers(body) {
        const rows = this.emt.breakers || [];
        if (!rows.length) return;
        this._h(body, 'DC breakers');
        body.appendChild(this._table([
            { label: 'Breaker', align: 'left', value: b => this._escape(b.label) },
            { label: 'Trips above (kA)', value: b => fmt(b.trip_current_ka, 2) },
            { label: 'Tripped (ms)', value: b => fmt(b.tripped_ms, 3) },
            { label: 'Opened (ms)', value: b => fmt(b.opened_ms, 3) },
            { label: 'Interrupted (kA)', value: b => fmt(b.i_open_ka) },
            { label: 'Breaking capacity (kA)', value: b => fmt(b.breaking_capacity_ka, 1) },
            { label: 'Cleared (ms)', value: b => fmt(b.cleared_ms, 3) },
            { label: 'Arrester peak (kV)', value: b => fmt(b.arrester_v_peak_kv) },
            { label: 'Arrester energy (kJ)', value: b => `${fmt(b.arrester_energy_kj)} / ${fmt(b.arrester_energy_rating_kj, 0)}` },
            {
                label: 'Check', align: 'center',
                value: b => (b.exceeds_capacity || b.exceeds_energy ? 'Exceeds' : (b.opened_ms != null ? 'Cleared' : 'Closed')),
                style: b => (b.exceeds_capacity || b.exceeds_energy ? 'color:#842029;font-weight:700;' : 'color:#0f5132;font-weight:600;')
            }
        ], rows));
    }

    _renderLoads(body) {
        const rows = (this.emt.loads || []).filter(l => l.constant_power);
        if (!rows.length) return;
        this._h(body, 'Constant-power loads after the last event');
        body.appendChild(this._table([
            { label: 'DC load', align: 'left', value: l => this._escape(l.label) },
            { label: 'Lowest voltage (p.u.)', value: l => fmt(l.v_min_pu) },
            {
                label: 'Verdict', align: 'left', value: l => this._escape(l.verdict || '—'),
                style: l => (l.verdict === 'oscillates, growing' ? 'color:#842029;font-weight:700;' : '')
            }
        ], rows));
    }

    _renderBuses(body) {
        const rows = this.emt.buses || [];
        if (!rows.length) return;
        this._h(body, 'DC bus voltages');
        body.appendChild(this._table([
            { label: 'DC bus', align: 'left', value: b => this._escape(b.label) },
            { label: 'Lowest (p.u.)', value: b => fmt(b.v_min_pu) },
            { label: 'At (ms)', value: b => fmt(b.t_min_ms, 3) },
            { label: 'Highest (p.u.)', value: b => fmt(b.v_max_pu) },
            { label: 'At the end (p.u.)', value: b => fmt(b.v_final_pu) }
        ], rows));
    }

    _renderWaveforms(body) {
        const buses = this.emt.buses || [];
        const branches = this.emt.branches || [];
        if (!buses.length && !branches.length) return;
        this._h(body, 'Waveforms');
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:12px;align-items:center;margin-bottom:8px;flex-wrap:wrap;';
        const which = document.createElement('select');
        which.style.cssText = 'padding:4px 8px;border:1px solid #ced4da;border-radius:4px;';
        [['v', 'DC bus voltages'], ['i', 'Currents']].forEach(([v, t]) => {
            const o = document.createElement('option');
            o.value = v;
            o.textContent = t;
            which.appendChild(o);
        });
        const span = document.createElement('select');
        span.style.cssText = which.style.cssText;
        [['all', 'Whole run'], ['event', 'Around the event (±2 ms)']].forEach(([v, t]) => {
            const o = document.createElement('option');
            o.value = v;
            o.textContent = t;
            span.appendChild(o);
        });
        row.appendChild(which);
        row.appendChild(span);
        body.appendChild(row);
        const wrap = document.createElement('div');
        wrap.style.cssText = 'height:340px;position:relative;';
        const canvas = document.createElement('canvas');
        wrap.appendChild(canvas);
        body.appendChild(wrap);
        const redraw = () => this._draw(canvas, which.value, span.value);
        which.onchange = redraw;
        span.onchange = redraw;
        redraw();
    }

    async _draw(canvas, which, span) {
        let ChartCtor;
        try {
            ChartCtor = await loadChartJs();
        } catch (e) {
            canvas.parentNode.innerHTML = `<p style="color:#c00;">${this._escape(e.message)}</p>`;
            return;
        }
        const t0 = this.emt.fault ? this.emt.fault.t_ms : null;
        const inSpan = p => span !== 'event' || t0 == null || (p.x >= t0 - 2 && p.x <= t0 + 2);
        const series = which === 'v'
            ? (this.emt.buses || []).map(b => ({ label: `${b.label} (kV)`, w: b.waveform, key: 'v_kv' }))
            : (this.emt.branches || []).map(b => ({ label: `${b.label} (kA)`, w: b.waveform, key: 'i_ka' }));
        const datasets = series.map((s, i) => ({
            label: s.label,
            data: s.w.t_ms.map((t, k) => ({ x: t, y: s.w[s.key][k] })).filter(inSpan),
            borderColor: PALETTE[i % PALETTE.length], borderWidth: 1.4, pointRadius: 0, backgroundColor: 'transparent'
        }));
        this.chart?.destroy?.();
        this.chart = new ChartCtor(canvas, {
            type: 'line',
            data: { datasets },
            options: {
                responsive: true, maintainAspectRatio: false, animation: false, parsing: false,
                plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } },
                scales: {
                    x: { type: 'linear', title: { display: true, text: 'Time [ms]' } },
                    y: { title: { display: true, text: which === 'v' ? 'Voltage [kV]' : 'Current [kA]' } }
                }
            }
        });
    }

    _renderAc(body) {
        const ac = this.emt.ac;
        if (!ac) return;
        const f = ac.fault;
        if (f) {
            this._h(body, `AC fault (${this._escape(f.kind)}) on ${f.bus} at ${fmt(f.t_ms, 1)} ms${f.t_off_ms != null ? `, cleared at ${fmt(f.t_off_ms, 1)} ms` : ''}`);
            body.appendChild(this._table([
                { label: 'Phase', align: 'left', value: p => p.phase },
                { label: 'Peak current (kA)', value: p => fmt(p.i_peak_ka) },
                { label: 'Rms current (kA)', title: 'Over the last cycle of the fault, its DC offset included', value: p => fmt(p.i_rms_ka) },
                { label: 'Symmetrical (kA)', title: 'Its 50 Hz component over the last cycle of the fault, as a short-circuit study gives it', value: p => fmt(p.i_sym_ka) }
            ], f.phases || []));
        }
        this._h(body, 'AC bus voltages (rms over a cycle)');
        body.appendChild(this._table([
            { label: 'AC bus', align: 'left', value: b => this._escape(b.label) },
            { label: 'Nominal (kV)', value: b => fmt(b.vn_kv, 2) },
            { label: 'Lowest phase (p.u.)', value: b => fmt(b.v_rms_min_pu) },
            { label: 'At (ms)', value: b => fmt(b.t_min_ms, 2) },
            { label: 'At the end (p.u.)', value: b => fmt(b.v_rms_final_pu) }
        ], ac.buses || []));
        this._h(body, 'AC waveforms');
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:12px;align-items:center;margin-bottom:8px;flex-wrap:wrap;';
        const which = document.createElement('select');
        which.style.cssText = 'padding:4px 8px;border:1px solid #ced4da;border-radius:4px;';
        (ac.buses || []).forEach((b, i) => {
            const o = document.createElement('option');
            o.value = `b${i}`;
            o.textContent = `${b.label}: phase voltages`;
            which.appendChild(o);
        });
        (ac.branches || []).forEach((b, i) => {
            const o = document.createElement('option');
            o.value = `r${i}`;
            o.textContent = `${b.label}: phase currents`;
            which.appendChild(o);
        });
        row.appendChild(which);
        body.appendChild(row);
        const wrap = document.createElement('div');
        wrap.style.cssText = 'height:320px;position:relative;margin-bottom:8px;';
        const canvas = document.createElement('canvas');
        wrap.appendChild(canvas);
        body.appendChild(wrap);
        const draw = async () => {
            let ChartCtor;
            try {
                ChartCtor = await loadChartJs();
            } catch (e) {
                return;
            }
            const isBus = which.value.startsWith('b');
            const item = isBus ? ac.buses[Number(which.value.slice(1))] : ac.branches[Number(which.value.slice(1))];
            const w = isBus ? item.waveform : item;
            const keys = isBus ? ['v_a_kv', 'v_b_kv', 'v_c_kv'] : ['i_a_ka', 'i_b_ka', 'i_c_ka'];
            const datasets = keys.map((key, i) => ({
                label: `Phase ${'abc'[i]}`,
                data: (w.t_ms || []).map((t, k) => ({ x: t, y: w[key][k] })),
                borderColor: ['#c0392b', '#e1a100', '#007cba'][i], borderWidth: 1.3, pointRadius: 0, backgroundColor: 'transparent'
            }));
            this.acChart?.destroy?.();
            this.acChart = new ChartCtor(canvas, {
                type: 'line',
                data: { datasets },
                options: {
                    responsive: true, maintainAspectRatio: false, animation: false, parsing: false,
                    plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } },
                    scales: {
                        x: { type: 'linear', title: { display: true, text: 'Time [ms]' } },
                        y: { title: { display: true, text: isBus ? 'Voltage [kV]' : 'Current [kA]' } }
                    }
                }
            });
        };
        which.onchange = draw;
        draw();
    }

    _renderWarnings(body) {
        const warnings = this.results.warnings || [];
        if (!warnings.length) return;
        const box = document.createElement('div');
        box.style.cssText = 'margin-top:14px;padding:10px 12px;background:#fff3cd;border-radius:6px;font-size:12.5px;';
        box.innerHTML = '<strong>Warnings</strong><ul style="margin:6px 0 0;padding-left:18px;">' +
            warnings.map(w => `<li>${this._escape(w)}</li>`).join('') + '</ul>';
        body.appendChild(box);
    }

    _exportCsv() {
        const lines = ['series,t_ms,value'];
        const add = (name, w, key) => w.t_ms.forEach((t, k) => lines.push([name, t, w[key][k]].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')));
        (this.emt.buses || []).forEach(b => add(`${b.label} voltage (kV)`, b.waveform, 'v_kv'));
        (this.emt.branches || []).forEach(b => add(`${b.label} current (kA)`, b.waveform, 'i_ka'));
        const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'emt_study.csv';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
}

if (typeof window !== 'undefined') {
    window.EmtResultsDialog = EmtResultsDialog;
}
