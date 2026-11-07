// stabilityStudies.js - the critical clearing time and the contingency batch (ANDES), PV and QV curves, and parameter sweeps
import { CriticalClearingDialog, ContingencyBatchDialog, VoltageStabilityDialog, ParameterSweepDialog, drawnElements } from './dialogs/StabilityStudyDialogs.js';
import ENV from './config/environment.js';
import { prepareNetworkData } from './utils/networkDataPreparation.js';
import { startSimulationProgress, settleSimulationProgress, formatDurationMs } from './utils/simulationProgressOverlay.js';

function getUserEmail() {
    try {
        const user = JSON.parse(localStorage.getItem('user') || 'null');
        if (user?.email) return user.email;
        if (window.getCurrentUser?.()?.email) return window.getCurrentUser().email;
    } catch (error) {
        console.warn('Error getting user email:', error);
    }
    return 'unknown@user.com';
}

async function results() {
    if (!window.StabilityStudyResults) await import('./dialogs/StabilityStudyResults.js');
    return window.StabilityStudyResults;
}

/** One study: its dialog, its request through the drawn network, and its results window. */
function runStudy(editorUi, graph, { Dialog, title, typ, key, render, params }) {
    if (!graph.isEnabled() || graph.isCellLocked(graph.getDefaultParent())) return;
    new Dialog(editorUi).show(async (values) => {
        if (!values || typeof values !== 'object') return;
        const progress = startSimulationProgress({ title: `${title} progress`, statusText: `Running ${title.toLowerCase()}…`, filePrefix: key });
        const overlay = progress.overlay;
        try {
            overlay.append('Preparing network data…', { time: true });
            const obj = prepareNetworkData(graph, { typ, ...params(values), user_email: getUserEmail() }, { removeResultCells: true });
            overlay.append('Sending request…', { time: true });
            const start = performance.now();
            const response = await fetch(ENV.backendUrl + '/', {
                mode: 'cors', method: 'post', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj), signal: progress.signal
            });
            if (response.status !== 200) throw new Error(`the server answered ${response.status}`);
            overlay.append(`Response in ${formatDurationMs(performance.now() - start)}`, { time: true });
            const text = (await response.text()).replace(/:\s*-Infinity/g, ': null').replace(/:\s*Infinity/g, ': null').replace(/:\s*NaN/g, ': null');
            const data = JSON.parse(text);
            await settleSimulationProgress(overlay, null, progress.abortController);
            const view = await results();
            // The drawn names, so that results can show labels rather than technical names.
            const names = Object.fromEntries(drawnElements(graph).buses.map((b) => [b.value, b.label]));
            view[render](data[key] || { error: true, message: data.message || 'The study returned nothing.' }, names);
        } catch (error) {
            const settled = await settleSimulationProgress(overlay, error, progress.abortController);
            if (settled.aborted) return;
            console.error(`${title} failed:`, error);
            alert(`${title} failed: ${error.message || error}`);
        }
    });
}

const asStrings = (values) => Object.fromEntries(Object.entries(values).map(([k, v]) => [k, String(v ?? '')]));

window.criticalClearingAndes = function (a, b) {
    runStudy(a, b, {
        Dialog: CriticalClearingDialog, title: 'Critical clearing time', typ: 'CriticalClearingAndes Parameters', key: 'critical_clearing', render: 'criticalClearing',
        params: (v) => ({ ...asStrings(v), fault_enabled: 'true' })
    });
};

window.contingencyBatchAndes = function (a, b) {
    runStudy(a, b, {
        Dialog: ContingencyBatchDialog, title: 'Contingency batch', typ: 'ContingencyBatchAndes Parameters', key: 'contingency_batch', render: 'contingencyBatch',
        params: asStrings
    });
};

window.voltageStabilityPandaPower = function (a, b) {
    runStudy(a, b, {
        Dialog: VoltageStabilityDialog, title: 'Voltage stability', typ: 'VoltageStabilityPandaPower Parameters', key: 'voltage_stability', render: 'voltageStability',
        params: asStrings
    });
};

window.parameterSweep = function (a, b) {
    runStudy(a, b, {
        Dialog: ParameterSweepDialog, title: 'Parameter sweep', typ: 'ParameterSweep Parameters', key: 'sweep', render: 'sweep',
        params: (v) => ({
            ...asStrings(v),
            metrics: JSON.stringify(String(v.metrics || '').split(',').map((m) => m.trim()).filter(Boolean))
        })
    });
};

export const criticalClearingAndes = window.criticalClearingAndes;
export const contingencyBatchAndes = window.contingencyBatchAndes;
export const voltageStabilityPandaPower = window.voltageStabilityPandaPower;
export const parameterSweep = window.parameterSweep;
