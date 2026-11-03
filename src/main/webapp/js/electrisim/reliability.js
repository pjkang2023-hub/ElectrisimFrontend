// reliability.js - the reliability study: expected energy not served by contingency enumeration over the
// protection zones of the network as drawn (in the operating state chosen, if one is) - backend
// reliability_electrisim.study()
import { ReliabilityDialog } from './dialogs/ReliabilityDialog.js';
import { ReliabilityResultsDialog } from './dialogs/ReliabilityResultsDialog.js';
import ENV from './config/environment.js';
import { lastTimeSeriesRun } from './utils/timeSeriesRun.js';
import { prepareNetworkData } from './utils/networkDataPreparation.js';
import {
    startSimulationProgress,
    settleSimulationProgress,
    formatDurationMs
} from './utils/simulationProgressOverlay.js';

window.reliabilityStudy = function (a, b, c) {
    let simProgress = null;

    function getUserEmail() {
        try {
            const userStr = localStorage.getItem('user');
            if (userStr) {
                const user = JSON.parse(userStr);
                if (user?.email) return user.email;
            }
        } catch (error) {
            console.warn('Error getting user email:', error);
        }
        return 'unknown@user.com';
    }

    async function run(url, obj, graph) {
        try {
            const overlay = simProgress?.overlay;
            overlay?.append('Sending request…', { time: true });
            const requestStart = performance.now();
            const response = await fetch(url, {
                mode: 'cors',
                method: 'post',
                headers: { 'Content-Type': 'application/json', 'Accept-Encoding': 'gzip' },
                body: JSON.stringify(obj),
                signal: simProgress?.signal
            });
            const dataJson = await response.json().catch(() => ({ error: true, message: `Backend returned ${response.status}` }));
            overlay?.append(`Response ${response.status} in ${formatDurationMs(performance.now() - requestStart)}`, { time: true });
            new ReliabilityResultsDialog(dataJson, graph).show();
            overlay?.append('Done.', { time: true });
            await settleSimulationProgress(overlay, null, simProgress?.abortController);
            simProgress = null;
        } catch (err) {
            const settled = await settleSimulationProgress(simProgress?.overlay, err, simProgress?.abortController);
            simProgress = null;
            if (settled.aborted) return;
            alert('The reliability study failed: ' + (err?.message || err));
        }
    }

    // The network of each design page, read by visiting the page; back on this page after, whatever happens.
    function designNetworks(ui, chosen, typ) {
        if (!chosen.length) return [];
        const home = ui.currentPage;
        const out = [];
        try {
            chosen.forEach((d) => {
                const page = ui.getPageById(d.page_id);
                if (!page) return;
                ui.selectPage(page, true);
                const net = prepareNetworkData(ui.editor.graph, { typ }, { removeResultCells: false });
                const network = {};
                Object.entries(net).forEach(([k, v]) => { if (!(v && v.typ === typ)) network[k] = v; });
                out.push({ name: d.name, capex_meur: d.capex_meur, own_inputs: d.own_inputs, network });
            });
        } finally {
            if (ui.currentPage !== home) ui.selectPage(home, true);
        }
        return out;
    }

    if (b.isEnabled() && !b.isCellLocked(b.getDefaultParent())) {
        const dialog = new ReliabilityDialog(a, b);
        dialog.show(function (values) {
            if (!values || typeof values !== 'object') return;
            simProgress = startSimulationProgress({
                title: 'Reliability progress',
                statusText: 'Enumerating faults over the protection zones…',
                filePrefix: 'reliability'
            });
            simProgress.overlay.append('Preparing network data…', { time: true });
            const typ = 'ReliabilityElectrisim Parameters';
            const { designs: chosen = [], ...rest } = values;
            // the Monte Carlo's load and storage from this page's last time-series run (utils/timeSeriesRun.js)
            if (rest.mc_profile_source === 'time_series' && Number(rest.mc_years) > 0) {
                const run = lastTimeSeriesRun(a);
                if (!run) {
                    simProgress.overlay.remove();
                    simProgress = null;
                    alert('No time-series run of this page to take the profiles from: run Time Series first, or choose the profiles below.');
                    return;
                }
                rest.mc_time_series = { time_step_s: run.time_step_s, stores: run.stores, loads: run.loads };
                simProgress.overlay.append(`Profiles from the time-series run at ${run.at} (${run.time_steps} steps)`, { time: true });
            }
            const simulationParameters = {
                typ,
                ...rest,
                page_name: a.currentPage?.getName?.() || 'This page',
                user_email: getUserEmail()
            };
            try {
                const designs = designNetworks(a, chosen, typ);
                if (designs.length) simProgress.overlay.append(`Designs beside this page: ${designs.map(d => d.name).join(', ')}`, { time: true });
                const prepared = prepareNetworkData(b, simulationParameters, { removeResultCells: false });
                // the designs ride on the study's own entry - a copy, the prepared payload is cached
                const obj = Object.fromEntries(Object.entries(prepared).map(([k, v]) =>
                    [k, v && v.typ === typ ? { ...v, designs } : v]));
                run(ENV.backendUrl + '/', obj, b);
            } catch (error) {
                console.error('Reliability network preparation failed:', error);
                alert('The reliability study could not read the network: ' + (error.message || error));
                simProgress?.overlay.remove();
                simProgress = null;
            }
        });
    }
};

export const reliabilityStudy = window.reliabilityStudy;
