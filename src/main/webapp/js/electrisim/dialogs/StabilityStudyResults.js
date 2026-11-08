// StabilityStudyResults.js - results of the critical clearing time, the contingency batch, PV and QV curves, and parameter sweeps
function loadChartJs() {
    if (typeof Chart !== 'undefined') return Promise.resolve(window.Chart);
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'js/vendor/chart.umd.min.js';
        script.dataset.electrisimChartjs = '1';
        script.onload = () => resolve(window.Chart);
        script.onerror = () => reject(new Error('Chart.js failed to load'));
        document.head.appendChild(script);
    });
}

function el(tag, css, text) {
    const node = document.createElement(tag);
    if (css) node.style.cssText = css;
    if (text != null) node.textContent = String(text);
    return node;
}

const fmt = (x, d = 3) => (x == null || Number.isNaN(Number(x)) ? '—' : (typeof x === 'number' ? Number(x).toFixed(d) : String(x)));

function table(columns, rows) {
    const t = el('table', 'width:100%;border-collapse:collapse;font-size:12px;margin-bottom:12px;');
    const head = el('tr', 'background:#f8f9fa;text-align:left;');
    columns.forEach(([label]) => head.appendChild(el('th', 'padding:6px;border-bottom:1px solid #dee2e6;', label)));
    t.appendChild(head);
    if (!rows.length) {
        const tr = el('tr');
        const td = el('td', 'padding:8px;color:#666;', 'Nothing to show.');
        td.colSpan = columns.length;
        tr.appendChild(td);
        t.appendChild(tr);
    }
    rows.forEach((row) => {
        const tr = el('tr');
        columns.forEach(([, get]) => {
            const value = get(row);
            const td = el('td', 'padding:6px;border-bottom:1px solid #eee;vertical-align:top;');
            if (value instanceof Node) td.appendChild(value); else td.textContent = value == null ? '—' : String(value);
            tr.appendChild(td);
        });
        t.appendChild(tr);
    });
    return t;
}

function badge(ok, yes = 'holds', no = 'fails') {
    return el('span', `display:inline-block;padding:2px 8px;border-radius:3px;color:#fff;font-weight:600;background:${ok ? '#28a745' : '#dc3545'};`, ok ? yes : no);
}

function chips(pairs) {
    const box = el('div', 'display:flex;flex-wrap:wrap;gap:10px;font-size:13px;margin-bottom:12px;');
    pairs.forEach(([k, v]) => {
        const c = el('div', 'background:#f1f3f5;padding:6px 10px;border-radius:4px;');
        c.appendChild(el('strong', null, `${k}: `));
        c.appendChild(document.createTextNode(v == null ? '—' : String(v)));
        box.appendChild(c);
    });
    return box;
}

function notes(body, warnings) {
    if (!warnings?.length) return;
    const box = el('div', 'margin-top:12px;padding:8px 10px;background:#fff3cd;border:1px solid #ffecb5;border-radius:4px;color:#664d03;font-size:12px;');
    box.appendChild(el('strong', null, `Notes (${warnings.length})`));
    const list = el('ul', 'margin:4px 0 0 18px;padding:0;');
    warnings.forEach((w) => list.appendChild(el('li', null, w)));
    box.appendChild(list);
    body.appendChild(box);
}

function heading(body, text) {
    body.appendChild(el('h3', 'margin:14px 0 8px;font-size:14px;', text));
}

async function lineChart(host, datasets, xTitle, yTitle, charts) {
    let ChartCtor;
    try {
        ChartCtor = await loadChartJs();
    } catch (e) {
        host.appendChild(el('p', 'color:#c00;', e.message));
        return;
    }
    const canvas = document.createElement('canvas');
    host.appendChild(canvas);
    charts.push(new ChartCtor(canvas, {
        type: 'line',
        data: { datasets: datasets.map((d) => ({ ...d, showLine: true, pointRadius: 2, borderWidth: 2, fill: false })) },
        options: {
            responsive: true, maintainAspectRatio: false, parsing: false,
            scales: { x: { type: 'linear', title: { display: true, text: xTitle } }, y: { title: { display: true, text: yTitle } } },
            plugins: { legend: { display: datasets.length > 1 && datasets.length <= 12 } }
        }
    }));
}

/** One results window; ``build(body, charts)`` fills it. */
function open(title, build) {
    const charts = [];
    const overlay = el('div', 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;');
    const dialog = el('div', 'background:#fff;border-radius:8px;box-shadow:0 4px 24px rgba(0,0,0,0.25);width:min(1100px,100%);max-height:92vh;overflow:hidden;font-family:Arial,sans-serif;display:flex;flex-direction:column;');
    const header = el('div', 'padding:18px 24px 10px;border-bottom:1px solid #eee;');
    header.appendChild(el('h2', 'margin:0;font-size:20px;', title));
    dialog.appendChild(header);
    const body = el('div', 'flex:1;overflow-y:auto;padding:16px 24px;');
    dialog.appendChild(body);
    const footer = el('div', 'display:flex;padding:14px 24px;border-top:1px solid #e9ecef;background:#fafbfc;');
    const close = el('button', 'background:#6c757d;color:#fff;border:none;padding:10px 20px;border-radius:4px;cursor:pointer;margin-left:auto;', 'Close');
    const shut = () => {
        charts.forEach((c) => c.destroy?.());
        if (overlay.parentNode) document.body.removeChild(overlay);
    };
    close.onclick = shut;
    footer.appendChild(close);
    dialog.appendChild(footer);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    import('../utils/dialogStyles.js').then(({ attachBackdropCloseHandler }) => attachBackdropCloseHandler(overlay, dialog, shut)).catch(() => {});
    if (build.error) {
        body.appendChild(el('div', 'padding:12px;background:#f8d7da;color:#842029;border-radius:6px;', build.error));
        return;
    }
    build(body, charts);
}

function failed(title, data) {
    const show = () => {};
    show.error = data?.message || 'The study did not run.';
    open(title, show);
}

function criticalClearing(r, names = {}) {
    const title = 'Critical Clearing Time';
    if (!r || r.error) return failed(title, r);
    open(title, (body) => {
        const cct = r.cct_s == null ? (r.at_least_s != null ? `holds to at least ${fmt(r.at_least_s, 3)} s` : '—') : `${fmt(r.cct_s, 3)} s`;
        body.appendChild(chips([['Fault bus', names[r.fault_bus] || r.fault_bus], ['Critical clearing time', cct], ['First failure', r.first_failure_s != null ? `${fmt(r.first_failure_s, 3)} s` : null],
            ['Tolerance', r.tolerance_s != null ? `${r.tolerance_s} s` : null]]));
        heading(body, 'Runs, in the order made');
        body.appendChild(table([
            ['Fault duration (s)', (x) => fmt(x.duration_s, 4)],
            ['Result', (x) => badge(x.holds)],
            ['Why', (x) => x.reason || '']
        ], r.runs || []));
        notes(body, r.warnings);
    });
}

function contingencyBatch(r) {
    const title = 'Dynamic Contingency Batch';
    if (!r || r.error) return failed(title, r);
    open(title, (body) => {
        body.appendChild(chips([['Contingencies', r.n], ['Fail', r.n_failed], ['Run to', r.tf != null ? `${r.tf} s` : null]]));
        body.appendChild(table([
            ['Contingency', (x) => x.name],
            ['Result', (x) => badge(x.holds)],
            ['Lost synchronism', (x) => (Array.isArray(x.lost_synchronism) ? (x.lost_synchronism.join(', ') || 'no') : (x.lost_synchronism ? 'yes' : 'no'))],
            ['Lowest end voltage (pu)', (x) => fmt(x.v_end_min_pu, 3)],
            ['Run ended (s)', (x) => fmt(x.run_end_s, 2)],
            ['Why', (x) => [x.reason, ...(x.warnings || [])].filter(Boolean).join(' ')]
        ], r.results || []));
    });
}

function voltageStability(r) {
    const title = 'Voltage Stability';
    if (!r || r.error) return failed(title, r);
    open(title, (body, charts) => {
        const host = el('div', 'height:340px;margin-bottom:12px;');
        if (r.v_pu) {
            body.appendChild(chips([['Bus', r.bus], ['Lowest Q', `${fmt(r.q_min_mvar, 2)} Mvar at ${fmt(r.v_at_q_min_pu, 3)} pu`], ['Reactive margin', `${fmt(r.reactive_margin_mvar, 2)} Mvar`]]));
            body.appendChild(host);
            lineChart(host, [{ label: r.bus, data: r.v_pu.map((v, i) => ({ x: v, y: r.q_mvar[i] })), borderColor: '#007cba' }], 'Voltage (pu)', 'Q supplied (Mvar)', charts);
            body.appendChild(table([['Voltage (pu)', (x) => fmt(x[0], 3)], ['Q (Mvar)', (x) => fmt(x[1], 2)]], r.v_pu.map((v, i) => [v, r.q_mvar[i]])));
        } else {
            const nose = r.nose;
            const lim = r.first_thermal_limit;
            body.appendChild(chips([['Load at start', `${fmt(r.p_base_mw, 2)} MW`],
                ['Nose', nose ? `${fmt(nose.p_total_mw, 2)} MW, ${fmt(nose.margin_percent, 1)} % margin` : 'not reached'],
                ['Weakest bus at the nose', nose ? `${nose.weakest_bus} at ${fmt(nose.weakest_vm_pu, 3)} pu` : null],
                ['First thermal limit', lim ? (lim.already_over ? `${lim.element} already over (${fmt(lim.loading_percent, 1)} %)` : `${lim.element} at ${fmt(lim.p_total_mw, 2)} MW, ${fmt(lim.margin_mw, 2)} MW margin`) : 'none on the curve']]));
            body.appendChild(host);
            const colors = ['#007cba', '#dc3545', '#28a745', '#fd7e14', '#6f42c1', '#20c997', '#e83e8c', '#6c757d'];
            const buses = (r.buses || []).slice().sort((a, b) => Math.min(...a.vm_pu) - Math.min(...b.vm_pu));
            // The lower branch, past the nose, dashed on the same axes, joined at the nose.
            const low = r.lower_branch;
            const lowOf = (name) => low?.buses?.find((x) => x.name === name);
            lineChart(host, buses.slice(0, 12).map((b, k) => ({
                label: b.name, borderColor: colors[k % colors.length],
                data: b.vm_pu.map((v, i) => ({ x: r.p_total_mw[i], y: v })).concat(
                    (lowOf(b.name)?.vm_pu || []).map((v, i) => ({ x: low.p_total_mw[i], y: v })))
            })), 'Total load (MW)', 'Voltage (pu)', charts);
            if (low) {
                body.appendChild(el('div', 'padding:6px 10px;background:#f8f9fa;border-radius:6px;margin-bottom:8px;',
                    `Lower branch: ${low.lambda.length} points past the nose, down to ${fmt(low.p_total_mw[low.p_total_mw.length - 1], 2)} MW; it stopped as ${low.stopped}.`));
            }
            if (r.q_limited?.length) {
                heading(body, 'Generators at a reactive limit');
                body.appendChild(table([['Generator', (g) => g.generator], ['Limit', (g) => g.limit], ['From load factor', (g) => fmt(g.lambda, 3)]], r.q_limited));
            }
            heading(body, 'Lowest buses at the nose');
            body.appendChild(table([['Bus', (b) => b.name], ['At the start (pu)', (b) => fmt(b.vm_pu[0], 3)], ['At the nose (pu)', (b) => fmt(b.vm_pu[b.vm_pu.length - 1], 3)]], buses.slice(0, 15)));
        }
        notes(body, r.warnings);
    });
}

function sweep(r) {
    const title = 'Parameter Sweep';
    if (!r || r.error) return failed(title, r);
    open(title, (body, charts) => {
        const rows = r.rows || [];
        const axes = rows.length ? Object.keys(rows[0].values || {}) : [];
        const metrics = rows.length ? Object.keys(rows.find((x) => x.metrics)?.metrics || {}) : [];
        body.appendChild(chips([['Runs', r.n], ['Failed', r.n_failed]]));
        if (axes.length === 1 && metrics.length) {
            const numeric = rows.filter((x) => x.metrics && typeof x.metrics[metrics[0]] === 'number');
            if (numeric.length > 1) {
                const host = el('div', 'height:300px;margin-bottom:12px;');
                body.appendChild(host);
                lineChart(host, metrics.filter((m) => numeric.every((x) => typeof x.metrics[m] === 'number')).map((m, k) => ({
                    label: m, borderColor: ['#007cba', '#dc3545', '#28a745', '#fd7e14'][k % 4], data: numeric.map((x) => ({ x: Number(x.values[axes[0]]), y: x.metrics[m] }))
                })), axes[0], 'Result', charts);
            }
        }
        body.appendChild(table([
            ...axes.map((a) => [a, (x) => x.values[a]]),
            ...metrics.map((m) => [m, (x) => {
                if (x.error) return '';
                const v = x.metrics?.[m];
                return typeof v === 'number' ? fmt(v, 4) : (typeof v === 'string' ? v : JSON.stringify(v ?? null));
            }]),
            ['Notes', (x) => x.error || (x.warnings ? `${x.warnings} warning(s)` : '')]
        ], rows));
        if (r.summary && Object.keys(r.summary).length) {
            heading(body, 'Range');
            body.appendChild(table([['Result', (x) => x[0]], ['Lowest', (x) => fmt(x[1].min, 4)], ['Highest', (x) => fmt(x[1].max, 4)]], Object.entries(r.summary)));
        }
    });
}

if (typeof window !== 'undefined') {
    window.StabilityStudyResults = { criticalClearing, contingencyBatch, voltageStability, sweep };
}

export { criticalClearing, contingencyBatch, voltageStability, sweep };
