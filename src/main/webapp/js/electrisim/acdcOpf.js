// acdcOpf.js - AC/DC optimal power flow with least shed: the network with its DC side, solved with Ipopt
import { formatResultNameHeader } from './utils/attributeUtils.js';
import { AcDcOpfDialog } from './dialogs/AcDcOpfDialog.js';
import { AcDcOpfResultsDialog } from './dialogs/AcDcOpfResultsDialog.js';
import ENV from './config/environment.js';
import { prepareNetworkData } from './utils/networkDataPreparation.js';
import {
    startSimulationProgress,
    settleSimulationProgress,
    formatDurationMs
} from './utils/simulationProgressOverlay.js';

window.acdcOpfStudy = function (a, b, c) {
    let simProgress = null;

    const fmt = (num, decimals = 3) => {
        if (num === null || num === undefined || !isFinite(num)) return 'N/A';
        return Number(num).toFixed(decimals);
    };

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

    /** Fill the element's own result box (or add one), as the other studies do. */
    function placeLabel(graph, cell, text, size) {
        const model = graph.getModel();
        const all = window.findAllResultPlaceholdersForComponent
            ? window.findAllResultPlaceholdersForComponent(graph, cell) : [];
        const existing = all.length ? all[0].placeholder
            : (window.findResultPlaceholder ? window.findResultPlaceholder(graph, cell) : null);
        all.slice(1).forEach(({ placeholder }) => { try { model.remove(placeholder); } catch (_) { /* gone */ } });
        let box = existing;
        if (existing) {
            model.setValue(existing, text);
        } else if (window.insertResultBox) {
            box = window.insertResultBox(graph, cell, text, size);
        } else {
            return;
        }
        window.fitResultBox?.(graph, box);
    }

    /** Each DC load with what it is served and shed; each PCS and branch with its loading. */
    function labelCells(graph, r) {
        const model = graph.getModel();
        const size = { width: 84, height: 40, positionX: 0.5, positionY: 1.2 };
        model.beginUpdate();
        try {
            [...(r.loads_dc || []), ...(r.loads_ac || [])].forEach((d) => {
                const cell = d.id && model.getCell(d.id);
                if (!cell) return;
                placeLabel(graph, cell, `${formatResultNameHeader(cell, d.name, 'Load')}
Served: ${fmt(d.p_full_mw - d.shed_mw)} MW
Shed: ${fmt(d.shed_mw)} MW`, size);
            });
            (r.pcs || []).forEach((d) => {
                const cell = d.id && model.getCell(d.id);
                if (!cell) return;
                placeLabel(graph, cell, `${formatResultNameHeader(cell, d.name, 'PCS')}
P: ${fmt(d.p_mw)} MW, Q: ${fmt(d.q_mvar)} Mvar
Loading: ${fmt(d.loading_percent, 1)} %`, size);
            });
            (r.branches || []).forEach((d) => {
                const cell = d.id && model.getCell(d.id);
                if (!cell) return;
                placeLabel(graph, cell, `${formatResultNameHeader(cell, d.name, d.kind)}
Loading: ${fmt(d.loading_percent, 1)} %`, size);
            });
        } finally {
            model.endUpdate();
            graph.getView?.().refresh?.();
        }
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
            if (response.status !== 200) {
                throw new Error('server');
            }
            const dataJson = await response.json();
            overlay?.append(`Response ${response.status} in ${formatDurationMs(performance.now() - requestStart)}`, { time: true });
            if (!dataJson.error && dataJson.solved) {
                labelCells(graph, dataJson);
            }
            new AcDcOpfResultsDialog(dataJson).show();
            overlay?.append('Done.', { time: true });
            await settleSimulationProgress(overlay, null, simProgress?.abortController);
            simProgress = null;
        } catch (err) {
            const settled = await settleSimulationProgress(simProgress?.overlay, err, simProgress?.abortController);
            simProgress = null;
            if (settled.aborted || err.message === 'server') return;
            alert('Error processing the AC/DC optimal power flow results. ' + err);
        }
    }

    if (b.isEnabled() && !b.isCellLocked(b.getDefaultParent())) {
        const dialog = new AcDcOpfDialog(a);
        dialog.show(function (values) {
            if (!values || typeof values !== 'object') return;
            simProgress = startSimulationProgress({
                title: 'AC/DC optimal power flow progress',
                statusText: 'Solving the AC/DC optimal power flow…',
                filePrefix: 'acdc_opf'
            });
            simProgress.overlay.append('Preparing network data…', { time: true });
            const simulationParameters = {
                typ: 'AcDcOpfPandaPower Parameters',
                ...values,
                user_email: getUserEmail()
            };
            try {
                const obj = prepareNetworkData(b, simulationParameters, { removeResultCells: false });
                run(ENV.backendUrl + '/', obj, b);
            } catch (error) {
                console.error('AC/DC OPF network preparation failed:', error);
                alert('AC/DC optimal power flow preparation failed: ' + (error.message || error));
                simProgress?.overlay.remove();
                simProgress = null;
            }
        });
    }
};

export const acdcOpfStudy = window.acdcOpfStudy;
