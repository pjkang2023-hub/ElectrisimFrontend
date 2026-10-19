// AcDcOpfResultsDialog.js - AC/DC optimal power flow results: shed, converters, branches, voltages
import { attachBackdropCloseHandler } from '../utils/dialogStyles.js';

const fmt = (x, d = 3) => (x === null || x === undefined || !isFinite(x) ? '—' : Number(x).toFixed(d));

export class AcDcOpfResultsDialog {
    constructor(results) {
        this.r = results || {};
    }

    _escape(s) {
        return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    _table(title, head, rows) {
        if (!rows.length) return '';
        const th = head.map(h => `<th style="text-align:left;padding:4px 10px;border-bottom:1px solid #dee2e6;">${h}</th>`).join('');
        const tr = rows.map(r => `<tr>${r.map(c => `<td style="padding:3px 10px;border-bottom:1px solid #f1f3f5;">${c}</td>`).join('')}</tr>`).join('');
        return `<h3 style="margin:18px 0 6px;font-size:14px;">${title}</h3>`
            + `<table style="border-collapse:collapse;width:100%;font-size:12px;"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`;
    }

    _loadingCell(x) {
        const over = Number(x) > 100.05;
        return `<span style="color:${over ? '#c0392b' : 'inherit'};font-weight:${over ? 700 : 400};">${fmt(x, 1)} %</span>`;
    }

    show() {
        const r = this.r;
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;';
        const close = () => overlay.remove();
        const shell = document.createElement('div');
        shell.style.cssText = "background:#fff;border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,0.28);max-width:1100px;width:100%;max-height:92vh;display:flex;flex-direction:column;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#212529;";
        const header = document.createElement('div');
        header.style.cssText = 'padding:18px 24px;border-bottom:1px solid #e9ecef;display:flex;align-items:center;justify-content:space-between;';
        header.innerHTML = '<h2 style="margin:0;font-size:18px;font-weight:700;">AC/DC Optimal Power Flow Results</h2>';
        const x = document.createElement('button');
        x.textContent = '×';
        x.title = 'Close';
        x.style.cssText = 'border:none;background:transparent;font-size:24px;line-height:1;cursor:pointer;color:#6c757d;';
        x.onclick = close;
        header.appendChild(x);
        shell.appendChild(header);

        const body = document.createElement('div');
        body.style.cssText = 'flex:1;overflow-y:auto;padding:20px 24px;font-size:13px;';
        let html = '';
        if (r.error) {
            html += `<div style="padding:12px;background:#f8d7da;color:#842029;border-radius:6px;">${this._escape(r.message || 'The study failed.')}</div>`;
        } else if (!r.solved) {
            html += `<div style="padding:12px;background:#fff3cd;color:#664d03;border-radius:6px;"><strong>Ipopt: ${this._escape(r.status)}.</strong> `
                + `${this._escape(r.message || '')}</div>`;
        } else {
            const shed = Number(r.shed_mw) || 0;
            html += `<div style="padding:12px;background:${shed > 1e-3 ? '#fff3cd' : '#d1e7dd'};border-radius:6px;">`
                + `<strong>${r.objective === 'shed' ? 'Least shed' : 'Least losses'}: optimal.</strong> `
                + `Grid ${fmt(r.grid?.p_mw)} MW, ${fmt(r.grid?.q_mvar)} Mvar (the load flow: ${fmt(r.grid?.load_flow_p_mw)} MW). `
                + `Shed ${fmt(shed)} MW. Batteries ${fmt(r.batteries_mw)} MW. `
                + `Ratings ${r.branch_limits ? `enforced (transformers × ${fmt(r.transformer_factor, 2)})` : 'not enforced'}.</div>`;
            const shedRows = [...(r.loads_dc || []), ...(r.loads_ac || [])]
                .map(d => [this._escape(d.name), `${fmt(d.p_full_mw)} MW`, `${fmt(d.p_full_mw - d.shed_mw)} MW`,
                    `<strong>${fmt(d.shed_mw)} MW</strong>`]);
            html += this._table('Loads', ['Load', 'Full', 'Served', 'Shed'], shedRows);
            html += this._table('Grid-forming PCS', ['PCS', 'P (MW)', 'Q (Mvar)', 'Loading'],
                (r.pcs || []).map(d => [this._escape(d.name), fmt(d.p_mw), fmt(d.q_mvar), this._loadingCell(d.loading_percent)]));
            html += this._table('AFEs (VSCs)', ['VSC', 'P (MW)', 'Q (Mvar)', 'Loading'],
                (r.afes || []).map(d => [this._escape(d.name), fmt(d.p_mw), fmt(d.q_mvar), this._loadingCell(d.loading_percent)]));
            html += this._table('Solid-state transformers', ['SST', 'MV draw (MW)', 'LV DC delivered (MW)'],
                (r.ssts || []).map(d => [this._escape(d.name), fmt(d.p_mv_mw), fmt(d.p_lvdc_mw)]));
            html += this._table('DC/DC converters', ['Converter', 'P out (MW)', 'Loading'],
                (r.dcdc || []).map(d => [this._escape(d.name), fmt(d.p_mw), this._loadingCell(d.loading_percent)]));
            html += this._table('DC diodes', ['Diode', 'P (MW)', 'I (kA)'],
                (r.diodes || []).map(d => [this._escape(d.name), fmt(d.p_mw), fmt(d.i_ka)]));
            html += this._table('PV arrays and fuel cells', ['Source', 'Kind', 'P (MW)', 'Most (MW)'],
                (r.sources || []).map(d => [this._escape(d.name), this._escape(d.kind), fmt(d.p_mw), fmt(d.p_max_mw)]));
            html += this._table('Generators', ['Generator', 'P (MW)', 'Q (Mvar)'],
                (r.generators || []).map(d => [this._escape(d.name), fmt(d.p_mw), fmt(d.q_mvar)]));
            html += this._table('Lines and transformers', ['Branch', 'Kind', 'Loading'],
                (r.branches || []).map(d => [this._escape(d.name), d.kind, this._loadingCell(d.loading_percent)]));
            html += this._table('Bus voltages', ['Bus', 'V (pu)'],
                (r.buses || []).map(d => [this._escape(d.name), fmt(d.vm_pu, 4)]));
        }
        const warnings = r.warnings || [];
        if (warnings.length) {
            html += `<h3 style="margin:18px 0 6px;font-size:14px;">Warnings (${warnings.length})</h3><ul style="margin:0;padding-left:18px;font-size:12px;color:#6c757d;">`
                + warnings.map(w => `<li>${this._escape(w)}</li>`).join('') + '</ul>';
        }
        body.innerHTML = html;
        shell.appendChild(body);

        const footer = document.createElement('div');
        footer.style.cssText = 'padding:12px 24px;border-top:1px solid #e9ecef;display:flex;justify-content:flex-end;gap:10px;';
        const json = document.createElement('button');
        json.textContent = 'Export JSON';
        json.style.cssText = 'padding:8px 14px;border:1px solid #ced4da;border-radius:6px;background:#fff;cursor:pointer;';
        json.onclick = () => {
            const blob = new Blob([JSON.stringify(r, null, 1)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'acdc_opf_results.json';
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        };
        const ok = document.createElement('button');
        ok.textContent = 'Close';
        ok.style.cssText = 'padding:8px 18px;border:none;border-radius:6px;background:#007cba;color:#fff;cursor:pointer;';
        ok.onclick = close;
        footer.append(json, ok);
        shell.appendChild(footer);
        overlay.appendChild(shell);
        document.body.appendChild(overlay);
        attachBackdropCloseHandler(overlay, shell, close);
    }
}
