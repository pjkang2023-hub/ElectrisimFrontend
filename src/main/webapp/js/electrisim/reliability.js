// reliability.js - the reliability study: expected energy not served by contingency enumeration over the
// protection zones of the network as drawn (in the operating state chosen, if one is) - backend
// reliability_electrisim.study()
import { ReliabilityDialog } from './dialogs/ReliabilityDialog.js';
import { ReliabilityResultsDialog } from './dialogs/ReliabilityResultsDialog.js';
import ENV from './config/environment.js';
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
            const simulationParameters = {
                typ: 'ReliabilityElectrisim Parameters',
                ...values,
                user_email: getUserEmail()
            };
            try {
                const obj = prepareNetworkData(b, simulationParameters, { removeResultCells: false });
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
