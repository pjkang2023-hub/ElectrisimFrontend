// LoadProfileLibraryDialog.js - manage the diagram's shared library of load power profiles.
import { attachBackdropCloseHandler } from '../utils/dialogStyles.js';
import {
    parseProfile,
    analyseProfile,
    profileEntry,
    entryArrays,
    getLoadProfileLibrary,
    setLoadProfileLibrary,
    newProfileId,
    profileUsers
} from '../utils/loadProfileLibrary.js';

function fmt(v, digits = 3) {
    const n = Number(v);
    return Number.isFinite(n) ? n.toFixed(digits) : '—';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text ?? '');
    return div.innerHTML;
}

export class LoadProfileLibraryDialog {
    constructor(graph) {
        this.graph = graph;
        this.pending = null;
    }

    show() {
        const overlay = document.createElement('div');
        overlay.className = 'load-profile-library-overlay';
        overlay.style.cssText = `
            position: fixed; inset: 0; background: rgba(0,0,0,0.55); z-index: 10000;
            display: flex; align-items: center; justify-content: center; padding: 16px;
        `;
        const shell = document.createElement('div');
        shell.style.cssText = `
            background: #fff; border-radius: 10px; box-shadow: 0 8px 32px rgba(0,0,0,0.28);
            max-width: 980px; width: 100%; max-height: 92vh; display: flex; flex-direction: column; overflow: hidden;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; color: #212529;
        `;
        const header = document.createElement('div');
        header.style.cssText = 'padding: 18px 24px; border-bottom: 1px solid #e9ecef; display: flex; align-items: center; justify-content: space-between;';
        header.innerHTML = '<h2 style="margin:0; font-size:18px; font-weight:700;">Load Profiles</h2>';
        const close = document.createElement('button');
        close.textContent = '×';
        close.title = 'Close';
        close.style.cssText = 'border:none; background:transparent; font-size:24px; line-height:1; cursor:pointer; color:#6c757d;';
        close.onclick = () => overlay.remove();
        header.appendChild(close);
        shell.appendChild(header);

        this.body = document.createElement('div');
        this.body.style.cssText = 'flex:1; overflow-y:auto; padding: 16px 24px; display:flex; flex-direction:column; gap:16px;';
        shell.appendChild(this.body);

        const footer = document.createElement('div');
        footer.style.cssText = 'padding: 12px 24px; border-top: 1px solid #e9ecef; display:flex; justify-content:flex-end; background:#fafbfc;';
        const done = this._button('Close', '#007bff');
        done.onclick = () => overlay.remove();
        footer.appendChild(done);
        shell.appendChild(footer);

        overlay.appendChild(shell);
        attachBackdropCloseHandler(overlay, shell, () => overlay.remove());
        document.body.appendChild(overlay);
        this.overlay = overlay;
        this._render();
    }

    _button(label, bg) {
        const b = document.createElement('button');
        b.textContent = label;
        b.style.cssText = `padding: 7px 14px; background:${bg}; color:#fff; border:none; border-radius:6px; cursor:pointer; font-size:13px; font-weight:500;`;
        return b;
    }

    _render() {
        this.body.innerHTML = '';
        const intro = document.createElement('div');
        intro.style.cssText = 'font-size:13px; color:#495057; line-height:1.5;';
        intro.textContent = 'Power profiles loads can follow in the time series and transient stability studies, '
            + 'in per unit of each load\'s drawn P. The library is saved with the diagram; choose a load\'s '
            + 'profile on its Data center tab. Several loads can follow one profile.';
        this.body.appendChild(intro);
        this.body.appendChild(this._uploadSection());
        this.body.appendChild(this._librarySection());
    }

    _uploadSection() {
        const box = document.createElement('div');
        box.style.cssText = 'border:1px solid #dee2e6; border-radius:8px; padding:12px 14px; display:flex; flex-direction:column; gap:10px;';
        box.innerHTML = '<div style="font-weight:600; font-size:14px;">Add a profile</div>'
            + '<div style="font-size:12px; color:#6c757d;">CSV or TXT: time (s) and power (p.u.) columns, or a power column '
            + 'with its time step below. Header and comment lines are skipped.</div>';
        const row = document.createElement('div');
        row.style.cssText = 'display:flex; flex-wrap:wrap; gap:10px; align-items:flex-end;';
        const field = (label, input) => {
            const wrap = document.createElement('label');
            wrap.style.cssText = 'display:flex; flex-direction:column; gap:3px; font-size:12px; color:#495057;';
            wrap.appendChild(document.createTextNode(label));
            wrap.appendChild(input);
            return wrap;
        };
        const file = document.createElement('input');
        file.type = 'file';
        file.accept = '.csv,.txt,text/csv,text/plain';
        file.id = 'loadProfileFile';
        const name = document.createElement('input');
        name.type = 'text';
        name.id = 'loadProfileName';
        name.placeholder = 'Profile name';
        name.style.cssText = 'padding:6px 8px; border:1px solid #ced4da; border-radius:4px; width:220px;';
        const dt = document.createElement('input');
        dt.type = 'number';
        dt.id = 'loadProfileStep';
        dt.step = 'any';
        dt.min = '0';
        dt.placeholder = 'only for one column';
        dt.style.cssText = 'padding:6px 8px; border:1px solid #ced4da; border-radius:4px; width:150px;';
        row.appendChild(field('File', file));
        row.appendChild(field('Name', name));
        row.appendChild(field('Time step (s)', dt));
        box.appendChild(row);
        const preview = document.createElement('div');
        box.appendChild(preview);

        const read = () => {
            const f = file.files && file.files[0];
            if (!f) return;
            if (!name.value) name.value = f.name.replace(/\.[^.]+$/, '');
            const reader = new FileReader();
            reader.onload = () => {
                this.pending = null;
                try {
                    const { t, p, notes } = parseProfile(reader.result, dt.value ? Number(dt.value) : null);
                    this.pending = { t, p, notes, source: f.name };
                    this._renderPreview(preview, name);
                } catch (e) {
                    preview.innerHTML = `<div style="padding:8px 12px; border-radius:6px; background:#f8d7da; color:#842029; font-size:13px;">${escapeHtml(e.message)}</div>`;
                }
            };
            reader.readAsText(f);
        };
        file.addEventListener('change', read);
        dt.addEventListener('change', read);
        return box;
    }

    _renderPreview(host, nameInput) {
        const { t, p, notes, source } = this.pending;
        const report = analyseProfile(t, p);
        host.innerHTML = '';
        host.appendChild(this._reportCard(report, t, p, notes));
        const add = this._button('Add to library', '#198754');
        add.id = 'loadProfileAdd';
        add.style.marginTop = '8px';
        add.onclick = () => {
            const library = { ...getLoadProfileLibrary(this.graph) };
            const id = newProfileId(library);
            library[id] = profileEntry(nameInput.value.trim() || source, t, p, source);
            setLoadProfileLibrary(this.graph, library);
            this.pending = null;
            this._render();
        };
        host.appendChild(add);
    }

    _reportCard(report, t, p, notes = []) {
        const card = document.createElement('div');
        card.style.cssText = 'display:flex; gap:14px; flex-wrap:wrap; align-items:flex-start;';
        card.appendChild(this._sparkline(t, p));
        const text = document.createElement('div');
        text.style.cssText = 'font-size:12.5px; line-height:1.6; min-width:0; flex:1;';
        text.innerHTML = `${report.samples} samples over ${fmt(report.duration_s, 2)} s, every ${fmt(report.time_step_s, 4)} s `
            + `(nothing faster than ${fmt(report.fastest_content_hz, 1)} Hz)<br>`
            + `Min ${fmt(report.min_pu)} · mean ${fmt(report.mean_pu)} · max ${fmt(report.max_pu)} p.u.<br>`
            + `Fastest rise ${fmt(report.max_rise_pu_per_s, 2)} p.u./s · fastest fall ${fmt(report.max_fall_pu_per_s, 2)} p.u./s`;
        [...notes, ...report.flags].forEach((flag, k) => {
            const note = document.createElement('div');
            const warn = k >= notes.length;
            note.style.cssText = `margin-top:4px; padding:4px 8px; border-radius:5px; font-size:12px; background:${warn ? '#fff3cd' : '#e9ecef'}; color:${warn ? '#664d03' : '#495057'};`;
            note.textContent = flag;
            text.appendChild(note);
        });
        card.appendChild(text);
        return card;
    }

    _sparkline(t, p) {
        const canvas = document.createElement('canvas');
        const w = 260;
        const h = 64;
        canvas.width = w * 2;
        canvas.height = h * 2;
        canvas.style.cssText = `width:${w}px; height:${h}px; border:1px solid #e9ecef; border-radius:4px; background:#fbfcfd; flex-shrink:0;`;
        const ctx = canvas.getContext('2d');
        ctx.scale(2, 2);
        const t0 = t[0];
        const span = (t[t.length - 1] - t0) || 1;
        const top = Math.max(1.2, ...p);
        const bottom = Math.min(0, ...p);
        const y = v => h - 4 - (v - bottom) / (top - bottom) * (h - 8);
        ctx.strokeStyle = '#ced4da';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(0, y(1));
        ctx.lineTo(w, y(1));
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = '#0c6a7d';
        ctx.lineWidth = 1;
        ctx.beginPath();
        // At most one point per pixel column: min and max, so spikes stay visible.
        const cols = new Map();
        t.forEach((ti, k) => {
            const x = Math.round((ti - t0) / span * (w - 2)) + 1;
            const c = cols.get(x);
            if (!c) cols.set(x, [p[k], p[k]]);
            else { c[0] = Math.min(c[0], p[k]); c[1] = Math.max(c[1], p[k]); }
        });
        let first = true;
        [...cols.entries()].sort((a, b) => a[0] - b[0]).forEach(([x, [lo, hi]]) => {
            if (first) { ctx.moveTo(x, y(lo)); first = false; } else ctx.lineTo(x, y(lo));
            ctx.lineTo(x, y(hi));
        });
        ctx.stroke();
        return canvas;
    }

    _librarySection() {
        const box = document.createElement('div');
        box.style.cssText = 'display:flex; flex-direction:column; gap:10px;';
        const library = getLoadProfileLibrary(this.graph);
        const users = profileUsers(this.graph);
        const ids = Object.keys(library);
        const title = document.createElement('div');
        title.style.cssText = 'font-weight:600; font-size:14px;';
        title.textContent = ids.length ? `In this diagram (${ids.length})` : 'No profiles in this diagram yet.';
        box.appendChild(title);
        ids.forEach((id) => {
            const entry = library[id];
            const { t, p } = entryArrays(entry);
            const row = document.createElement('div');
            row.className = 'load-profile-entry';
            row.dataset.profileId = id;
            row.style.cssText = 'border:1px solid #dee2e6; border-radius:8px; padding:10px 14px; display:flex; flex-direction:column; gap:8px;';
            const head = document.createElement('div');
            head.style.cssText = 'display:flex; flex-wrap:wrap; gap:8px; align-items:center;';
            const name = document.createElement('input');
            name.type = 'text';
            name.value = entry.name || id;
            name.style.cssText = 'padding:5px 8px; border:1px solid #ced4da; border-radius:4px; font-weight:600; min-width:0; flex:1; max-width:360px;';
            const rename = this._button('Rename', '#6c757d');
            rename.onclick = () => {
                const lib = { ...getLoadProfileLibrary(this.graph) };
                lib[id] = { ...lib[id], name: name.value.trim() || lib[id].name };
                setLoadProfileLibrary(this.graph, lib);
                this._render();
            };
            const remove = this._button('Delete', '#dc3545');
            remove.onclick = () => {
                const who = users[id] || [];
                if (who.length && !confirm(`${who.join(', ')} follow${who.length === 1 ? 's' : ''} this profile and will no longer. Delete it?`)) return;
                const lib = { ...getLoadProfileLibrary(this.graph) };
                delete lib[id];
                setLoadProfileLibrary(this.graph, lib);
                this._render();
            };
            head.appendChild(name);
            head.appendChild(rename);
            head.appendChild(remove);
            row.appendChild(head);
            const who = users[id] || [];
            const used = document.createElement('div');
            used.style.cssText = 'font-size:12px; color:#495057;';
            used.textContent = who.length ? `Followed by: ${who.join(', ')}` : 'No load follows it yet.';
            if (entry.source) used.textContent += ` · from ${entry.source}`;
            row.appendChild(used);
            try {
                row.appendChild(this._reportCard(analyseProfile(t, p), t, p));
            } catch (e) {
                row.appendChild(document.createTextNode(`This profile cannot be read: ${e.message}`));
            }
            box.appendChild(row);
        });
        return box;
    }
}

export function showLoadProfileLibrary(graph) {
    const dialog = new LoadProfileLibraryDialog(graph);
    dialog.show();
    return dialog;
}

window.showLoadProfileLibrary = showLoadProfileLibrary;
