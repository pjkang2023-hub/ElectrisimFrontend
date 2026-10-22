// operatingState.js - studies run in an operating state of the network's mgtwin Site.
//
// The drawn diagram is the network's normal state. A Site (mgtwin's record of the network) declares its other
// operating states - a board lost, a black-start step, a transfer - each by its switches, its sources and its load
// transfers. Loaded here (Insert > Operating State..., above the studies), a state chosen is sent with every study
// as `mgtwin_state`; the backend reads it onto the drawn network (mgtwin_site_io.apply_state) and the study runs in
// it. A banner over the drawing names the state while one is chosen. Insert > Export as mgtwin Site... writes the
// drawn network as a Site, the loaded Site lending its states and relays.

import ENV, { getBackendUrlCandidates } from './config/environment.js';
import { prepareNetworkData } from './utils/networkPreparation.js';

const STORE_KEY = 'electrisim.mgtwinState';
const current = { site: null, fileName: '', stateId: null };

function stripSlash(u) {
    return String(u || '').replace(/\/+$/, '');
}

function backendRoots() {
    const list = [];
    try { list.push(...(getBackendUrlCandidates() || [])); } catch (e) { /* candidates are optional */ }
    if (ENV && ENV.backendUrl) list.push(ENV.backendUrl);
    return new Set(list.map(stripSlash));
}

function backendUrl(path) {
    return stripSlash((ENV && ENV.backendUrl) || 'http://localhost:5000') + path;
}

function save() {
    try {
        if (current.site && current.stateId) {
            localStorage.setItem(STORE_KEY, JSON.stringify(current));
        } else {
            localStorage.removeItem(STORE_KEY);
        }
    } catch (e) { /* storage may be unavailable: the choice then lasts the session */ }
}

function restore() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
        if (saved && saved.site && Array.isArray(saved.site.islands) && saved.stateId
                && saved.site.islands.some(i => i.id === saved.stateId)) {
            Object.assign(current, saved);
        }
    } catch (e) { /* nothing saved, or unreadable */ }
}

/** The state chosen ({site, fileName, stateId}), or null for the drawn (normal) state. */
export function activeOperatingState() {
    return current.site && current.stateId ? { ...current } : null;
}

export function setOperatingState(site, stateId, fileName = '') {
    current.site = site || null;
    current.fileName = fileName || current.fileName;
    current.stateId = site ? stateId : null;
    save();
    renderBanner();
}

// --- every study request to the backend carries the state chosen --------------------------------------------------
function installFetchHook() {
    if (typeof window === 'undefined' || window.fetch._elOperatingState) return;
    const original = window.fetch.bind(window);
    const hooked = function (input, init) {
        try {
            const state = activeOperatingState();
            const url = typeof input === 'string' ? input : (input && input.url) || '';
            const method = String((init && init.method) || 'GET').toUpperCase();
            if (state && method === 'POST' && init && typeof init.body === 'string' && backendRoots().has(stripSlash(url))) {
                const body = JSON.parse(init.body);
                // a study: the diagram's elements with the study's parameters in cell '0'
                if (body && typeof body === 'object' && body['0'] && typeof body['0'].typ === 'string'
                        && !body.mgtwin_state) {
                    body.mgtwin_state = { site: state.site, state_id: state.stateId };
                    init = { ...init, body: JSON.stringify(body) };
                }
            }
        } catch (e) {
            // not a JSON study body: sent as it was
        }
        return original(input, init);
    };
    hooked._elOperatingState = true;
    window.fetch = hooked;
}

// --- the banner ------------------------------------------------------------------------------------------------
let banner = null;
let openDialog = () => {};

function renderBanner() {
    if (typeof document === 'undefined') return;
    const state = activeOperatingState();
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'el-operating-state-banner';
        Object.assign(banner.style, {
            position: 'fixed', top: '72px', left: '50%', transform: 'translateX(-50%)', zIndex: 9,
            background: '#FFF4E0', border: '1px solid #E0A040', borderRadius: '14px', padding: '4px 12px',
            font: '12px Arial, sans-serif', color: '#5A3A00', boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
            display: 'none', alignItems: 'center', gap: '8px', cursor: 'pointer'
        });
        banner.title = 'Studies run in this operating state of the Site. Click to change it.';
        banner.addEventListener('click', ev => {
            if (ev.target && ev.target.dataset && ev.target.dataset.clear) {
                setOperatingState(current.site, null);
            } else {
                openDialog();
            }
        });
        document.body.appendChild(banner);
    }
    if (!state) {
        banner.style.display = 'none';
        return;
    }
    const island = state.site.islands.find(i => i.id === state.stateId) || {};
    banner.innerHTML = '';
    const text = document.createElement('span');
    text.textContent = `Operating state: ${state.stateId}` + (island.description ? ` - ${island.description}` : '')
        + ` (${state.site.id || state.fileName})`;
    const clear = document.createElement('span');
    clear.textContent = '×';
    clear.dataset.clear = '1';
    clear.title = 'Back to the drawn (normal) state';
    Object.assign(clear.style, { fontWeight: 'bold', fontSize: '14px', marginLeft: '6px' });
    banner.append(text, clear);
    banner.style.display = 'flex';
}

// --- the dialogs -------------------------------------------------------------------------------------------------
function modal(title, build) {
    const shade = document.createElement('div');
    Object.assign(shade.style, { position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.3)', zIndex: 10000,
                                 display: 'flex', alignItems: 'center', justifyContent: 'center' });
    const box = document.createElement('div');
    Object.assign(box.style, { background: '#fff', borderRadius: '6px', padding: '16px 18px', width: 'min(640px, 92vw)',
                               maxHeight: '82vh', overflow: 'auto', font: '13px Arial, sans-serif', color: '#222',
                               boxShadow: '0 4px 18px rgba(0,0,0,0.25)' });
    const h = document.createElement('div');
    h.textContent = title;
    Object.assign(h.style, { fontWeight: 'bold', fontSize: '15px', marginBottom: '10px' });
    box.appendChild(h);
    const close = () => shade.remove();
    build(box, close);
    shade.appendChild(box);
    shade.addEventListener('click', ev => { if (ev.target === shade) close(); });
    document.body.appendChild(shade);
}

function button(text, onClick, primary = false) {
    const b = document.createElement('button');
    b.textContent = text;
    Object.assign(b.style, { marginLeft: '8px', padding: '5px 14px', borderRadius: '4px', cursor: 'pointer',
                             border: primary ? '1px solid #2E5597' : '1px solid #bbb',
                             background: primary ? '#2E5597' : '#f4f4f4', color: primary ? '#fff' : '#222' });
    b.addEventListener('click', onClick);
    return b;
}

function readSiteFile(onSite) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', () => {
        const f = input.files && input.files[0];
        if (!f) return;
        f.text().then(txt => {
            const site = JSON.parse(txt);
            if (!site || !Array.isArray(site.islands)) throw new Error('no operating states (islands) in it');
            onSite(site, f.name);
        }).catch(err => alert(`Not an mgtwin Site: ${err.message}`));
    });
    input.click();
}

function stateDialog(ui) {
    modal('Operating state', (box, close) => {
        const intro = document.createElement('p');
        intro.textContent = 'Studies run in the state chosen: its switches, its sources and its load transfers, as the '
            + "Site declares them - the drawn diagram stays as it is. The Site's names must be the diagram's.";
        Object.assign(intro.style, { margin: '0 0 10px', color: '#555' });
        box.appendChild(intro);
        const siteLine = document.createElement('div');
        siteLine.style.marginBottom = '8px';
        box.appendChild(siteLine);
        const list = document.createElement('div');
        Object.assign(list.style, { border: '1px solid #ddd', borderRadius: '4px', maxHeight: '46vh', overflow: 'auto' });
        box.appendChild(list);
        let site = current.site;
        let fileName = current.fileName;
        let chosen = current.stateId;

        function row(id, label, detail) {
            const r = document.createElement('label');
            Object.assign(r.style, { display: 'block', padding: '6px 10px', borderBottom: '1px solid #eee', cursor: 'pointer' });
            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = 'el-op-state';
            radio.checked = (chosen || null) === id;
            radio.addEventListener('change', () => { chosen = id; });
            const t = document.createElement('b');
            t.textContent = ` ${label}`;
            const d = document.createElement('div');
            d.textContent = detail;
            Object.assign(d.style, { color: '#666', fontSize: '11px', marginLeft: '22px' });
            r.append(radio, t, d);
            return r;
        }

        function render() {
            siteLine.textContent = site ? `Site: ${site.id || ''} ${site.name ? '- ' + site.name : ''} (${fileName})`
                                        : 'No Site loaded.';
            list.innerHTML = '';
            list.appendChild(row(null, 'Normal (as drawn)', 'The diagram exactly as it is drawn.'));
            for (const i of (site && site.islands) || []) {
                const n = (i.energized_source_ids || []).length;
                const parts = [`${n} source${n === 1 ? '' : 's'}`];
                if ((i.open_switches || []).length) parts.push(`opens ${i.open_switches.length}`);
                if ((i.closed_switches || []).length) parts.push(`closes ${i.closed_switches.length}`);
                const lf = Object.entries(i.load_factors || {});
                if (lf.length) parts.push('loads ' + lf.map(([k, v]) => `${k} x${v}`).join(', '));
                if (i.settings_group && i.settings_group !== 'A') parts.push(`settings group ${i.settings_group}`);
                list.appendChild(row(i.id, i.id, (i.description ? i.description + ' - ' : '') + parts.join('; ')));
            }
        }
        render();

        const actions = document.createElement('div');
        Object.assign(actions.style, { marginTop: '12px', textAlign: 'right' });
        actions.append(
            button('Load Site...', () => readSiteFile((s, name) => { site = s; fileName = name; chosen = null; render(); })),
            button('Cancel', close),
            button('Apply', () => { setOperatingState(site, chosen, fileName); close(); }, true));
        box.appendChild(actions);
    });
}

async function exportSite(ui) {
    try {
        const graph = ui.editor.graph;
        const diagram = prepareNetworkData(graph, ui, {});
        const template = current.site || undefined;
        const response = await fetch(backendUrl('/mgtwin/site'), {
            method: 'POST', mode: 'cors', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ diagram, site_id: (template && template.id) || 'DRAWN', template })
        });
        const out = await response.json();
        if (!response.ok || out.error) throw new Error(out.message || response.status);
        const blob = new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${out.id || 'site'}.mgtwin.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (err) {
        alert(`The diagram could not be exported as a Site: ${err.message}`);
    }
}

function install(ui) {
    if (!ui || ui._elOperatingState || !ui.actions || !ui.menus) return;
    ui._elOperatingState = true;
    if (typeof mxResources !== 'undefined') {
        mxResources.parse('operatingState=Operating State...\nexportMgtwinSite=Export as mgtwin Site...');
    }
    openDialog = () => stateDialog(ui);
    ui.actions.addAction('operatingState', () => stateDialog(ui));
    ui.actions.addAction('exportMgtwinSite', () => exportSite(ui));
    // The studies' menu (the toolbar's Insert button lists Load Flow, Short Circuit, ...): the state first, as
    // every study below it runs in it.
    const menu = ui.menus.get('insert');
    if (menu && typeof menu.funct === 'function') {
        const funct = menu.funct;
        menu.funct = function (m, parent) {
            ui.menus.addMenuItems(m, ['operatingState', 'exportMgtwinSite'], parent);
            m.addSeparator(parent);
            funct.apply(this, arguments);
        };
    }
    renderBanner();
}

installFetchHook();
restore();

(function watchEditor() {
    if (typeof window === 'undefined') return;
    const app = window.App;
    const ui = app && (app._editorUi || app._instance);
    if (ui && ui.editor && ui.editor.graph && typeof mxEvent !== 'undefined') install(ui);
    else setTimeout(watchEditor, 1000);
}());
