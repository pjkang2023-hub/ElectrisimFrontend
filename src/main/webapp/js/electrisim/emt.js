// emt.js - EMT study of the DC networks: voltages and currents in time through a fault or a load step
import { formatResultNameHeader, enrichResultJsonWithDialogNames } from './utils/attributeUtils.js';
import { EmtDialog } from './dialogs/EmtDialog.js';
import { EmtResultsDialog } from './dialogs/EmtResultsDialog.js';
import { referencedLoadProfiles } from './utils/loadProfileLibrary.js';
import ENV from './config/environment.js';
import { prepareNetworkData } from './utils/networkDataPreparation.js';
import {
    startSimulationProgress,
    settleSimulationProgress,
    formatDurationMs
} from './utils/simulationProgressOverlay.js';

window.emtStudy = function (a, b, c) {
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
            if (window.getCurrentUser?.()?.email) return window.getCurrentUser().email;
            if (window.authHandler?.getCurrentUser?.()?.email) return window.authHandler.getCurrentUser().email;
        } catch (error) {
            console.warn('Error getting user email:', error);
        }
        return 'unknown@user.com';
    }

    function placeLabel(graph, cell, text, size) {
        const model = graph.getModel();
        const existing = window.findResultPlaceholder ? window.findResultPlaceholder(graph, cell) : null;
        if (existing) {
            model.setValue(existing, text);
        } else if (window.insertResultBox) {
            window.insertResultBox(graph, cell, text, size);
        } else {
            const style = window.RESULT_BOX_STYLE
                || 'shapeELXXX=Result;shape=rounded;rounded=1;arcSize=6;fillColor=#F8F9FA;strokeColor=#6C757D;strokeWidth=1.5;dashed=1;dashPattern=5 5;opacity=70;whiteSpace=wrap;html=1;overflow=hidden;align=center;verticalAlign=middle;fontSize=7;fontColor=#6C757D;fontStyle=0;spacing=3';
            graph.insertVertex(cell, null, text, size.positionX, size.positionY, size.width, size.height, style, true);
        }
    }

    /** Each DC bus with its lowest voltage; each breaker with what it interrupted and its arrester's energy. */
    function labelCells(graph, emt) {
        const model = graph.getModel();
        model.beginUpdate();
        try {
            (emt.buses || []).forEach((bus) => {
                const cell = bus.id != null ? model.getCell(bus.id) : null;
                if (!cell) return;
                placeLabel(graph, cell, `${formatResultNameHeader(cell, bus.label, 'DC Bus')}
EMT
U min[pu]: ${fmt(bus.v_min_pu)} at ${fmt(bus.t_min_ms, 2)} ms
U end[pu]: ${fmt(bus.v_final_pu)}`, { width: 72, height: 50, positionX: 0.5, positionY: 1.2 });
            });
            ((emt.ac && emt.ac.buses) || []).forEach((bus) => {
                const cell = bus.id != null ? model.getCell(bus.id) : null;
                if (!cell) return;
                placeLabel(graph, cell, `${formatResultNameHeader(cell, bus.label, 'Bus')}
EMT
U rms min[pu]: ${fmt(bus.v_rms_min_pu)} at ${fmt(bus.t_min_ms, 1)} ms
U rms end[pu]: ${fmt(bus.v_rms_final_pu)}`, { width: 76, height: 50, positionX: 0.5, positionY: 1.6 });
            });
            (emt.breakers || []).forEach((brk) => {
                const cell = brk.id != null ? model.getCell(brk.id) : null;
                if (!cell) return;
                const opened = brk.opened_ms != null;
                placeLabel(graph, cell, `${formatResultNameHeader(cell, brk.label, 'DC Breaker')}
${opened ? `Opened at ${fmt(brk.opened_ms, 2)} ms` : 'Stayed closed'}
${opened ? `Interrupted[kA]: ${fmt(brk.i_open_ka)}` : `Peak[kA]: ${fmt(brk.i_peak_ka)}`}
Arrester[kJ]: ${fmt(brk.arrester_energy_kj)}
${brk.exceeds_capacity || brk.exceeds_energy ? 'EXCEEDS' : 'OK'}`, { width: 72, height: 60, positionX: 0.5, positionY: 1.2 });
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
            if (!dataJson.error && dataJson.emt) {
                try {
                    enrichResultJsonWithDialogNames(dataJson, graph);
                } catch (e) {
                    console.warn('EMT study: names not enriched', e);
                }
                labelCells(graph, dataJson.emt);
            }
            new EmtResultsDialog(dataJson).show();
            overlay?.append('Done.', { time: true });
            await settleSimulationProgress(overlay, null, simProgress?.abortController);
            simProgress = null;
        } catch (err) {
            const settled = await settleSimulationProgress(simProgress?.overlay, err, simProgress?.abortController);
            simProgress = null;
            if (settled.aborted || err.message === 'server') return;
            alert('Error processing the EMT study results. ' + err + '\n\nCheck input data or contact electrisim@electrisim.com');
        }
    }

    if (b.isEnabled() && !b.isCellLocked(b.getDefaultParent())) {
        const dialog = new EmtDialog(a);
        dialog.show(function (values) {
            if (!values || typeof values !== 'object') return;
            simProgress = startSimulationProgress({
                title: 'EMT study progress',
                statusText: 'Simulating in time…',
                filePrefix: 'emt'
            });
            simProgress.overlay.append('Preparing network data…', { time: true });
            const simulationParameters = {
                typ: 'EmtStudy Parameters',
                ...values,
                // The library profiles some load follows through the run.
                load_profiles: referencedLoadProfiles(b),
                user_email: getUserEmail()
            };
            try {
                const obj = prepareNetworkData(b, simulationParameters, { removeResultCells: false });
                run(ENV.backendUrl + '/', obj, b);
            } catch (error) {
                console.error('EMT study network preparation failed:', error);
                alert('EMT study preparation failed: ' + (error.message || error));
                simProgress?.overlay.remove();
                simProgress = null;
            }
        });
    }
};

export const emtStudy = window.emtStudy;
