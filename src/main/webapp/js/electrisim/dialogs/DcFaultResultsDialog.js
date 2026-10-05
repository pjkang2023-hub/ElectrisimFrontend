// DcFaultResultsDialog.js - DC fault study results: IEC terms per fault, breakers, waveforms
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
const PALETTE = ['#c0392b', '#007cba', '#e67e22', '#27ae60', '#8e44ad', '#16a085', '#2c3e50', '#d35400'];

export class DcFaultResultsDialog {
    constructor(results) {
        this.results = results || {};
        this.dc = this.results.dcfault || {};
        this.faults = this.dc.faults || [];
        this.chart = null;
    }

    show() {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed; inset: 0; background: rgba(0,0,0,0.55); z-index: 10000;
            display: flex; align-items: center; justify-content: center; padding: 16px;
        `;
        overlay.className = 'dc-fault-results-overlay';
        const close = () => {
            this.chart?.destroy?.();
            overlay.remove();
        };

        const shell = document.createElement('div');
        shell.style.cssText = `
            background: #fff; border-radius: 10px; box-shadow: 0 8px 32px rgba(0,0,0,0.28);
            max-width: 1180px; width: 100%; max-height: 92vh;
            display: flex; flex-direction: column; overflow: hidden;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; color: #212529;
        `;
        const header = document.createElement('div');
        header.style.cssText = 'padding: 18px 24px; border-bottom: 1px solid #e9ecef; display: flex; align-items: center; justify-content: space-between;';
        header.innerHTML = '<h2 style="margin:0;font-size:18px;font-weight:700;">DC Fault Study Results</h2>';
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
            body.innerHTML = `<div style="padding:12px;background:#f8d7da;color:#842029;border-radius:6px;">${this._escape(this.results.message || 'The DC fault study failed.')}</div>`;
            this._renderWarnings(body);
        } else {
            this._renderMethod(body);
            this._renderFaults(body);
            this._renderBreakers(body);
            this._renderWaveforms(body);
            this._renderWarnings(body);
        }

        const footer = document.createElement('div');
        footer.style.cssText = 'padding: 14px 24px; border-top: 1px solid #e9ecef; display: flex; justify-content: flex-end; gap: 8px; background: #fafbfc;';
        if (!this.results.error && this.faults.length) {
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

    _table(columns, rows) {
        const th = columns.map(c => `<th style="text-align:${c.align || 'right'};padding:6px 8px;border-bottom:2px solid #dee2e6;white-space:nowrap;" title="${this._escape(c.title || '')}">${c.label}</th>`).join('');
        const tr = rows.map(r => '<tr>' + columns.map(c => {
            const v = c.value(r);
            const style = c.style ? c.style(r) : '';
            return `<td style="text-align:${c.align || 'right'};padding:5px 8px;border-bottom:1px solid #f1f3f5;${style}">${v}</td>`;
        }).join('') + '</tr>').join('');
        return `<div style="overflow-x:auto;"><table style="border-collapse:collapse;width:100%;font-size:12.5px;"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`;
    }

    _renderMethod(body) {
        const s = this.dc.settings || {};
        const note = document.createElement('div');
        note.style.cssText = 'padding:10px 12px;background:#e7f1ff;border-radius:6px;margin-bottom:16px;color:#084298;';
        note.innerHTML = `<strong>Method.</strong> ${this._escape(this.dc.method || '')}<br>` +
            `<span style="color:#495057;">Fault resistance ${fmt(s.fault_resistance_mohm, 2)} mΩ · time step ${fmt(s.time_step_us, 2)} µs · ` +
            `duration ${fmt(s.duration_ms, 0)} ms · AC angle at the fault ${fmt(s.fault_angle_deg, 0)}°</span>`;
        body.appendChild(note);
    }

    _renderFaults(body) {
        const h = document.createElement('h3');
        h.textContent = 'Pole-to-pole fault on each DC bus';
        h.style.cssText = 'margin:0 0 8px;font-size:15px;';
        body.appendChild(h);
        const wrap = document.createElement('div');
        wrap.innerHTML = this._table([
            { label: 'DC bus', align: 'left', value: f => this._escape(f.label) },
            { label: 'V before (kV)', value: f => fmt(f.v_prefault_kv, 3) },
            { label: 'i<sub>p</sub> (kA)', title: 'Peak fault current', value: f => fmt(f.ip_ka, 3) },
            { label: 't<sub>p</sub> (ms)', title: 'Time to peak; for a current without a peak, the time it reaches 99 % of Ik', value: f => fmt(f.tp_ms, 3) + (f.monotonic ? ' *' : '') },
            { label: 'I<sub>k</sub> (kA)', title: 'Quasi-steady current: the mean over the last AC period with converters feeding the fault, else the last value', value: f => fmt(f.ik_ka, 3) + (f.settled ? '' : ' †') },
            { label: 'τ<sub>1</sub> (ms)', title: 'Rise time constant of IEC 61660-1\'s approximation function, fitted', value: f => fmt(f.tau1_ms, 3) },
            { label: 'τ<sub>2</sub> (ms)', title: 'Decay time constant, fitted', value: f => fmt(f.tau2_ms, 3) },
            { label: 'Fit rms (% of i<sub>p</sub>)', title: 'How well the IEC function fits the simulated current: rise / decay', value: f => `${fmt(f.rise_fit_rms_percent, 1)} / ${fmt(f.decay_fit_rms_percent, 1)}` },
            { label: 'di/dt (kA/ms)', title: 'Largest rate of rise in the first 0.1 ms', value: f => fmt(f.didt_ka_per_ms, 2) }
        ], this.faults);
        body.appendChild(wrap);
        const foot = document.createElement('div');
        foot.style.cssText = 'color:#6c757d;font-size:11.5px;margin:6px 0 18px;';
        foot.innerHTML = '* No peak of its own: the current rises to I<sub>k</sub>. † Not settled by the end of the run: lengthen the duration.';
        body.appendChild(foot);
    }

    _renderBreakers(body) {
        const breakers = this.dc.breakers || [];
        if (!breakers.length) return;
        const h = document.createElement('h3');
        h.textContent = 'DC breakers: the worst fault for each';
        h.style.cssText = 'margin:0 0 8px;font-size:15px;';
        body.appendChild(h);
        const wrap = document.createElement('div');
        wrap.innerHTML = this._table([
            { label: 'Breaker', align: 'left', value: b => this._escape(b.label) },
            { label: 'Worst fault on', align: 'left', value: b => this._escape(b.fault_bus) },
            { label: 'Opening time (ms)', value: b => fmt(b.opening_time_ms, 3) },
            { label: 'Current at opening (kA)', title: 'The prospective current through it when it opens', value: b => fmt(b.i_open_ka, 3) },
            { label: 'Breaking capacity (kA)', value: b => fmt(b.breaking_capacity_ka, 2) },
            { label: 'Reaches it at (ms)', value: b => fmt(b.t_reaches_capacity_ms, 3) },
            { label: 'Peak through it (kA)', value: b => fmt(b.ip_ka, 3) },
            {
                label: 'Check', align: 'center', value: b => (b.exceeds ? 'Exceeds' : 'OK'),
                style: b => (b.exceeds ? 'color:#842029;font-weight:700;' : 'color:#0f5132;font-weight:600;')
            }
        ], breakers);
        body.appendChild(wrap);
        const foot = document.createElement('div');
        foot.style.cssText = 'color:#6c757d;font-size:11.5px;margin:6px 0 18px;';
        foot.textContent = 'The breakers do not open in this study: the current at opening is the prospective one. Clearing, and the surge arrester\'s energy, belong to the EMT study.';
        body.appendChild(foot);
    }

    _renderWaveforms(body) {
        if (!this.faults.length) return;
        const h = document.createElement('h3');
        h.textContent = 'Fault current and where it comes from';
        h.style.cssText = 'margin:0 0 8px;font-size:15px;';
        body.appendChild(h);
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:12px;align-items:center;margin-bottom:8px;flex-wrap:wrap;';
        const select = document.createElement('select');
        select.style.cssText = 'padding:4px 8px;border:1px solid #ced4da;border-radius:4px;';
        this.faults.forEach((f, i) => {
            const o = document.createElement('option');
            o.value = String(i);
            o.textContent = `Fault on ${f.label}`;
            select.appendChild(o);
        });
        const span = document.createElement('select');
        span.style.cssText = select.style.cssText;
        [['all', 'Whole run'], ['10', 'First 10 ms'], ['2', 'First 2 ms']].forEach(([v, t]) => {
            const o = document.createElement('option');
            o.value = v;
            o.textContent = t;
            span.appendChild(o);
        });
        row.appendChild(select);
        row.appendChild(span);
        body.appendChild(row);
        this._contribHost = document.createElement('div');
        const chartWrap = document.createElement('div');
        chartWrap.style.cssText = 'height:320px;position:relative;margin-bottom:8px;';
        const canvas = document.createElement('canvas');
        chartWrap.appendChild(canvas);
        body.appendChild(chartWrap);
        body.appendChild(this._contribHost);
        const redraw = () => this._drawFault(canvas, this.faults[Number(select.value)], span.value);
        select.onchange = redraw;
        span.onchange = redraw;
        redraw();
    }

    async _drawFault(canvas, fault, span) {
        this._contribHost.innerHTML = this._table([
            { label: 'Contribution', align: 'left', value: c => `${this._escape(c.name)} <span style="color:#6c757d;">(${this._escape(c.kind)})</span>` },
            { label: 'i<sub>p</sub> (kA)', value: c => fmt(c.ip_ka, 3) },
            { label: 't<sub>p</sub> (ms)', value: c => fmt(c.tp_ms, 3) },
            { label: 'I<sub>k</sub> (kA)', value: c => fmt(c.ik_ka, 3) },
            { label: 'At the fault current\'s peak (kA)', value: c => fmt(c.at_peak_ka, 3) }
        ], fault.contributions || []);
        let ChartCtor;
        try {
            ChartCtor = await loadChartJs();
        } catch (e) {
            canvas.parentNode.innerHTML = `<p style="color:#c00;">${this._escape(e.message)}</p>`;
            return;
        }
        const limit = span === 'all' ? Infinity : Number(span);
        const points = (w) => w.t_ms.map((t, i) => ({ x: t, y: w.i_ka[i] })).filter(p => p.x <= limit);
        const datasets = [{
            label: `Fault current at ${fault.label}`, data: points(fault.waveform),
            borderColor: PALETTE[0], borderWidth: 2, pointRadius: 0, backgroundColor: 'transparent'
        }];
        (fault.contributions || []).forEach((c, i) => datasets.push({
            label: `${c.name} (${c.kind})`, data: points(c.waveform),
            borderColor: PALETTE[(i + 1) % PALETTE.length], borderWidth: 1.2, borderDash: [4, 3],
            pointRadius: 0, backgroundColor: 'transparent'
        }));
        this.chart?.destroy?.();
        this.chart = new ChartCtor(canvas, {
            type: 'line',
            data: { datasets },
            options: {
                responsive: true, maintainAspectRatio: false, animation: false, parsing: false,
                plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } },
                scales: {
                    x: { type: 'linear', title: { display: true, text: 'Time after the fault [ms]' } },
                    y: { title: { display: true, text: 'Current [kA]' } }
                }
            }
        });
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
        const lines = ['fault_bus,series,t_ms,i_ka'];
        this.faults.forEach((f) => {
            const add = (name, w) => w.t_ms.forEach((t, i) => lines.push([f.label, name, t, w.i_ka[i]].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')));
            add('fault current', f.waveform);
            (f.contributions || []).forEach(c => add(`${c.name} (${c.kind})`, c.waveform));
        });
        const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'dc_fault_study.csv';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
}

if (typeof window !== 'undefined') {
    window.DcFaultResultsDialog = DcFaultResultsDialog;
}
