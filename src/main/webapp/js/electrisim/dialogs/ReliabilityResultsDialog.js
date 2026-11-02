// ReliabilityResultsDialog.js - the reliability study's results: the expected energy not served and its cost,
// by event class and event by event; an event clicked is outlined on the drawing (its zone, and the breaker
// that stuck or was out for maintenance); the live workbook downloads as .xlsx.
import { attachBackdropCloseHandler } from '../utils/dialogStyles.js';

const CLASS_LABEL = {
    zone: 'Zone fault, cleared by its breakers',
    stuck: 'Breaker fails to open',
    relay: 'Main protection fails (backup clears)',
    maint: 'Fault while a breaker is in maintenance',
    close: 'Restoration fails: a tie does not close',
    overlap: 'Second zone fault during a repair',
    blackout: 'Total blackout, black start fails'
};
const ZONE_COLOUR = '#d9480f';
const ALSO_COLOUR = '#f59f00';
const SHOWN = 60;

const fmt = (x, d = 3) => (x === null || x === undefined || !isFinite(x)) ? '-' : Number(x).toFixed(d);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class ReliabilityResultsDialog {
    constructor(results, graph) {
        this.results = results || {};
        this.graph = graph || window.App?.main?.editor?.graph;
        this.highlights = [];
        this.bar = null;
    }

    show() {
        const overlay = document.createElement('div');
        overlay.className = 'reliability-results-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:10000;display:flex;align-items:center;justify-content:center;';
        const dialog = document.createElement('div');
        dialog.style.cssText = 'background:#fff;border-radius:8px;box-shadow:0 6px 28px rgba(0,0,0,0.35);max-width:1180px;width:95%;max-height:90vh;overflow-y:auto;padding:24px;margin:20px;font-family:Arial,sans-serif;color:#222;';
        const title = document.createElement('h2');
        title.textContent = 'Reliability Results';
        title.style.margin = '0 0 12px 0';
        dialog.appendChild(title);
        this.overlay = overlay;

        if (this.results.error) {
            const box = document.createElement('div');
            box.style.cssText = 'padding:16px;border:1px solid #f5c2c7;background:#f8d7da;color:#842029;border-radius:6px;';
            box.innerHTML = `<strong>The reliability study failed</strong><br>${esc(this.results.message || 'Unknown error')}`;
            dialog.appendChild(box);
        } else {
            this._summary(dialog);
            this._comparison(dialog);
            this._monteCarlo(dialog);
            this._byClass(dialog);
            this._events(dialog);
        }

        const footer = document.createElement('div');
        footer.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;margin-top:20px;padding-top:14px;border-top:1px solid #e9ecef;';
        if (!this.results.error && this.results.workbook_xlsx_b64) {
            footer.appendChild(this._button('Download workbook (.xlsx)', '#28a745', () => this._downloadWorkbook()));
        }
        footer.appendChild(this._button('Close', '#007bff', () => this.close()));
        dialog.appendChild(footer);
        overlay.appendChild(dialog);
        attachBackdropCloseHandler(overlay, dialog, () => this.close());
        document.body.appendChild(overlay);
    }

    close() {
        this._clearHighlights();
        this.bar?.remove();
        this.bar = null;
        this.overlay?.remove();
    }

    _button(text, colour, onClick) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = text;
        b.style.cssText = `padding:8px 18px;background:${colour};color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:14px;`;
        b.onclick = onClick;
        return b;
    }

    _summary(dialog) {
        const r = this.results;
        const box = document.createElement('div');
        box.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin-bottom:14px;';
        const tile = (label, value, unit) => `<div style="border:1px solid #dee2e6;border-radius:6px;padding:10px 12px;">
            <div style="font-size:12px;color:#6c757d;">${esc(label)}</div>
            <div style="font-size:20px;font-weight:600;font-variant-numeric:tabular-nums;">${value} <span style="font-size:12px;font-weight:400;color:#6c757d;">${esc(unit)}</span></div></div>`;
        box.innerHTML = tile('IT energy not served', fmt(r.it_mwh_yr, 4), 'MWh/yr')
            + tile('Auxiliary energy not served', fmt(r.aux_mwh_yr, 3), 'MWh/yr')
            + tile('Cost at the values of lost load', fmt(r.cost_keur_yr, 1), 'kEUR/yr')
            + tile('Protection zones / events', `${r.zones ?? '-'} / ${r.events_enumerated ?? '-'}`, '');
        dialog.appendChild(box);
        const note = document.createElement('p');
        note.style.cssText = 'margin:0 0 14px 0;font-size:13px;color:#495057;line-height:1.5;';
        note.innerHTML = `Operating state <strong>${esc(r.state || '-')}</strong>. Events over the protection zones, to second order where counted; ` +
            'each consequence an island balance (no grid-forming source: dead; storage bridges what the sources cannot carry). ' +
            'Rates are planning values - the workbook keeps them editable.';
        dialog.appendChild(note);
    }

    // The year-long Monte Carlo: the means beside the enumeration's, the spread of the years and its histogram.
    _monteCarlo(dialog) {
        const mc = this.results.monte_carlo;
        if (!mc) return;
        const s = mc.simulated;
        const row = (a, b, c = '') => `<tr><td style="padding:5px 8px;border-bottom:1px solid #eee;">${a}</td><td style="padding:5px 8px;border-bottom:1px solid #eee;text-align:right;">${b}</td><td style="padding:5px 8px;border-bottom:1px solid #eee;color:#6c757d;">${c}</td></tr>`;
        const most = Math.max(...s.histogram.map(b => b.years), 1);
        const label = (b) => b.hi === 0 ? 'none' : b.hi === null ? `over ${b.lo}` : `${b.lo || '0'} to ${b.hi}`;
        const bars = s.histogram.map(b => `<div style="display:flex;align-items:center;gap:8px;font-size:12.5px;margin:2px 0;">
            <span style="width:110px;text-align:right;color:#495057;">${esc(label(b))}</span>
            <span style="height:12px;background:#1f6f5c;border-radius:2px;width:${b.years ? Math.max(2, 260 * Math.log10(1 + b.years) / Math.log10(1 + most)) : 0}px;"></span>
            <span style="font-variant-numeric:tabular-nums;">${b.years}</span></div>`).join('');
        const wrap = document.createElement('div');
        wrap.style.cssText = 'margin-bottom:16px;';
        wrap.innerHTML = `<h3 style="margin:6px 0 4px 0;font-size:16px;">Year-long Monte Carlo</h3>
            <p style="margin:0 0 8px 0;font-size:12.5px;color:#6c757d;">${mc.years.toLocaleString()} years (seed ${esc(mc.seed)}), repairs ${esc(mc.repair)}, storage back from empty in ${esc(mc.recharge_h)} h; ${mc.events_that_can_lose} of ${mc.events_enumerated} events can lose load.</p>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px;">
            <table style="border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums;">
            ${row('IT energy not served, enumeration', fmt(mc.analytic.it_mwh_yr, 4), 'MWh/yr')}
            ${row('expected over the profiles', fmt(mc.expected.it_mwh_yr, 4), 'MWh/yr, full storage')}
            ${row('simulated mean', `${fmt(s.it_mwh_yr, 4)} &plusmn; ${fmt(s.it_se, 4)}`, 'MWh/yr, 1 s.e.')}
            ${row('Years with any IT loss', `${fmt(100 * s.share_of_years_with_it_loss, 2)} %`, `1 in ${s.share_of_years_with_it_loss > 0 ? Math.round(1 / s.share_of_years_with_it_loss) : '-'}`)}
            ${row('IT interruptions', fmt(s.it_interruptions_per_yr, 4), `per year; size P50 ${fmt(s.interruption_p50_mwh, 1)}, P90 ${fmt(s.interruption_p90_mwh, 1)} MWh`)}
            ${row('A year\'s IT loss: P90 / P99 / P99.9', `${fmt(s.p90, 2)} / ${fmt(s.p99, 2)} / ${fmt(s.p999, 1)}`, 'MWh')}
            ${row('Worst year', fmt(s.worst, 1), 'MWh')}
            </table>
            <div><div style="font-size:12.5px;color:#495057;margin-bottom:4px;">Years by their IT energy not served (MWh; bars on a log scale)</div>${bars}</div>
            </div>`;
        dialog.appendChild(wrap);
    }

    // The designs on one table, lowest total first, and the sweep with its tie-points.
    _comparison(dialog) {
        const c = this.results.comparison;
        if (!c) return;
        const th = (t, right = true) => `<th style="padding:6px 8px;text-align:${right ? 'right' : 'left'};">${esc(t)}</th>`;
        const td = (t, right = true, bold = false) => `<td style="padding:5px 8px;border-bottom:1px solid #eee;text-align:${right ? 'right' : 'left'};${bold ? 'font-weight:600;' : ''}">${t}</td>`;
        const wrap = document.createElement('div');
        wrap.style.cssText = 'overflow-x:auto;margin-bottom:16px;';
        const designs = [...c.designs].sort((x, y) => x.rank - y.rank);
        let html = '';
        if (c.designs.length > 1) {
            html += `<h3 style="margin:6px 0 4px 0;font-size:16px;">Designs compared</h3>
                <p style="margin:0 0 8px 0;font-size:12.5px;color:#6c757d;">Total = cost of energy not served + capex x ${fmt(c.crf, 3)} per year; against the base, <strong>${esc(c.base)}</strong>. Break-even capex: the capex at which a design's total equals the base's. Other pages are studied as drawn.</p>
                <table style="border-collapse:collapse;width:100%;font-size:13px;font-variant-numeric:tabular-nums;">
                <tr style="background:#f5f5f5;">${th('Rank')}${th('Design', false)}${th('IT MWh/yr')}${th('Aux MWh/yr')}${th('Cost kEUR/yr')}${th('Capex MEUR')}${th('Total vs base kEUR/yr')}${th('Break-even capex MEUR')}</tr>
                ${designs.map(d => `<tr>${td(d.rank)}${td(esc(d.name), false, d.name === c.base)}${td(fmt(d.it_mwh_yr, 4))}${td(fmt(d.aux_mwh_yr, 3))}${td(fmt(d.cost_keur_yr, 1))}${td(fmt(d.capex_meur, 2))}${td(fmt(d.total_vs_base_keur_yr, 1))}${td(d.name === c.base ? '-' : fmt(d.break_even_capex_meur, 2))}</tr>`).join('')}
                </table>`;
            const notes = c.designs.filter(d => (d.notes || []).length);
            if (notes.length) {
                html += `<div style="margin-top:8px;padding:8px 10px;border:1px solid #ffe08a;background:#fff8e1;border-radius:4px;font-size:12.5px;">
                    <strong>Check the inputs</strong> - give a page its own in the dialog (its own inputs, e.g. transfer_groups=DH1_cordA+DH3_cordB, DH2_cordA+DH4_cordB):
                    ${notes.map(d => `<br>${esc(d.name)}: ${d.notes.map(esc).join('; ')}`).join('')}</div>`;
            }
        }
        const sw = c.sweep;
        if (sw) {
            const names = c.designs.map(d => d.name);
            const many = names.length > 1;
            html += `<h3 style="margin:14px 0 4px 0;font-size:16px;">Sweep: ${esc(sw.label)}</h3>
                <p style="margin:0 0 8px 0;font-size:12.5px;color:#6c757d;">${esc(sw.param)}, base value ${esc(sw.base_value)}; the value holds for every design. ${many ? 'Each design\'s total against the base, and the ranking.' : 'This page\'s energy not served and its cost.'}</p>
                <table style="border-collapse:collapse;width:100%;font-size:13px;font-variant-numeric:tabular-nums;">
                <tr style="background:#f5f5f5;">${th(sw.param, false)}${many
                    ? names.map(n => th(n)).join('') + th('Ranking, lowest total first', false)
                    : th('IT MWh/yr') + th('Aux MWh/yr') + th('Cost kEUR/yr')}</tr>
                ${sw.rows.map(r => `<tr>${td(esc(r.value), false, r.value === sw.base_value)}${many
                    ? names.map(n => td(fmt(r.designs[n].total_vs_base_keur_yr, 1))).join('') + td(esc(r.ranking.join(' < ')), false)
                    : td(fmt(r.designs[names[0]].it_mwh_yr, 4)) + td(fmt(r.designs[names[0]].aux_mwh_yr, 3)) + td(fmt(r.designs[names[0]].cost_keur_yr, 1))}</tr>`).join('')}
                </table>`;
            if (many) {
                html += sw.tie_points.length
                    ? `<p style="margin:8px 0 0 0;font-size:13px;"><strong>Tie-points</strong> (linear between the swept values): ${sw.tie_points.map(t => `${esc(sw.param)} = ${Number(t.value).toPrecision(4)}: ${esc(t.below)} cheaper below, ${esc(t.above)} above`).join('; ')}.</p>`
                    : '<p style="margin:8px 0 0 0;font-size:13px;">No tie-points: the ranking holds over the swept range.</p>';
            }
        }
        wrap.innerHTML = html;
        dialog.appendChild(wrap);
    }

    _byClass(dialog) {
        const by = this.results.by_class || {};
        const rows = Object.keys(CLASS_LABEL).filter(k => by[k]).map(k => {
            const c = by[k];
            return `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee;">${esc(CLASS_LABEL[k])}</td>
                <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${c.events}</td>
                <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${fmt(c.freq, 5)}</td>
                <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${fmt(c.it_mwh_yr, 4)}</td>
                <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${fmt(c.aux_mwh_yr, 4)}</td></tr>`;
        }).join('');
        const wrap = document.createElement('div');
        wrap.style.cssText = 'overflow-x:auto;margin-bottom:16px;';
        wrap.innerHTML = `<h3 style="margin:6px 0 8px 0;font-size:16px;">By class</h3>
            <table style="border-collapse:collapse;width:100%;font-size:13px;font-variant-numeric:tabular-nums;">
            <tr style="background:#f5f5f5;"><th style="padding:6px 8px;text-align:left;">Class</th><th style="padding:6px 8px;text-align:right;">Events</th>
            <th style="padding:6px 8px;text-align:right;">Frequency /yr</th><th style="padding:6px 8px;text-align:right;">IT MWh/yr</th>
            <th style="padding:6px 8px;text-align:right;">Aux MWh/yr</th></tr>${rows}</table>`;
        dialog.appendChild(wrap);
    }

    _events(dialog) {
        const events = this.results.events || [];
        const section = document.createElement('div');
        const head = document.createElement('h3');
        head.style.cssText = 'margin:6px 0 4px 0;font-size:16px;';
        head.textContent = `Events with energy not served (${events.length}), costliest first`;
        section.appendChild(head);
        const hint = document.createElement('p');
        hint.style.cssText = 'margin:0 0 8px 0;font-size:12.5px;color:#6c757d;';
        hint.textContent = 'Click an event to see it on the drawing: its zone outlined in red, the breaker that stuck or was out for maintenance in amber.';
        section.appendChild(hint);
        const wrap = document.createElement('div');
        wrap.style.cssText = 'overflow-x:auto;';
        const table = document.createElement('table');
        table.style.cssText = 'border-collapse:collapse;width:100%;font-size:12.5px;font-variant-numeric:tabular-nums;';
        table.innerHTML = `<tr style="background:#f5f5f5;"><th style="padding:6px 8px;text-align:left;">Class</th>
            <th style="padding:6px 8px;text-align:left;">Zone</th><th style="padding:6px 8px;text-align:left;">Detail</th>
            <th style="padding:6px 8px;text-align:right;">Frequency /yr</th><th style="padding:6px 8px;text-align:right;">IT short MW</th>
            <th style="padding:6px 8px;text-align:right;">IT MWh/yr</th><th style="padding:6px 8px;text-align:right;">Aux MWh/yr</th></tr>`;
        const addRows = (list) => list.forEach((e) => {
            const tr = document.createElement('tr');
            const clickable = (e.cells || []).length > 0;
            tr.style.cssText = `cursor:${clickable ? 'pointer' : 'default'};`;
            tr.innerHTML = `<td style="padding:5px 8px;border-bottom:1px solid #eee;">${esc(e.class)}</td>
                <td style="padding:5px 8px;border-bottom:1px solid #eee;max-width:280px;overflow-wrap:anywhere;">${esc(e.zone)}</td>
                <td style="padding:5px 8px;border-bottom:1px solid #eee;">${esc(e.detail)}</td>
                <td style="padding:5px 8px;border-bottom:1px solid #eee;text-align:right;">${fmt(e.freq, 6)}</td>
                <td style="padding:5px 8px;border-bottom:1px solid #eee;text-align:right;">${fmt(e.it_mw, 2)}</td>
                <td style="padding:5px 8px;border-bottom:1px solid #eee;text-align:right;">${fmt(e.it_mwh_yr, 5)}</td>
                <td style="padding:5px 8px;border-bottom:1px solid #eee;text-align:right;">${fmt(e.aux_mwh_yr, 5)}</td>`;
            if (clickable) {
                tr.title = 'Show on the drawing';
                tr.onmouseenter = () => { tr.style.background = '#f1f8f5'; };
                tr.onmouseleave = () => { tr.style.background = ''; };
                tr.onclick = () => this._showOnDrawing(e);
            }
            table.appendChild(tr);
        });
        addRows(events.slice(0, SHOWN));
        wrap.appendChild(table);
        section.appendChild(wrap);
        if (events.length > SHOWN) {
            const more = this._button(`Show all ${events.length}`, '#6c757d', () => { addRows(events.slice(SHOWN)); more.remove(); });
            more.style.marginTop = '8px';
            section.appendChild(more);
        }
        dialog.appendChild(section);
    }

    _clearHighlights() {
        this.highlights.forEach((h) => { try { h.destroy(); } catch (_) { /* gone */ } });
        this.highlights = [];
    }

    _showOnDrawing(e) {
        const graph = this.graph;
        if (!graph || typeof mxCellHighlight === 'undefined') return;
        this._clearHighlights();
        const model = graph.getModel();
        const also = new Set(e.also_cells || []);
        let first = null;
        (e.cells || []).forEach((id) => {
            const cell = model.getCell(id);
            const state = cell && graph.view.getState(cell);
            if (!state) return;
            const h = new mxCellHighlight(graph, also.has(id) ? ALSO_COLOUR : ZONE_COLOUR, 4);
            h.highlight(state);
            this.highlights.push(h);
            first = first || cell;
        });
        if (first) graph.scrollCellToVisible(first, true);
        this.overlay.style.display = 'none';
        this._showBar(e);
    }

    _showBar(e) {
        this.bar?.remove();
        const bar = document.createElement('div');
        bar.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:10001;background:#1f2a26;color:#fff;border-radius:6px;padding:10px 14px;display:flex;gap:12px;align-items:center;font:13px Arial,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,0.3);max-width:90vw;';
        const text = document.createElement('span');
        text.style.cssText = 'overflow-wrap:anywhere;';
        text.innerHTML = `<strong>${esc(CLASS_LABEL[e.class] || e.class)}</strong> - ${esc(e.zone)}${e.class === 'stuck' || e.class === 'maint' ? ` (${esc(e.detail)})` : e.class === 'overlap' ? ` with ${esc(e.detail)}` : ''}: ${fmt(e.it_mwh_yr, 5)} MWh/yr of IT`;
        const back = this._button('Back to results', '#007bff', () => {
            bar.remove();
            this.bar = null;
            this.overlay.style.display = 'flex';
        });
        const clear = this._button('Clear', '#6c757d', () => this.close());
        [back, clear].forEach(b => { b.style.padding = '6px 12px'; b.style.fontSize = '13px'; });
        bar.append(text, back, clear);
        document.body.appendChild(bar);
        this.bar = bar;
    }

    _downloadWorkbook() {
        try {
            const raw = atob(this.results.workbook_xlsx_b64);
            const bytes = new Uint8Array(raw.length);
            for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
            const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `reliability_${String(this.results.state || 'study').replace(/[^A-Za-z0-9_-]+/g, '_')}.xlsx`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (err) {
            console.error('Reliability workbook download failed:', err);
            alert('The workbook could not be downloaded: ' + (err?.message || err));
        }
    }
}

if (typeof window !== 'undefined') {
    window.ReliabilityResultsDialog = ReliabilityResultsDialog;
}
