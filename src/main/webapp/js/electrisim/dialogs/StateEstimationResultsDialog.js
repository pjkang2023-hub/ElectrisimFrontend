// StateEstimationResultsDialog.js - state estimation results: the test summary, the
// estimated state against the load flow, and each measurement's residual.
import { attachBackdropCloseHandler } from '../utils/dialogStyles.js';
import { loadStateEstimationSettings, saveStateEstimationSettings } from './StateEstimationDialog.js';

function fmt(num, decimals = 3) {
    if (num === null || num === undefined || num === '' || Number.isNaN(Number(num))) return '—';
    const n = Number(num);
    return Number.isFinite(n) ? n.toFixed(decimals) : '—';
}

const STATUS_STYLE = {
    ok: { bg: '#d1e7dd', fg: '#0f5132', label: 'OK' },
    suspect: { bg: '#fff3cd', fg: '#664d03', label: 'Suspect' },
    removed: { bg: '#f8d7da', fg: '#842029', label: 'Removed' }
};

const TYPE_LABEL = { v: 'V', p: 'P', q: 'Q' };
const UNIT = { v: 'p.u.', p: 'MW', q: 'Mvar' };

export class StateEstimationResultsDialog {
    constructor(results) {
        this.results = results || {};
        this.se = this.results.state_estimation || {};
        this._tab = 'buses';
    }

    show() {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed; inset: 0; background: rgba(0,0,0,0.55); z-index: 10000;
            display: flex; align-items: center; justify-content: center; padding: 16px;
        `;
        overlay.className = 'state-estimation-results-overlay';

        const shell = document.createElement('div');
        shell.style.cssText = `
            background: #fff; border-radius: 10px; box-shadow: 0 8px 32px rgba(0,0,0,0.28);
            max-width: 1180px; width: 100%; max-height: 92vh;
            display: flex; flex-direction: column; overflow: hidden;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; color: #212529;
        `;

        const header = document.createElement('div');
        header.style.cssText = `
            padding: 18px 24px; border-bottom: 1px solid #e9ecef;
            display: flex; align-items: center; justify-content: space-between; flex-shrink: 0;
        `;
        const titleEl = document.createElement('h2');
        titleEl.textContent = 'State Estimation Results';
        titleEl.style.cssText = 'margin: 0; font-size: 18px; font-weight: 700;';
        header.appendChild(titleEl);
        const headerClose = document.createElement('button');
        headerClose.textContent = '×';
        headerClose.title = 'Close';
        headerClose.style.cssText = 'border: none; background: transparent; font-size: 24px; line-height: 1; cursor: pointer; color: #6c757d; padding: 0 4px;';
        headerClose.onclick = () => overlay.remove();
        header.appendChild(headerClose);
        shell.appendChild(header);

        const body = document.createElement('div');
        body.style.cssText = 'flex: 1; overflow-y: auto; padding: 20px 24px;';
        shell.appendChild(body);

        if (this.results.error) {
            this._renderError(body);
        } else {
            this._renderSummary(body);
            this._renderNotes(body);
            this._tabsHost = document.createElement('div');
            body.appendChild(this._tabsHost);
            this._tableHost = document.createElement('div');
            body.appendChild(this._tableHost);
            this._refresh();
        }

        const footer = document.createElement('div');
        footer.style.cssText = `
            padding: 14px 24px; border-top: 1px solid #e9ecef; display: flex; justify-content: flex-end;
            gap: 8px; flex-shrink: 0; background: #fafbfc; flex-wrap: wrap; align-items: center;
        `;
        if (!this.results.error && this.se.measurements_csv) {
            this._footerNote = document.createElement('span');
            this._footerNote.style.cssText = 'font-size: 12px; color: #6c757d; margin-right: auto;';
            footer.appendChild(this._footerNote);
            const copyBtn = this._button('Copy readings (CSV)', '#6c757d');
            copyBtn.onclick = () => this._copyReadings();
            footer.appendChild(copyBtn);
            const useBtn = this._button('Use readings as the entered table', '#198754');
            useBtn.title = 'The next State Estimation opens with these readings as its entered measurements, to edit and rerun.';
            useBtn.onclick = () => this._useReadings();
            footer.appendChild(useBtn);
        }
        const closeBtn = this._button('Close', '#007bff');
        closeBtn.onclick = () => overlay.remove();
        footer.appendChild(closeBtn);
        shell.appendChild(footer);

        overlay.appendChild(shell);
        attachBackdropCloseHandler(overlay, shell, () => overlay.remove());
        document.body.appendChild(overlay);
    }

    _button(label, bg) {
        const btn = document.createElement('button');
        btn.textContent = label;
        btn.style.cssText = `
            padding: 8px 16px; background: ${bg}; color: #fff; border: none;
            border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500;
        `;
        return btn;
    }

    _escape(text) {
        const div = document.createElement('div');
        div.textContent = String(text ?? '');
        return div.innerHTML;
    }

    _renderError(container) {
        const box = document.createElement('div');
        box.style.cssText = 'padding:16px; border:1px solid #f5c2c7; background:#f8d7da; color:#842029; border-radius:8px; line-height:1.5;';
        box.innerHTML = `<strong>State estimation failed</strong><br>${this._escape(this.results.message || 'Unknown error')}`;
        const errors = this.results.input_errors || [];
        if (errors.length) {
            const list = document.createElement('ul');
            list.style.cssText = 'margin: 10px 0 0; padding-left: 18px;';
            errors.forEach((e) => {
                const li = document.createElement('li');
                li.textContent = e;
                list.appendChild(li);
            });
            box.appendChild(list);
        }
        container.appendChild(box);
    }

    _card(label, value, sub, tone) {
        const tones = {
            good: ['#d1e7dd', '#0f5132'], bad: ['#f8d7da', '#842029'],
            warn: ['#fff3cd', '#664d03'], plain: ['#f8f9fa', '#212529']
        };
        const [bg, fg] = tones[tone || 'plain'];
        const card = document.createElement('div');
        card.style.cssText = `background:${bg}; color:${fg}; border-radius:8px; padding:10px 12px; min-width:150px; flex:1;`;
        card.innerHTML = `<div style="font-size:11px; text-transform:uppercase; letter-spacing:.04em; opacity:.75;">${this._escape(label)}</div>` +
            `<div style="font-size:18px; font-weight:700; margin-top:2px;">${this._escape(value)}</div>` +
            (sub ? `<div style="font-size:12px; margin-top:2px; opacity:.85;">${this._escape(sub)}</div>` : '');
        return card;
    }

    _renderSummary(container) {
        const s = this.se.summary || {};
        const grid = document.createElement('div');
        grid.style.cssText = 'display:flex; flex-wrap:wrap; gap:10px; margin-bottom:14px;';
        const byType = s.measurements_by_type || {};
        const typeText = Object.entries(byType).map(([k, n]) => `${n} ${k.replace('_', ' ')}`).join(', ');
        grid.appendChild(this._card('Estimator', s.estimator || '—',
            s.iterations != null ? `converged in ${s.iterations} iterations` : 'converged'));
        grid.appendChild(this._card('Measurements', String(s.measurements ?? '—'),
            (typeText || '') + (s.pseudo_measurements ? ` (${s.pseudo_measurements} pseudo)` : '')));
        grid.appendChild(this._card('Redundancy', fmt(s.redundancy, 2),
            `${s.state_variables ?? '—'} states (2 per bus, less the reference angle)`));
        if (s.objective_j != null) {
            const tone = s.chi2_passed == null ? 'warn' : (s.chi2_passed ? 'good' : 'bad');
            grid.appendChild(this._card('Chi-square test', s.chi2_passed == null ? 'Not applicable' : (s.chi2_passed ? 'Passed' : 'Failed'),
                `J ${fmt(s.objective_j, 2)}` + (s.chi2_threshold != null
                    ? ` vs ${fmt(s.chi2_threshold, 2)} at ${Math.round((s.chi2_confidence || 0.95) * 100)} %` : ' (no redundancy)'), tone));
        }
        if (s.max_normalized_residual != null) {
            const over = s.max_normalized_residual > (s.rn_threshold || 3);
            grid.appendChild(this._card('Largest normalized residual', fmt(s.max_normalized_residual, 2),
                `threshold ${fmt(s.rn_threshold, 1)}; ${s.bad_data_removed || 0} removed`, over ? 'warn' : (s.bad_data_removed ? 'warn' : 'good')));
        }
        if (s.compared_with_load_flow && s.max_vm_error_pu != null) {
            grid.appendChild(this._card('Largest |V| difference to the load flow', `${fmt(s.max_vm_error_pu * 100, 3)} %`,
                `angle ${fmt(s.max_va_error_degree, 3)}°`));
        }
        container.appendChild(grid);
    }

    _renderNotes(container) {
        const notes = [];
        (this.se.removed || []).forEach((r) => notes.push(['bad', `Bad data removed: ${r.label} (normalized residual ${fmt(r.normalized_residual, 1)})`]));
        (this.se.warnings || []).forEach((w) => notes.push(['warn', w]));
        (this.se.input_errors || []).forEach((w) => notes.push(['warn', `Skipped: ${w}`]));
        if (!notes.length) return;
        const box = document.createElement('div');
        box.style.cssText = 'margin-bottom:14px; display:flex; flex-direction:column; gap:6px;';
        notes.forEach(([tone, text]) => {
            const row = document.createElement('div');
            row.style.cssText = tone === 'bad'
                ? 'padding:8px 12px; border-radius:6px; background:#f8d7da; color:#842029; font-size:13px;'
                : 'padding:8px 12px; border-radius:6px; background:#fff3cd; color:#664d03; font-size:13px;';
            row.textContent = text;
            box.appendChild(row);
        });
        container.appendChild(box);
    }

    _refresh() {
        this._tabsHost.innerHTML = '';
        const bar = document.createElement('div');
        bar.style.cssText = 'display:flex; gap:4px; border-bottom:2px solid #e9ecef; margin-bottom:10px;';
        const tabs = [
            ['buses', `Buses (${(this.se.buses || []).length})`],
            ['branches', `Lines and transformers (${(this.se.branches || []).length})`],
            ['measurements', `Measurements (${(this.se.measurements || []).length})`]
        ];
        tabs.forEach(([key, label]) => {
            const tab = document.createElement('button');
            tab.textContent = label;
            const active = key === this._tab;
            tab.style.cssText = `border:none; background:${active ? '#f8f9fa' : 'transparent'}; padding:8px 14px; cursor:pointer;
                font-size:13px; font-weight:${active ? '600' : '400'}; border-bottom:2px solid ${active ? '#007bff' : 'transparent'}; margin-bottom:-2px;`;
            tab.onclick = () => { this._tab = key; this._refresh(); };
            bar.appendChild(tab);
        });
        this._tabsHost.appendChild(bar);
        this._tableHost.innerHTML = '';
        if (this._tab === 'buses') this._renderBuses(this._tableHost);
        else if (this._tab === 'branches') this._renderBranches(this._tableHost);
        else this._renderMeasurements(this._tableHost);
    }

    _table(headers, rows) {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'overflow-x:auto;';
        const table = document.createElement('table');
        table.style.cssText = 'width:100%; border-collapse:collapse; font-size:12.5px;';
        const thead = document.createElement('thead');
        const tr = document.createElement('tr');
        headers.forEach((h) => {
            const th = document.createElement('th');
            th.textContent = h;
            th.style.cssText = 'text-align:left; padding:6px 8px; background:#f1f3f5; border-bottom:1px solid #dee2e6; white-space:nowrap; position:sticky; top:0;';
            tr.appendChild(th);
        });
        thead.appendChild(tr);
        table.appendChild(thead);
        const tbody = document.createElement('tbody');
        rows.forEach((cells, i) => {
            const row = document.createElement('tr');
            row.style.background = i % 2 ? '#fcfcfd' : '#fff';
            cells.forEach((cell) => {
                const td = document.createElement('td');
                td.style.cssText = 'padding:5px 8px; border-bottom:1px solid #f1f3f5; white-space:nowrap;';
                if (cell instanceof Node) td.appendChild(cell);
                else td.textContent = cell;
                row.appendChild(td);
            });
            tbody.appendChild(row);
        });
        table.appendChild(tbody);
        wrap.appendChild(table);
        return wrap;
    }

    _renderBuses(host) {
        const lf = this.se.summary?.compared_with_load_flow;
        const headers = ['Bus', 'Vn (kV)', 'V est. (p.u.)', 'Angle est. (°)', 'P est. (MW)', 'Q est. (Mvar)'];
        if (lf) headers.push('V load flow (p.u.)', 'ΔV (%)', 'Δ angle (°)');
        const rows = (this.se.buses || []).map((b) => {
            const row = [b.name, fmt(b.vn_kv, 2), fmt(b.vm_pu, 4), fmt(b.va_degree, 3), fmt(b.p_mw, 3), fmt(b.q_mvar, 3)];
            if (lf) row.push(fmt(b.lf_vm_pu, 4), b.vm_error_pu == null ? '—' : fmt(b.vm_error_pu * 100, 3), fmt(b.va_error_degree, 3));
            return row;
        });
        host.appendChild(this._table(headers, rows));
    }

    _renderBranches(host) {
        const lf = this.se.summary?.compared_with_load_flow;
        const kind = { line: 'Line', trafo: 'Transformer', trafo3w: '3W transformer' };
        const headers = ['Element', 'Type', 'Side', 'P est. (MW)', 'Q est. (Mvar)', 'Loading est. (%)'];
        if (lf) headers.push('P load flow (MW)', 'Loading load flow (%)');
        const rows = (this.se.branches || []).map((b) => {
            const row = [b.name, kind[b.element_type] || b.element_type, b.side, fmt(b.p_mw, 3), fmt(b.q_mvar, 3), fmt(b.loading_percent, 1)];
            if (lf) row.push(fmt(b.lf_p_mw, 3), fmt(b.lf_loading_percent, 1));
            return row;
        });
        host.appendChild(this._table(headers, rows));
    }

    _renderMeasurements(host) {
        const simulated = (this.se.measurements || []).some(m => m.true_value != null);
        const headers = ['Reading', 'Element', 'Side', 'Source', 'Value', 'σ', 'Estimated', 'Residual', '|rN|', 'Status'];
        if (simulated) headers.splice(6, 0, 'True (load flow)');
        const rows = (this.se.measurements || []).map((m) => {
            const status = STATUS_STYLE[m.status] || STATUS_STYLE.ok;
            const badge = document.createElement('span');
            badge.textContent = status.label;
            badge.style.cssText = `background:${status.bg}; color:${status.fg}; padding:1px 8px; border-radius:10px; font-size:11.5px; font-weight:600;`;
            const digits = m.type === 'v' ? 4 : 3;
            const row = [
                `${TYPE_LABEL[m.type] || m.type} (${UNIT[m.type] || ''})${m.element_type === 'bus' && m.type !== 'v' ? ' injection' : ''}`,
                m.element, m.side || '—', m.source,
                fmt(m.value, digits), fmt(m.std_dev, digits),
                fmt(m.estimated, digits), fmt(m.residual, digits), fmt(m.normalized_residual, 2), badge
            ];
            if (simulated) row.splice(6, 0, fmt(m.true_value, digits));
            return row;
        });
        host.appendChild(this._table(headers, rows));
    }

    async _copyReadings() {
        try {
            await navigator.clipboard.writeText(this.se.measurements_csv);
            this._footerNote.textContent = 'Readings copied.';
        } catch (e) {
            this._footerNote.textContent = 'The clipboard is not available here: use "Use readings as the entered table".';
        }
    }

    _useReadings() {
        const settings = loadStateEstimationSettings();
        settings.measurements_csv = this.se.measurements_csv;
        settings.measurement_source = 'entered';
        saveStateEstimationSettings(settings);
        this._footerNote.textContent = 'The next State Estimation opens with these readings, entered.';
    }
}
