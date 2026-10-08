// resultBoxVisibility.js - View > Result Boxes: show or hide every result box on
// the page at once.
//
// Each bus and each connection carries a result box, "Click Simulate to
// generate results" until a study fills it: on a large drawing (the AI campus,
// some 160) they crowd it before anything is run. A draw.io layer cannot hold
// them - a layer holds top-level cells, and a box is its element's child, which
// is what keeps it beside its element when the element moves - so they are
// hidden in place instead. Studies fill them hidden or shown; a box added while
// they are hidden (a dropped element, an import, a study that makes its own) is
// hidden too. The choice is saved with the page, on its layer's style.

const FLAG = 'resultBoxes';
const isResultBox = (style) => /(?:^|;)shapeELXXX=Result/.test(String(style || ''));

function setStyleKey(style, key, value) {
    const parts = String(style || '').split(';').filter((p) => p !== '' && p.split('=')[0] !== key);
    if (value !== null) parts.push(`${key}=${value}`);
    return parts.join(';');
}

/** Whether the page's result boxes are hidden. */
export function resultBoxesHidden(graph) {
    const layer = graph && graph.getDefaultParent();
    return !!layer && new RegExp(`(?:^|;)${FLAG}=0(?:;|$)`).test(String(graph.getModel().getStyle(layer) || ''));
}

function boxesUnder(model, cell, out) {
    const n = model.getChildCount(cell);
    for (let i = 0; i < n; i++) {
        const child = model.getChildAt(cell, i);
        if (isResultBox(model.getStyle(child))) out.push(child);
        boxesUnder(model, child, out);
    }
    return out;
}

/** Show or hide every result box on the page, as one undoable step. */
export function setResultBoxesHidden(graph, hidden) {
    const model = graph.getModel();
    const layer = graph.getDefaultParent();
    model.beginUpdate();
    try {
        model.setStyle(layer, setStyleKey(model.getStyle(layer), FLAG, hidden ? 0 : null));
        boxesUnder(model, model.getRoot(), []).forEach((box) => model.setVisible(box, !hidden));
    } finally {
        model.endUpdate();
    }
}

function hideNewBoxes(graph) {
    const model = graph.getModel();
    let busy = false;
    model.addListener(mxEvent.CHANGE, (sender, evt) => {
        if (busy || !resultBoxesHidden(graph)) return;
        const edit = evt && evt.getProperty('edit');
        const added = [];
        ((edit && edit.changes) || []).forEach((change) => {
            // An added cell (mxChildChange with a parent): it, or its children, a box.
            if (!change || !change.child || !change.parent) return;
            if (isResultBox(model.getStyle(change.child))) added.push(change.child);
            boxesUnder(model, change.child, added);
        });
        const shown = added.filter((box) => model.isVisible(box));
        if (!shown.length) return;
        busy = true;
        try {
            model.beginUpdate();
            try {
                shown.forEach((box) => model.setVisible(box, false));
            } finally {
                model.endUpdate();
            }
        } finally {
            busy = false;
        }
    });
}

function install(ui) {
    if (!ui || ui._elResultBoxToggle || !ui.actions || !ui.menus) return;
    ui._elResultBoxToggle = true;
    const graph = ui.editor.graph;
    if (typeof mxResources !== 'undefined') mxResources.parse('resultBoxes=Result Boxes');
    const action = ui.actions.addAction('resultBoxes', () => setResultBoxesHidden(graph, !resultBoxesHidden(graph)));
    action.setToggleAction(true);
    action.setSelectedCallback(() => !resultBoxesHidden(graph));
    const menu = ui.menus.get('view');
    if (menu && typeof menu.funct === 'function') {
        const funct = menu.funct;
        menu.funct = function (m, parent) {
            funct.apply(this, arguments);
            m.addSeparator(parent);
            ui.menus.addMenuItems(m, ['resultBoxes'], parent);
        };
    }
    hideNewBoxes(graph);
}

(function watchEditor() {
    if (typeof window === 'undefined') return;
    const app = window.App;
    const ui = app && (app._editorUi || app._instance);
    if (ui && ui.editor && ui.editor.graph && typeof mxEvent !== 'undefined') install(ui);
    else setTimeout(watchEditor, 1000);
}());
