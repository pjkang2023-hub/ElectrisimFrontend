// stateEstimation.js - State estimation (pandapower WLS) from simulated or entered measurements
import { formatResultNameHeader, enrichResultJsonWithDialogNames } from './utils/attributeUtils.js';
import { StateEstimationDialog } from './dialogs/StateEstimationDialog.js';
import { StateEstimationResultsDialog } from './dialogs/StateEstimationResultsDialog.js';
import ENV from './config/environment.js';
import { prepareNetworkData } from './utils/networkDataPreparation.js';
import {
    startSimulationProgress,
    settleSimulationProgress,
    formatDurationMs
} from './utils/simulationProgressOverlay.js';

window.stateEstimationPandaPower = function (a, b, c) {
    let simProgress = null;

    const formatNumber = (num, decimals = 3) => {
        if (num === null || num === undefined || (typeof num === 'number' && isNaN(num))) return 'N/A';
        return parseFloat(num).toFixed(decimals);
    };

    function getUserEmail() {
        try {
            const userStr = localStorage.getItem('user');
            if (userStr) {
                const user = JSON.parse(userStr);
                if (user?.email) return user.email;
            }
            if (window.getCurrentUser?.()?.email) return window.getCurrentUser().email;
            if (window.authHandler?.getCurrentUser?.()?.email) return window.authHandler.getCurrentUser().email;
        } catch (error) {
            console.warn('Error getting user email:', error);
        }
        return 'unknown@user.com';
    }

    /** Estimated voltage and angle beside each bus. */
    function labelBuses(graph, buses) {
        const model = graph.getModel();
        const findFn = window.findResultPlaceholder;
        const insertFn = window.insertResultBox;
        const fallbackStyle = window.RESULT_BOX_STYLE
            || 'shapeELXXX=Result;shape=rounded;rounded=1;arcSize=6;fillColor=#F8F9FA;strokeColor=#6C757D;strokeWidth=1.5;dashed=1;dashPattern=5 5;opacity=70;whiteSpace=wrap;html=1;overflow=hidden;align=center;verticalAlign=middle;fontSize=7;fontColor=#6C757D;fontStyle=0;spacing=3';
        model.beginUpdate();
        try {
            buses.forEach((bus) => {
                const cell = bus.id != null ? model.getCell(bus.id) : null;
                if (!cell) return;
                const text = `${formatResultNameHeader(cell, bus.name, 'Bus')}
SE V ${formatNumber(bus.vm_pu, 4)} pu
∠ ${formatNumber(bus.va_degree, 2)}°`;
                const existing = findFn ? findFn(graph, cell) : null;
                if (existing) {
                    model.setValue(existing, text);
                } else if (insertFn) {
                    insertFn(graph, cell, text, { width: 48, height: 40, positionX: 0, positionY: 1.0 });
                } else {
                    graph.insertVertex(cell, null, text, 0, 1.0, 48, 40, fallbackStyle, true);
                }
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

            if (!dataJson.error) {
                try {
                    enrichResultJsonWithDialogNames(dataJson, graph);
                } catch (e) {
                    console.warn('State estimation: names not enriched', e);
                }
                labelBuses(graph, dataJson.state_estimation?.buses || []);
            }
            new StateEstimationResultsDialog(dataJson).show();
            overlay?.append('Done.', { time: true });
            await settleSimulationProgress(overlay, null, simProgress?.abortController);
            simProgress = null;
        } catch (err) {
            const settled = await settleSimulationProgress(simProgress?.overlay, err, simProgress?.abortController);
            simProgress = null;
            if (settled.aborted || err.message === 'server') return;
            alert('Error processing state estimation results. ' + err + '\n\nCheck input data or contact electrisim@electrisim.com');
        }
    }

    if (b.isEnabled() && !b.isCellLocked(b.getDefaultParent())) {
        const dialog = new StateEstimationDialog(a);
        dialog.show(function (values) {
            if (!values || typeof values !== 'object') return;
            simProgress = startSimulationProgress({
                title: 'State estimation progress',
                statusText: 'Estimating the state…',
                filePrefix: 'stateestimation'
            });
            simProgress.overlay.append('Preparing network data…', { time: true });
            const simulationParameters = {
                typ: 'StateEstimationPandaPower Parameters',
                ...values,
                user_email: getUserEmail()
            };
            try {
                const obj = prepareNetworkData(b, simulationParameters, { removeResultCells: false });
                run(ENV.backendUrl + '/', obj, b);
            } catch (error) {
                console.error('State estimation network preparation failed:', error);
                alert('State estimation preparation failed: ' + (error.message || error));
                simProgress?.overlay.remove();
                simProgress = null;
            }
        });
    }
};

export const stateEstimationPandaPower = window.stateEstimationPandaPower;
