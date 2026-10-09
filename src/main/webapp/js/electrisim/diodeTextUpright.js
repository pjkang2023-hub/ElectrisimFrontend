// diodeTextUpright.js - a DC diode turned past 90 degrees read its "DC" upside down: the
// symbol's text turns with it. Turned between 90 and 270 degrees, the diode takes the
// variant of its symbol whose text is pre-turned 180 degrees, so it reads upright; back
// within 90 degrees, its own.

const PLAIN = 'sym-dc-diode.svg';
const TURNED = 'sym-dc-diode-r.svg';

function isDiode(style) {
    return typeof style === 'string' && /(^|;)shapeELXXX=DC Diode(;|$)/.test(style);
}

/** The image a diode with this style should show: its turned variant past 90 degrees. */
export function diodeImageFor(style) {
    const m = /(^|;)rotation=(-?[\d.]+)/.exec(style || '');
    const r = ((m ? parseFloat(m[2]) : 0) % 360 + 360) % 360;
    return r > 90 && r < 270 ? TURNED : PLAIN;
}

/** The style with its image set for its rotation; the same string when it already is. */
export function uprightDiodeStyle(style) {
    if (!isDiode(style)) return style;
    const want = diodeImageFor(style);
    const other = want === TURNED ? PLAIN : TURNED;
    return style.includes(`/${other}`) ? style.replace(`/${other}`, `/${want}`) : style;
}

function watch(graph) {
    const model = graph.getModel();
    let busy = false;
    const fix = (cells) => {
        const todo = cells.filter((c) => {
            const s = model.getStyle(c);
            return isDiode(s) && uprightDiodeStyle(s) !== s;
        });
        if (!todo.length) return;
        busy = true;
        try {
            model.beginUpdate();
            try {
                todo.forEach((c) => model.setStyle(c, uprightDiodeStyle(model.getStyle(c))));
            } finally {
                model.endUpdate();
            }
        } finally {
            busy = false;
        }
    };
    model.addListener(mxEvent.CHANGE, (sender, evt) => {
        if (busy) return;
        const edit = evt && evt.getProperty('edit');
        const cells = [];
        ((edit && edit.changes) || []).forEach((change) => {
            const cell = change && (change.cell || change.child);
            if (cell) cells.push(cell);
        });
        if (cells.length) fix(cells);
    });
    // The diodes already drawn.
    const all = [];
    const walk = (cell) => {
        all.push(cell);
        for (let i = 0; i < model.getChildCount(cell); i++) walk(model.getChildAt(cell, i));
    };
    walk(model.getRoot());
    fix(all);
}

(function watchEditor() {
    if (typeof window === 'undefined') return;
    const app = window.App;
    const ui = app && (app._editorUi || app._instance);
    if (ui && ui.editor && ui.editor.graph && typeof mxEvent !== 'undefined') {
        if (!ui._elDiodeUpright) {
            ui._elDiodeUpright = true;
            watch(ui.editor.graph);
        }
    } else setTimeout(watchEditor, 1000);
}());
