// The last time-series run of each page, kept for the reliability study's Monte Carlo (its profiles from that
// run): in this browser tab, and saved on the page's root cell so it is there again when the drawing is reopened.

export const TIME_SERIES_RUN_ATTRIBUTE = 'electrisim_time_series_run';

const round = (x, digits) => (typeof x === 'number' && Number.isFinite(x) ? Number(x.toFixed(digits)) : x);

function pageKey(page) {
    return page?.getId?.() || 'page';
}

/** The run as the reliability study takes it, from a time-series result: batteries' SOC and loads' demand per step. */
export function timeSeriesRunFrom(dataJson, page) {
    const stores = {};
    ((dataJson.microgrid && dataJson.microgrid.ders) || []).forEach((r) => {
        if (r.kind !== 'Battery') return;
        (stores[r.name] = stores[r.name] || { id: r.id, label: r.label, soc: [] }).soc.push(round(r.soc_percent_end, 3));
    });
    const loads = {};
    (dataJson.loads || []).forEach((r) => {
        // its demand, served or not: load shed in the run is still load the study can lose
        (loads[r.id] = loads[r.id] || { id: r.id, label: r.name, p_mw: [] }).p_mw.push(round(r.p_demand_mw ?? r.p_mw, 5));
    });
    return {
        pageName: page?.getName?.() || '',
        at: new Date().toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }),
        time_steps: dataJson.time_steps,
        time_step_s: dataJson.time_step_s,
        stores,
        loads
    };
}

/** Keep the run for the page the ui shows: in the tab, and on the page's root cell (one undoable change). */
export function keepTimeSeriesRun(ui, run) {
    const page = ui?.currentPage;
    const kept = globalThis.electrisimTimeSeriesRuns = globalThis.electrisimTimeSeriesRuns || {};
    kept[pageKey(page)] = run;
    const graph = ui?.editor?.graph;
    const model = graph?.getModel?.();
    const root = model?.getRoot?.();
    if (!root) return;
    let value = root.value;
    if (!value || typeof value !== 'object' || !value.cloneNode) {
        value = mxUtils.createXmlDocument().createElement('object');
        value.setAttribute('label', '');
    } else {
        value = value.cloneNode(true);
    }
    value.setAttribute(TIME_SERIES_RUN_ATTRIBUTE, JSON.stringify(run));
    model.setValue(root, value);
}

/** The page's last run: the one kept in this tab, else the one saved with the drawing; null when there is none. */
export function lastTimeSeriesRun(ui) {
    const page = ui?.currentPage;
    const kept = (globalThis.electrisimTimeSeriesRuns || {})[pageKey(page)];
    if (kept) return kept;
    const root = page?.root || ui?.editor?.graph?.getModel?.()?.getRoot?.();
    const raw = root?.value?.getAttribute?.(TIME_SERIES_RUN_ATTRIBUTE);
    if (!raw) return null;
    try {
        const run = JSON.parse(raw);
        return run && typeof run === 'object' && run.stores && run.loads ? run : null;
    } catch (e) {
        console.warn('The saved time-series run could not be read:', e);
        return null;
    }
}
