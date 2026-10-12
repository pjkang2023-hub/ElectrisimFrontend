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
        // An element's placeholder hangs on its connecting line (connectedTo=<its id>), not under
        // it: looking only among its children, each result went into a new box and the element's
        // own "Click Simulate to generate results" stayed beside it. Fill that one; drop duplicates.
        const all = window.findAllResultPlaceholdersForComponent
            ? window.findAllResultPlaceholdersForComponent(graph, cell) : [];
        const existing = all.length ? all[0].placeholder
            : (window.findResultPlaceholder ? window.findResultPlaceholder(graph, cell) : null);
        all.slice(1).forEach(({ placeholder }) => { try { model.remove(placeholder); } catch (_) { /* gone */ } });
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

    /**
     * Every result box still at its "Click Simulate to generate results" after the run - an
     * element the study gives nothing for - says so: dozens of them read as if the study had
     * yet to run.
     */
    function markUnstudied(graph, study) {
        const model = graph.getModel();
        const isBox = (s) => s && s.includes('shapeELXXX=Result');
        const text = (c) => (typeof c.value === 'string' ? c.value : (c.value?.getAttribute?.('label') || ''));
        Object.values(model.cells || {}).forEach((box) => {
            if (!isBox(model.getStyle(box)) || !/^\s*Click Simulate to generate results\s*$/.test(text(box))) return;
            const owner = (/connectedTo=([^;]+)/.exec(model.getStyle(box) || '') || [])[1];
            const cell = (owner && model.getCell(owner)) || model.getParent(box);
            const name = cell?.value?.getAttribute?.('userFriendlyName') || cell?.value?.getAttribute?.('name') || '';
            model.setValue(box, `${name ? name + '\n' : ''}No ${study} result`);
        });
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
            // The AC network's grid, transformers and generators: their peak phase current. A VSC's
            // AC-side peak goes into its converter box below.
            const acPeak = new Map();
            ((emt.ac && emt.ac.branches) || []).forEach((br) => {
                if (br.id == null || br.id === '') return;
                if (br.kind === 'VSC') { acPeak.set(br.id, br.i_peak_ka); return; }
                const cell = model.getCell(br.id);
                if (!cell) return;
                const side = /\(([^)]*side)\)\s*$/.exec(br.label || '');
                placeLabel(graph, cell, `${formatResultNameHeader(cell, (br.label || '').replace(/\s*\([^)]*side\)\s*$/, ''), br.kind || 'Element')}
EMT
I peak[kA]: ${fmt(br.i_peak_ka)}${side ? ` (${side[1]})` : ''}`, { width: 72, height: 44, positionX: 0.5, positionY: 1.2 });
            });
            // Each converter (VSC, PCS, DC/DC, an SST's stages): its power at the start and the end,
            // its lowest DC voltage, and whether it blocked. Stages sharing an element are listed together.
            const convByCell = new Map();
            (emt.converters || []).forEach((cv) => {
                if (cv.id == null || cv.id === '') return;
                if (!convByCell.has(cv.id)) convByCell.set(cv.id, []);
                convByCell.get(cv.id).push(cv);
            });
            convByCell.forEach((rows, id) => {
                const cell = model.getCell(id);
                if (!cell) return;
                const lines = rows.map((cv) => {
                    const stage = rows.length > 1 ? `${cv.label}: ` : '';
                    const vmin = cv.v_dc_min_kv != null ? `, Udc min ${fmt(cv.v_dc_min_kv)} kV` : '';
                    return `${stage}P ${fmt(cv.p_start_mw)} -> ${fmt(cv.p_end_mw)} MW${vmin}`
                        + (cv.blocked_ms != null ? `\nBLOCKED at ${fmt(cv.blocked_ms, 2)} ms` : '');
                });
                if (acPeak.has(id)) lines.push(`AC I peak ${fmt(acPeak.get(id))} kA`);
                placeLabel(graph, cell, `${formatResultNameHeader(cell, rows[0].label, 'Converter')}
EMT
${lines.join('\n')}`, { width: 80, height: 50, positionX: 0.5, positionY: 1.2 });
            });
            // Each DC load: its lowest voltage and, if it lost its supply, when.
            (emt.loads || []).forEach((ld) => {
                const cell = ld.id != null ? model.getCell(ld.id) : null;
                if (!cell) return;
                placeLabel(graph, cell, `${formatResultNameHeader(cell, ld.label, 'Load DC')}
EMT
U min[pu]: ${fmt(ld.v_min_pu)}
${ld.t_lost_ms != null ? `Lost supply at ${fmt(ld.t_lost_ms, 2)} ms` : (ld.verdict || 'Supplied')}`, { width: 72, height: 50, positionX: -0.3, positionY: 0 });
            });
            // Each source or store: its power at the start and the end, and its state.
            (emt.ders || []).forEach((der) => {
                const cell = der.id != null ? model.getCell(der.id) : null;
                if (!cell) return;
                const state = ['soc_percent', 'v_cap_v', 'speed_percent'].find((k) => der[`${k}_end`] != null);
                const stateLine = state ? `\n${{ soc_percent: 'SoC[%]', v_cap_v: 'U_cap[V]', speed_percent: 'Speed[%]' }[state]}: `
                    + `${fmt(der[`${state}_start`], 2)} -> ${fmt(der[`${state}_end`], 2)}` : '';
                placeLabel(graph, cell, `${formatResultNameHeader(cell, der.label, der.kind || 'Store')}
EMT
P[MW]: ${fmt(der.p_start_mw)} -> ${fmt(der.p_end_mw)}${stateLine}`, { width: 76, height: 50, positionX: -0.3, positionY: 0 });
            });
            // Each DC cable or busway with its peak current.
            (emt.branches || []).filter((br) => br.kind === 'DC cable').forEach((br) => {
                const cell = br.id != null ? model.getCell(br.id) : null;
                if (!cell) return;
                placeLabel(graph, cell, `${formatResultNameHeader(cell, (br.label || '').replace(/\s*\((from|to) end\)\s*$/, ''), 'DC Cable')}
EMT
I peak[kA]: ${fmt(br.i_peak_ka)}${br.t_peak_ms != null && Math.abs(br.i_peak_ka || 0) >= 5e-4 ? ` at ${fmt(br.t_peak_ms, 2)} ms` : ''}`,
                { width: 72, height: 44, positionX: 0.5, positionY: 1.2 });
            });
            // Each diode with its peak current and its current at the end: conducting or blocking.
            (emt.branches || []).filter((br) => br.kind === 'DC diode').forEach((br) => {
                const cell = br.id != null ? model.getCell(br.id) : null;
                if (!cell) return;
                const last = Array.isArray(br.waveform?.i_ka) && br.waveform.i_ka.length
                    ? br.waveform.i_ka[br.waveform.i_ka.length - 1] : null;
                const end = last != null && Math.abs(last) < 5e-4 ? 0 : last;
                placeLabel(graph, cell, `${formatResultNameHeader(cell, br.label, 'DC Diode')}
EMT
I peak[kA]: ${fmt(br.i_peak_ka)} at ${fmt(br.t_peak_ms, 2)} ms
I end[kA]: ${fmt(end)}${end != null ? (end > 1e-3 ? ' (conducting)' : ' (blocking)') : ''}`,
                { width: 76, height: 50, positionX: 0.5, positionY: 1.2 });
            });
            markUnstudied(graph, 'EMT');
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
