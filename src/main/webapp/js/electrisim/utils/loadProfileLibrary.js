// loadProfileLibrary.js - the diagram's shared library of load power profiles.
//
// A profile is a load's active power over time, in per unit of its drawn P.
// The library is saved with the diagram, as an attribute of its root cell (the
// draw.io place for whole-diagram data), so several loads can follow one
// profile - many racks on one AI training cycle. Parsing and the upload report
// mirror backend/load_profiles_electrisim.py, which the studies use.

export const LOAD_PROFILE_LIBRARY_ATTRIBUTE = 'electrisim_load_profiles';
export const DEFAULT_STEP_THRESHOLD_PU = 0.2;

/** {t, p, notes} from CSV or TXT text: time (s) and power (p.u.) columns, or power alone every timeStepS. */
export function parseProfile(text, timeStepS = null) {
    const rows = [];
    let skipped = 0;
    String(text || '').split(/\r?\n/).forEach((raw) => {
        const line = raw.trim();
        if (!line) return;
        const cells = line.split(/[,;\t ]+/).filter(Boolean);
        const values = cells.map(Number);
        if (values.length && values.every(v => Number.isFinite(v)) && cells.every(c => c.trim() !== '' && !Number.isNaN(Number(c)))) {
            rows.push(values);
        } else {
            skipped += 1;
        }
    });
    if (!rows.length) {
        throw new Error('No numeric rows found: expected time (s) and power (p.u.) columns, or a power column.');
    }
    const notes = [];
    const widths = new Set(rows.map(r => r.length));
    let t;
    let p;
    if (widths.size === 1 && widths.has(1)) {
        const dt = Number(timeStepS);
        if (!(dt > 0)) throw new Error('The file has a single column: give the time step between its samples.');
        p = rows.map(r => r[0]);
        t = p.map((_, k) => k * dt);
    } else {
        if (Math.min(...widths) < 2) {
            throw new Error('Rows have different numbers of columns: expected time (s) and power (p.u.) on every row.');
        }
        if (Math.max(...widths) > 2) notes.push(`Only the first two of the ${Math.max(...widths)} columns are used: time and power.`);
        t = rows.map(r => r[0]);
        p = rows.map(r => r[1]);
    }
    if (skipped) notes.push(`${skipped} non-numeric line(s) skipped (headers or comments).`);
    if (t.length < 2) throw new Error('A profile needs at least two samples.');
    for (let k = 1; k < t.length; k++) {
        if (!(t[k] > t[k - 1])) throw new Error('Time must increase from each row to the next.');
    }
    return { t, p, notes };
}

function median(values) {
    const s = [...values].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** The upload report: what the profile contains and what to watch for. */
export function analyseProfile(t, p, stepThresholdPu = DEFAULT_STEP_THRESHOLD_PU) {
    const n = t.length;
    const dt = [];
    const dp = [];
    for (let k = 1; k < n; k++) {
        dt.push(t[k] - t[k - 1]);
        dp.push(p[k] - p[k - 1]);
    }
    const dtMedian = median(dt);
    const regular = dt.every(d => Math.abs(d - dtMedian) <= 1e-9 + 1e-3 * Math.abs(dtMedian));
    let area = 0;
    for (let k = 1; k < n; k++) area += 0.5 * (p[k] + p[k - 1]) * dt[k - 1];
    const duration = t[n - 1] - t[0];
    let maxRise = 0;
    let maxFall = 0;
    const steps = [];
    dp.forEach((d, k) => {
        const rate = d / dt[k];
        if (rate > maxRise) maxRise = rate;
        if (rate < maxFall) maxFall = rate;
        if (Math.abs(d) > stepThresholdPu) steps.push({ time_s: t[k + 1], from_pu: p[k], to_pu: p[k + 1], change_pu: d });
    });
    const min = Math.min(...p);
    const max = Math.max(...p);
    const flags = [];
    let overTime = 0;
    let zeroTime = 0;
    for (let k = 0; k < n - 1; k++) {
        if (p[k] > 1.0 + 1e-9) overTime += dt[k];
        if (Math.abs(p[k]) < 1e-6) zeroTime += dt[k];
    }
    if (max > 1.0 + 1e-9) {
        flags.push(`Exceeds 1.0 p.u. for ${overTime.toFixed(2)} s, up to ${max.toFixed(3)} p.u.: check against the load's rating.`);
    }
    if (min < 0) flags.push(`Negative values, down to ${min.toFixed(3)} p.u.: the load would generate.`);
    if (steps.length) {
        const biggest = steps.reduce((a, b) => (Math.abs(b.change_pu) > Math.abs(a.change_pu) ? b : a));
        const sign = biggest.change_pu >= 0 ? '+' : '';
        flags.push(`${steps.length} single-sample step(s) larger than ${stepThresholdPu} p.u.; the largest is `
            + `${sign}${biggest.change_pu.toFixed(3)} p.u. at ${biggest.time_s.toFixed(2)} s.`);
    }
    if (p.some(v => Math.abs(v) < 1e-6)) flags.push(`At zero for ${zeroTime.toFixed(2)} s: the load is off, not idling.`);
    if (!regular) flags.push(`Irregular sampling: steps from ${Math.min(...dt)} to ${Math.max(...dt)} s.`);
    return {
        samples: n,
        start_s: t[0],
        duration_s: duration,
        time_step_s: dtMedian,
        regular_sampling: regular,
        fastest_content_hz: 0.5 / dtMedian,
        min_pu: min,
        mean_pu: area / duration,
        max_pu: max,
        max_rise_pu_per_s: maxRise,
        max_fall_pu_per_s: maxFall,
        step_threshold_pu: stepThresholdPu,
        steps: steps.slice(0, 20),
        step_count: steps.length,
        flags,
    };
}

const round6 = v => Number(Number(v).toPrecision(6));

/** The stored form: regular profiles keep a time step instead of every time. */
export function profileEntry(name, t, p, source = '', kind = 'power') {
    const report = analyseProfile(t, p);
    const entry = { name: String(name || 'Profile'), source: String(source || ''), p: p.map(round6) };
    if (kind && kind !== 'power') entry.kind = kind;
    if (report.regular_sampling) {
        entry.t0 = round6(t[0]);
        entry.dt = round6(report.time_step_s);
    } else {
        entry.t = t.map(round6);
    }
    return entry;
}

/** (t, p) of a stored entry. */
export function entryArrays(entry) {
    const p = (entry?.p || []).map(Number);
    const t = Array.isArray(entry?.t) ? entry.t.map(Number)
        : p.map((_, k) => Number(entry?.t0 || 0) + k * Number(entry?.dt));
    return { t, p };
}

function rootCell(graph) {
    return graph?.getModel?.()?.getRoot?.() || null;
}

/** {id: entry} saved with the diagram; empty when there is none or it cannot be read. */
export function getLoadProfileLibrary(graph) {
    const root = rootCell(graph);
    const value = root?.value;
    const raw = value && typeof value === 'object' && value.getAttribute
        ? value.getAttribute(LOAD_PROFILE_LIBRARY_ATTRIBUTE) : null;
    if (!raw) return {};
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
        console.warn('Load profile library could not be read:', e);
        return {};
    }
}

/** Save the library on the diagram's root cell, as one undoable change. */
export function setLoadProfileLibrary(graph, library) {
    const model = graph.getModel();
    const root = rootCell(graph);
    if (!root) throw new Error('The diagram has no root cell.');
    let value = root.value;
    if (!value || typeof value !== 'object' || !value.cloneNode) {
        value = mxUtils.createXmlDocument().createElement('object');
        value.setAttribute('label', '');
    } else {
        value = value.cloneNode(true);
    }
    if (library && Object.keys(library).length) {
        value.setAttribute(LOAD_PROFILE_LIBRARY_ATTRIBUTE, JSON.stringify(library));
    } else {
        value.removeAttribute(LOAD_PROFILE_LIBRARY_ATTRIBUTE);
    }
    model.setValue(root, value);
}

export function newProfileId(library) {
    let k = Object.keys(library || {}).length + 1;
    while ((library || {})[`profile_${k}`]) k += 1;
    return `profile_${k}`;
}

function isLoadCell(cell) {
    const style = String(cell?.style || '');
    return /shapeELXXX=Load( DC)?(;|$)/.test(style);     // AC loads, and DC loads (in the EMT study)
}

function isPvArrayCell(cell) {
    return /shapeELXXX=PV Array(;|$)/.test(String(cell?.style || ''));
}

/** A profile's kind: a load's power (p.u.), or a PV array's irradiance (W/m2) or ambient temperature (C). */
export const PROFILE_KINDS = { power: 'Power (p.u.)', irradiance: 'Irradiance (W/m2)', temperature: 'Temperature (C)' };

export function profileKind(entry) {
    return entry?.kind && PROFILE_KINDS[entry.kind] ? entry.kind : 'power';
}

/** The loads, and PV arrays, that follow each profile: {id: [names]}. */
export function profileUsers(graph) {
    const users = {};
    const cells = graph?.getModel?.()?.cells || {};
    Object.values(cells).forEach((cell) => {
        if (!cell.value?.getAttribute) return;
        const keys = isLoadCell(cell) ? ['load_profile_id']
            : isPvArrayCell(cell) ? ['irradiance_profile_id', 'temperature_profile_id'] : [];
        keys.forEach((key) => {
            const id = cell.value.getAttribute(key);
            if (!id) return;
            const name = cell.value.getAttribute('name') || cell.value.getAttribute('label') || cell.id;
            (users[id] = users[id] || []).push(name);
        });
    });
    return users;
}

/** None, then each library entry of ``kind``. */
export function profileOptions(graph, kind = 'power', none = 'None') {
    const options = [{ value: '', label: none }];
    try {
        Object.entries(getLoadProfileLibrary(graph)).forEach(([id, entry]) => {
            if (profileKind(entry) === kind) options.push({ value: id, label: entry?.name || id });
        });
    } catch (e) {
        console.warn('Load profile library unavailable:', e);
    }
    return options;
}

/** The library entries some load follows, for a study's parameters. */
export function referencedLoadProfiles(graph) {
    const library = getLoadProfileLibrary(graph);
    const used = profileUsers(graph);
    const out = {};
    Object.keys(used).forEach((id) => {
        if (library[id]) out[id] = library[id];
    });
    return out;
}
