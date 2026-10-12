import ENV from './config/environment.js';
import { formatResultNameHeader } from './utils/attributeUtils.js';
import { prepareNetworkData } from './utils/networkDataPreparation.js';
import { referencedLoadProfiles } from './utils/loadProfileLibrary.js';
import {
    startSimulationProgress,
    settleSimulationProgress,
    formatDurationMs
} from './utils/simulationProgressOverlay.js';

function getUserEmail() {
    try {
        const userStr = localStorage.getItem('user');
        if (userStr) {
            const user = JSON.parse(userStr);
            if (user?.email) return user.email;
        }
        if (typeof getCurrentUser === 'function') {
            const currentUser = getCurrentUser();
            if (currentUser?.email) return currentUser.email;
        }
        if (window.getCurrentUser?.()) {
            const currentUser = window.getCurrentUser();
            if (currentUser?.email) return currentUser.email;
        }
        if (window.authHandler?.getCurrentUser) {
            const currentUser = window.authHandler.getCurrentUser();
            if (currentUser?.email) return currentUser.email;
        }
    } catch (error) {
        console.warn('Error getting user email:', error);
    }
    return 'unknown@user.com';
}

const tsFmt = (num, decimals = 3) => (num === null || num === undefined || !isFinite(num) ? 'N/A'
    : (Math.abs(num) < 0.5 * 10 ** -decimals ? 0 : Number(num)).toFixed(decimals));

function placeTsLabel(graph, cell, text) {
    const model = graph.getModel();
    // An element's placeholder hangs on its connecting line (connectedTo=<its id>): fill the
    // first, drop duplicates, as the other studies do.
    const all = window.findAllResultPlaceholdersForComponent
        ? window.findAllResultPlaceholdersForComponent(graph, cell) : [];
    const existing = all.length ? all[0].placeholder
        : (window.findResultPlaceholder ? window.findResultPlaceholder(graph, cell) : null);
    all.slice(1).forEach(({ placeholder }) => { try { model.remove(placeholder); } catch (_) { /* gone */ } });
    if (existing) model.setValue(existing, text);
    else if (window.insertResultBox) window.insertResultBox(graph, cell, text, { width: 80, height: 56, positionX: 0.5, positionY: 1.2 });
}

/**
 * The day on the drawing, not only in the results dialog: each element's range over the run
 * (and a source's or load's energy), each store's state of charge from start to end. The AC
 * rows name their element by its model name (mxCell_<n>), the stores and PCS by its cell id.
 * A box the run has nothing for - the DC buses and loads, in its totals alone - says so.
 */
function labelTimeSeriesCells(graph, data, request) {
    const model = graph.getModel();
    // The model names (mxCell_<n>) are the request's: each of its elements gives its cell's id.
    const byName = new Map();
    Object.values(request || {}).forEach((el) => {
        if (el && typeof el === 'object' && el.name != null && el.id != null) {
            const c = model.getCell(el.id);
            if (c && !byName.has(String(el.name))) byName.set(String(el.name), c);
        }
    });
    const cellOf = (row) => (row.id != null && (model.getCell(row.id) || byName.get(row.id))) || null;
    const groups = (rows) => {
        const out = new Map();
        (rows || []).forEach((r) => {
            const key = r.id ?? r.name;
            if (key == null) return;
            if (!out.has(key)) out.set(key, []);
            out.get(key).push(r);
        });
        out.forEach((rs) => rs.sort((a, b) => (a.time_step ?? 0) - (b.time_step ?? 0)));
        return out;
    };
    const values = (rs, k) => rs.map((r) => r[k]).filter((v) => v != null && isFinite(v));
    const range = (rs, k, d = 3) => {
        const v = values(rs, k);
        if (!v.length) return 'N/A';
        const lo = Math.min(...v), hi = Math.max(...v);
        return Math.abs(hi - lo) < 0.5 * 10 ** -d ? tsFmt(lo, d) : `${tsFmt(lo, d)} - ${tsFmt(hi, d)}`;
    };
    const hours = (Number(data.time_step_s) || 3600) / 3600;
    const energy = (rs) => values(rs, 'p_mw').reduce((s, p) => s + p * hours, 0);
    const steps = `${data.time_steps ?? ''} steps`.trim();
    model.beginUpdate();
    try {
        const each = (rows, fn) => groups(rows).forEach((rs) => {
            const cell = cellOf(rs[0]);
            if (cell) placeTsLabel(graph, cell, fn(rs, cell));
        });
        each(data.busbars, (rs, c) => `${formatResultNameHeader(c, rs[0].name, 'Bus')}
Time series (${steps})
U[pu]: ${range(rs, 'vm_pu')}`);
        each(data.externalgrids, (rs, c) => `${formatResultNameHeader(c, rs[0].name, 'External Grid')}
Time series (${steps})
P[MW]: ${range(rs, 'p_mw')}
E[MWh]: ${tsFmt(energy(rs), 2)} (+ import)`);
        each(data.gens, (rs, c) => `${formatResultNameHeader(c, rs[0].name, 'Generator')}
Time series (${steps})
P[MW]: ${range(rs, 'p_mw')}
E[MWh]: ${tsFmt(energy(rs), 2)}`);
        each(data.sgens, (rs, c) => `${formatResultNameHeader(c, rs[0].name, 'Static Generator')}
Time series (${steps})
P[MW]: ${range(rs, 'p_mw')}
E[MWh]: ${tsFmt(energy(rs), 2)}`);
        each(data.loads, (rs, c) => `${formatResultNameHeader(c, rs[0].name, 'Load')}
Time series (${steps})
P[MW]: ${range(rs, 'p_mw')}
E[MWh]: ${tsFmt(energy(rs), 2)}`);
        each(data.transformers, (rs, c) => `${formatResultNameHeader(c, rs[0].name, 'Transformer')}
Time series (${steps})
Loading[%]: ${range(rs, 'loading_percent', 1)}`);
        each(data.lines, (rs, c) => `${formatResultNameHeader(c, rs[0].name, 'Line')}
Time series (${steps})
Loading[%]: ${range(rs, 'loading_percent', 1)}`);
        const mg = data.microgrid || {};
        each(mg.pcs, (rs, c) => `${formatResultNameHeader(c, rs[0].label, 'PCS')}
Time series (${steps})
P[MW]: ${range(rs, 'p_mw')}
Q[MVar]: ${range(rs, 'q_mvar')}`);
        // Each store's state from the start of the run to its end, and its power over it.
        each(mg.ders, (rs, c) => {
            const last = rs[rs.length - 1];
            const state = rs[0].soc_percent != null
                ? `\nSoC[%]: ${tsFmt(rs[0].soc_percent, 2)} -> ${tsFmt(last.soc_percent_end ?? last.soc_percent, 2)}` : '';
            return `${formatResultNameHeader(c, rs[0].label, rs[0].kind || 'Store')}
Time series (${steps})
P[MW]: ${range(rs, 'p_mw')}${state}`;
        });
        const isBox = (s) => s && s.includes('shapeELXXX=Result');
        const text = (c) => (typeof c.value === 'string' ? c.value : (c.value?.getAttribute?.('label') || ''));
        Object.values(model.cells || {}).forEach((box) => {
            if (!isBox(model.getStyle(box)) || !/^\s*Click Simulate to generate results\s*$/.test(text(box))) return;
            const owner = (/connectedTo=([^;]+)/.exec(model.getStyle(box) || '') || [])[1];
            const c = (owner && model.getCell(owner)) || model.getParent(box);
            const name = c?.value?.getAttribute?.('userFriendlyName') || c?.value?.getAttribute?.('name') || '';
            model.setValue(box, `${name ? name + '\n' : ''}No time-series result`);
        });
    } finally {
        model.endUpdate();
        graph.getView?.().refresh?.();
    }
}

function timeSeriesSimulationPandaPower(apka, graph) {
    if (!graph.isEnabled() || graph.isCellLocked(graph.getDefaultParent())) {
        return;
    }

    function tryCreateDialog() {
        const DialogClass = globalThis.TimeSeriesSimulationDialog || window.TimeSeriesSimulationDialog;
        if (!DialogClass) {
            setTimeout(tryCreateDialog, 100);
            return;
        }

        const dialog = new DialogClass(graph);
        dialog.show(async (params) => {
            const runNumber = (globalThis.timeSeriesRunCount = (globalThis.timeSeriesRunCount || 0) + 1);
            console.log(`=== TIME SERIES SIMULATION #${runNumber} STARTED ===`, params);

            const simProgress = startSimulationProgress({
                title: 'Time series progress',
                statusText: 'Running time series simulation…',
                filePrefix: 'timeseries'
            });
            simProgress.overlay.append('Preparing network data…', { time: true });

            try {
                const simulationParameters = {
                    typ: 'TimeSeriesSimulationPandaPower Parameters',
                    time_steps: String(params.time_steps ?? 24),
                    time_step_s: String(params.time_step_s ?? 3600),
                    // The library profiles some load follows.
                    load_profiles: referencedLoadProfiles(graph),
                    load_profile: params.load_profile || 'constant',
                    generation_profile: params.generation_profile || 'constant',
                    profile_mode: params.profile_mode || 'custom',
                    element_profiles: params.element_profiles || {},
                    frequency: String(params.frequency ?? '50'),
                    algorithm: params.algorithm || 'nr',
                    calculate_voltage_angles: params.calculate_voltage_angles || 'auto',
                    init: params.init || 'auto',
                    microgrid_dispatch: !!params.microgrid_dispatch,
                    sofc_tau_s: String(params.sofc_tau_s ?? 900),
                    user_email: getUserEmail()
                };

                const networkData = prepareNetworkData(graph, simulationParameters, { removeResultCells: true });
                await processNetworkData(
                    ENV.backendUrl + '/',
                    networkData,
                    graph,
                    apka,
                    { exportToExcel: !!params.export_to_xlsx },
                    simProgress
                );
            } catch (err) {
                const settled = await settleSimulationProgress(simProgress.overlay, err, simProgress.abortController);
                if (settled.aborted) return;
                console.error('Time series simulation failed:', err);
                alert('Time series simulation failed: ' + (err.message || 'Unknown error'));
            }
        });
    }

    tryCreateDialog();
}

async function processNetworkData(url, obj, graph, apka, options = {}, simProgress = null) {
    const overlay = simProgress?.overlay;
    try {
        overlay?.append('Sending request…', { time: true });
        const requestStart = performance.now();
        const response = await fetch(url, {
            mode: 'cors',
            method: 'post',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(obj),
            signal: simProgress?.signal
        });

        if (response.status !== 200) {
            throw new Error('server');
        }

        overlay?.append(`Response ${response.status} in ${formatDurationMs(performance.now() - requestStart)}`, { time: true });
        overlay?.append('Processing results…', { time: true });
        let text = await response.text();
        text = text.replace(/:\s*-Infinity/g, ': null').replace(/:\s*Infinity/g, ': null').replace(/:\s*NaN/g, ': null');
        const dataJson = JSON.parse(text);
        console.log('Time Series Simulation Results:', dataJson);

        if (dataJson.error && dataJson.diagnostic) {
            overlay?.remove();
            if (window.DiagnosticReportDialog) {
                new window.DiagnosticReportDialog(dataJson.diagnostic).show();
            } else {
                alert(`Time Series Simulation failed: ${dataJson.message}\n\nException: ${dataJson.exception}`);
            }
            return;
        }

        if (dataJson.error) {
            overlay?.remove();
            alert('Time Series Simulation Error: ' + dataJson.error);
            return;
        }

        try {
            labelTimeSeriesCells(graph, dataJson, obj);
        } catch (labelErr) {
            console.warn('Time series results not placed on the diagram:', labelErr);
        }

        overlay?.append('Done.', { time: true });
        await settleSimulationProgress(overlay, null, simProgress?.abortController);

        if (window.TimeSeriesSimulationResultsDialog) {
            const dlg = new window.TimeSeriesSimulationResultsDialog(dataJson, {
                exportToExcel: options.exportToExcel
            });
            dlg.show();
        } else {
            alert('Time series simulation completed. Results dialog not available.');
        }
    } catch (err) {
        const settled = await settleSimulationProgress(overlay, err, simProgress?.abortController);
        if (settled.aborted) return;
        if (err.message === 'server') {
            alert('Time series simulation server error. Check that the backend is running.');
            return;
        }
        console.error('Error processing time series simulation data:', err);
        alert('Error processing time series results: ' + (err.message || 'Unknown error'));
    }
}

globalThis.timeSeriesSimulationPandaPower = timeSeriesSimulationPandaPower;
export { timeSeriesSimulationPandaPower };
