// drawingFrequency.js - each study dialog chose its own frequency, 50 Hz unless told, so a
// 60 Hz drawing's every study had to be set to 60 Hz by hand, and one left at 50 Hz ran at
// it. The drawing keeps its frequency now: chosen in any study dialog, it is stored on the
// drawing (its layer's style, saved with it), and every study dialog's frequency field
// opens at it.

const KEY = 'electrisimFrequency';

function layer(graph) {
    return graph && graph.getDefaultParent ? graph.getDefaultParent() : null;
}

/** The drawing's frequency ('50' or '60'), or null when none was chosen yet. */
export function drawingFrequency(graph) {
    const cell = layer(graph);
    if (!cell) return null;
    const m = new RegExp(`(^|;)${KEY}=([^;]+)`).exec(graph.getModel().getStyle(cell) || '');
    return m ? m[2] : null;
}

/** Store the drawing's frequency on it. */
export function setDrawingFrequency(graph, hz) {
    const cell = layer(graph);
    if (!cell || !hz || drawingFrequency(graph) === String(hz)) return;
    const model = graph.getModel();
    model.setStyle(cell, mxUtils.setStyle(model.getStyle(cell) || '', KEY, String(hz)));
}

// A frequency field: a select or input with id "frequency" (or "frequency_hz", the short-circuit
// dialog's ANSI and POI modes), or radio buttons of that name - the short-circuit dialog's IEC
// 50 Hz / 60 Hz pair, which opened at 50 Hz on a 60 Hz drawing.
const SELECTOR = ['frequency', 'frequency_hz'].map(n =>
    `select#${n}, input#${n}:not([type=radio]), input[type=radio][name=${n}]`).join(', ');

function frequencyFields(root) {
    if (!root || !root.querySelectorAll) return [];
    const own = root.matches && root.matches(SELECTOR) ? [root] : [];
    return own.concat(Array.from(root.querySelectorAll(SELECTOR)));
}

function adoptRadio(graph, radio) {
    if (radio.dataset.elDrawingFrequency) return;
    radio.dataset.elDrawingFrequency = '1';
    const hz = drawingFrequency(graph);
    if (hz && radio.value === hz && !radio.checked) {
        radio.checked = true;
        radio.dispatchEvent(new Event('change', { bubbles: true }));
    }
    radio.addEventListener('change', () => {
        if (radio.checked && (radio.value === '50' || radio.value === '60')) setDrawingFrequency(graph, radio.value);
    });
}

function adopt(graph, field) {
    if (field.type === 'radio') return adoptRadio(graph, field);
    if (field.dataset.elDrawingFrequency) return;
    field.dataset.elDrawingFrequency = '1';
    const hz = drawingFrequency(graph);
    const offered = field.tagName === 'SELECT' ? Array.from(field.options).some((o) => o.value === hz) : !!hz;
    if (hz && offered && field.value !== hz) {
        field.value = hz;
        field.dispatchEvent(new Event('change', { bubbles: true }));
    }
    field.addEventListener('change', () => {
        if (field.value === '50' || field.value === '60') setDrawingFrequency(graph, field.value);
    });
}

function watch(graph) {
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((m) => m.addedNodes.forEach((node) => {
            frequencyFields(node).forEach((field) => adopt(graph, field));
        }));
    });
    observer.observe(document.body, { childList: true, subtree: true });
}

(function watchEditor() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const app = window.App;
    const ui = app && (app._editorUi || app._instance);
    if (ui && ui.editor && ui.editor.graph && typeof mxUtils !== 'undefined' && document.body) {
        if (!ui._elDrawingFrequency) {
            ui._elDrawingFrequency = true;
            watch(ui.editor.graph);
        }
    } else setTimeout(watchEditor, 1000);
}());
