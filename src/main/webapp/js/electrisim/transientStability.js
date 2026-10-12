// transientStability.js - ANDES time-domain (transient stability) engine
import { TransientStabilityDialog } from './dialogs/TransientStabilityDialog.js';
import ENV from './config/environment.js';
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
        if (window.getCurrentUser?.()?.email) return window.getCurrentUser().email;
        if (window.authHandler?.getCurrentUser?.()?.email) {
            return window.authHandler.getCurrentUser().email;
        }
    } catch (error) {
        console.warn('Error getting user email:', error);
    }
    return 'unknown@user.com';
}

const tdsFmt = (num, decimals = 3) => (num === null || num === undefined || !isFinite(num) ? 'N/A'
    : (Math.abs(num) < 0.5 * 10 ** -decimals ? 0 : Number(num)).toFixed(decimals));

function placeTdsLabel(graph, cell, text) {
    const model = graph.getModel();
    // Fill the element's own placeholder (it hangs on its connecting line), drop duplicates.
    const all = window.findAllResultPlaceholdersForComponent
        ? window.findAllResultPlaceholdersForComponent(graph, cell) : [];
    let box = all.length ? all[0].placeholder
        : (window.findResultPlaceholder ? window.findResultPlaceholder(graph, cell) : null);
    all.slice(1).forEach(({ placeholder }) => { try { model.remove(placeholder); } catch (_) { /* gone */ } });
    if (box) model.setValue(box, text);
    else if (window.insertResultBox) box = window.insertResultBox(graph, cell, text, { width: 80, height: 56, positionX: 0.5, positionY: 1.2 });
    window.fitResultBox?.(graph, box);
}

/**
 * The run on the drawing, not only in its dialog: each bus its voltage range, the grid and each
 * machine its mean power and swing (peak to peak, strongest line), each PCS its power and its
 * store's state of charge, each converter following its racks its power range. ANDES names
 * its buses and machines by its own ids (1, GENROU_1): they are found by their diagram names.
 */
function labelTdsCells(graph, data, request) {
    const model = graph.getModel();
    const byName = new Map();
    Object.values(request || {}).forEach((el) => {
        if (el && typeof el === 'object' && el.userFriendlyName && el.id != null && !byName.has(el.userFriendlyName)) {
            const c = model.getCell(el.id);
            if (c) byName.set(String(el.userFriendlyName), c);
        }
    });
    const cellByName = (name) => byName.get(String(name || '').replace(/ \(DC network\)$/, '').replace(/ \(MV\)$/, '')) || null;
    const range = (vals, d = 3) => {
        const v = (vals || []).filter((x) => x != null && isFinite(x));
        if (!v.length) return 'N/A';
        const lo = Math.min(...v), hi = Math.max(...v);
        return Math.abs(hi - lo) < 0.5 * 10 ** -d ? tdsFmt(lo, d) : `${tdsFmt(lo, d)} - ${tdsFmt(hi, d)}`;
    };
    const tf = data.tf != null ? `${data.tf} s` : '';
    const head = `Transient stability${tf ? ` (${tf})` : ''}`;
    model.beginUpdate();
    try {
        (data.bus_voltage || []).forEach((s) => {
            const c = cellByName(s.name);
            if (c) placeTdsLabel(graph, c, `${s.name}\n${head}\nU[pu]: ${range(s.values)}`);
        });
        const swing = data.swing || {};
        const swingRow = (name) => [...(swing.grid || []), ...(swing.machines || [])].find((r) => r.name === name);
        const sourceLabel = (name, pSeries) => {
            const sw = swingRow(name);
            const strongest = sw?.dominant?.[0];
            return sw
                ? `P mean[MW]: ${tdsFmt(sw.mean_mw)}\nSwing p-p[MW]: ${tdsFmt(sw.peak_to_peak_mw)}`
                    + (strongest ? `\nStrongest: ${tdsFmt(strongest.f_hz, 2)} Hz, ${tdsFmt(strongest.amplitude_mw, 2)} MW` : '')
                : `P[MW]: ${range(pSeries)}`;
        };
        (swing.grid || []).forEach((r) => {
            const c = cellByName(r.name);
            if (c) placeTdsLabel(graph, c, `${r.name}\n${head}\n${sourceLabel(r.name)}`);
        });
        (data.generator_p_mw || []).forEach((s) => {
            const c = cellByName(s.name);
            if (!c) return;
            const omega = (data.omega || []).find((o) => o.name === s.name);
            placeTdsLabel(graph, c, `${s.name}\n${head}\n${sourceLabel(s.name, s.values)}${omega ? `\nω[pu]: ${range(omega.values, 4)}` : ''}`);
        });
        (data.pcs || []).forEach((r) => {
            const c = (r.id != null && model.getCell(r.id)) || cellByName(r.label);
            if (!c) return;
            const soc = Array.isArray(r.soc_percent) && r.soc_percent.length
                ? `\nSoC[%]: ${tdsFmt(r.soc_percent[0], 2)} -> ${tdsFmt(r.soc_percent[r.soc_percent.length - 1], 2)}` : '';
            placeTdsLabel(graph, c, `${r.label}\n${head}\nP[MW]: ${range(r.p_mw)}\nQ[MVar]: ${range(r.q_mvar)}${soc}`);
        });
        (data.load_profiles || []).forEach((lp) => {
            const c = cellByName(lp.load);
            if (c) placeTdsLabel(graph, c, `${String(lp.load).replace(/ \(DC network\)$/, '').replace(/ \(MV\)$/, '')}\n${head}\nP[MW]: ${range(lp.p_mw)}`);
        });
        const isBox = (s) => s && s.includes('shapeELXXX=Result');
        const text = (c) => (typeof c.value === 'string' ? c.value : (c.value?.getAttribute?.('label') || ''));
        Object.values(model.cells || {}).forEach((box) => {
            if (!isBox(model.getStyle(box)) || !/^\s*Click Simulate to generate results\s*$/.test(text(box))) return;
            const owner = (/connectedTo=([^;]+)/.exec(model.getStyle(box) || '') || [])[1];
            const c = (owner && model.getCell(owner)) || model.getParent(box);
            const name = c?.value?.getAttribute?.('userFriendlyName') || c?.value?.getAttribute?.('name') || '';
            model.setValue(box, `${name ? name + '\n' : ''}No transient-stability result`);
        });
    } finally {
        model.endUpdate();
        graph.getView?.().refresh?.();
    }
}

async function processResults(url, obj, simProgress, graph) {
    const overlay = simProgress?.overlay;
    try {
        overlay?.append('Sending request…', { time: true });
        const requestStart = performance.now();
        const response = await fetch(url, {
            mode: 'cors',
            method: 'post',
            headers: {
                'Content-Type': 'application/json',
                'Accept-Encoding': 'gzip'
            },
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
        if (dataJson.error) {
            overlay?.remove();
            const msg = dataJson.message || 'Transient stability calculation failed.';
            const detail = dataJson.exception ? `\n\n${dataJson.exception}` : '';
            alert(msg + detail);
            return;
        }
        if (graph) {
            try {
                labelTdsCells(graph, dataJson, obj);
            } catch (labelErr) {
                console.warn('Transient stability results not placed on the diagram:', labelErr);
            }
        }
        overlay?.append('Done.', { time: true });
        await settleSimulationProgress(overlay, null, simProgress?.abortController);
        if (window.TransientStabilityResultsDialog) {
            new window.TransientStabilityResultsDialog(dataJson).show();
        } else {
            await import('./dialogs/TransientStabilityResultsDialog.js');
            new window.TransientStabilityResultsDialog(dataJson).show();
        }
    } catch (err) {
        const settled = await settleSimulationProgress(overlay, err, simProgress?.abortController);
        if (settled.aborted) return;
        if (err.message === 'server') {
            alert('Transient stability server error. Check that the backend is running and ANDES is installed.');
            return;
        }
        console.error('Transient stability error:', err);
        alert('Error processing transient stability results: ' + (err.message || err));
    }
}

window.transientStabilityAndes = function (a, b, c) {
    const apka = a;
    const graph = b;

    if (!graph.isEnabled() || graph.isCellLocked(graph.getDefaultParent())) {
        return;
    }

    const dialog = new TransientStabilityDialog(a);
    dialog.show(async function (values) {
        if (!values || typeof values !== 'object') return;
        const simProgress = startSimulationProgress({
            title: 'Transient stability progress',
            statusText: 'Running transient stability (ANDES)…',
            filePrefix: 'transient-stability'
        });
        simProgress.overlay.append('Preparing network data…', { time: true });

        const simulationParameters = {
            typ: 'TransientStabilityAndes Parameters',
            frequency: String(values.frequency ?? '50'),
            sn_mva: String(values.sn_mva ?? '100'),
            tf: String(values.tf ?? '10'),
            tstep: String(values.tstep ?? '0'),
            fault_bus: values.fault_bus || '',
            fault_enabled: values.fault_bus ? 'true' : 'false',
            fault_tf: String(values.fault_tf ?? '1.0'),
            fault_tc: String(values.fault_tc ?? '1.1'),
            toggle_line: values.toggle_line || '',
            toggle_t: String(values.toggle_t ?? '2.0'),
            toggle_gen: values.toggle_gen || '',
            toggle_gen_t: String(values.toggle_gen_t ?? '2.0'),
            poi_bus: values.poi_bus || '',
            grid_voltage_profile: values.grid_voltage_profile || 'none',
            grid_voltage_table: String(values.grid_voltage_table ?? ''),
            grid_voltage_start_s: String(values.grid_voltage_start_s ?? '1.0'),
            // The library profiles some load follows through the run.
            load_profiles: referencedLoadProfiles(b),
            user_email: getUserEmail()
        };

        try {
            const obj = prepareNetworkData(graph, simulationParameters, { removeResultCells: true });
            await processResults(ENV.backendUrl + '/', obj, simProgress, graph);
        } catch (error) {
            const settled = await settleSimulationProgress(simProgress.overlay, error, simProgress.abortController);
            if (settled.aborted) return;
            console.error('Transient stability preparation failed:', error);
            alert('Preparation failed: ' + (error.message || error));
        }
    });
};

export const transientStabilityAndes = window.transientStabilityAndes;
