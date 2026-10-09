// dcFault.js - DC fault study: a pole-to-pole fault on each DC bus, simulated in time,
// reported in IEC 61660-1's terms
import { formatResultNameHeader, enrichResultJsonWithDialogNames } from './utils/attributeUtils.js';
import { DcFaultDialog } from './dialogs/DcFaultDialog.js';
import { DcFaultResultsDialog } from './dialogs/DcFaultResultsDialog.js';
import ENV from './config/environment.js';
import { prepareNetworkData } from './utils/networkDataPreparation.js';
import {
    startSimulationProgress,
    settleSimulationProgress,
    formatDurationMs
} from './utils/simulationProgressOverlay.js';

window.dcFaultStudy = function (a, b, c) {
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

    /** Each DC bus with its fault's ip, tp and Ik; each breaker with its worst current at opening. */
    function labelCells(graph, dc) {
        const model = graph.getModel();
        model.beginUpdate();
        try {
            (dc.faults || []).forEach((f) => {
                const cell = f.id != null ? model.getCell(f.id) : null;
                if (!cell) return;
                placeLabel(graph, cell, `${formatResultNameHeader(cell, f.label, 'DC Bus')}
DC fault
ip[kA]: ${fmt(f.ip_ka)} at ${fmt(f.tp_ms, 2)} ms
Ik[kA]: ${fmt(f.ik_ka)}`, { width: 70, height: 50, positionX: 0.5, positionY: 1.2 });
            });
            (dc.breakers || []).forEach((brk) => {
                const cell = brk.id != null ? model.getCell(brk.id) : null;
                if (!cell) return;
                placeLabel(graph, cell, `${formatResultNameHeader(cell, brk.label, 'DC Breaker')}
At opening[kA]: ${fmt(brk.i_open_ka)}
Capacity[kA]: ${fmt(brk.breaking_capacity_ka, 1)}
${brk.exceeds ? 'EXCEEDS' : 'OK'}`, { width: 70, height: 50, positionX: 0.5, positionY: 1.2 });
            });
            // Each diode with its current before the fault, its peak and at the end: whether it
            // blocked backfeed into the fault or turned on as its shelf's other supply failed.
            // Each fault lists its diodes: a diode's worst over the faults studied.
            const worst = new Map();
            (dc.faults || []).forEach((f) => (f.diodes || []).forEach((d) => {
                const seen = worst.get(d.id);
                if (!seen || Math.abs(d.ip_ka || 0) > Math.abs(seen.ip_ka || 0)) worst.set(d.id, d);
            }));
            worst.forEach((d) => {
                const cell = d.id != null ? model.getCell(d.id) : null;
                if (!cell) return;
                placeLabel(graph, cell, `${formatResultNameHeader(cell, d.label, 'DC Diode')}
Before[kA]: ${fmt(d.i_prefault_ka)}
ip[kA]: ${fmt(d.ip_ka)} at ${fmt(d.tp_ms, 2)} ms
End[kA]: ${fmt(d.i_end_ka)} (${d.conducting_end ? 'conducting' : 'blocking'})`,
                { width: 76, height: 56, positionX: 0.5, positionY: 1.2 });
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
            if (!dataJson.error && dataJson.dcfault) {
                try {
                    enrichResultJsonWithDialogNames(dataJson, graph);
                } catch (e) {
                    console.warn('DC fault study: names not enriched', e);
                }
                labelCells(graph, dataJson.dcfault);
            }
            new DcFaultResultsDialog(dataJson).show();
            overlay?.append('Done.', { time: true });
            await settleSimulationProgress(overlay, null, simProgress?.abortController);
            simProgress = null;
        } catch (err) {
            const settled = await settleSimulationProgress(simProgress?.overlay, err, simProgress?.abortController);
            simProgress = null;
            if (settled.aborted || err.message === 'server') return;
            alert('Error processing the DC fault study results. ' + err + '\n\nCheck input data or contact electrisim@electrisim.com');
        }
    }

    if (b.isEnabled() && !b.isCellLocked(b.getDefaultParent())) {
        const dialog = new DcFaultDialog(a);
        dialog.show(function (values) {
            if (!values || typeof values !== 'object') return;
            simProgress = startSimulationProgress({
                title: 'DC fault study progress',
                statusText: 'Simulating the DC faults…',
                filePrefix: 'dcfault'
            });
            simProgress.overlay.append('Preparing network data…', { time: true });
            const simulationParameters = {
                typ: 'DcFaultStudy Parameters',
                ...values,
                user_email: getUserEmail()
            };
            try {
                const obj = prepareNetworkData(b, simulationParameters, { removeResultCells: false });
                run(ENV.backendUrl + '/', obj, b);
            } catch (error) {
                console.error('DC fault study network preparation failed:', error);
                alert('DC fault study preparation failed: ' + (error.message || error));
                simProgress?.overlay.remove();
                simProgress = null;
            }
        });
    }
};

export const dcFaultStudy = window.dcFaultStudy;
