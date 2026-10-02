// EditDataDialog port, the 13 remaining method-level changes.
// Run after _port_EditDataDialog.js and _port_edd_merge.js.
const fs = require('fs');
const P = 'src/main/webapp/js/electrisim/dialogs/EditDataDialog.js';
let s = fs.readFileSync(P, 'utf8');
const NL = '\n';
const must = (c, m) => { if (!c) { console.error('ANCHOR FAILED: ' + m); process.exit(1); } };
const sub = (from, to, label) => { must(s.includes(from), label); s = s.replace(from, to); };

const CALL = '        this.applyAttributesToCell(values);' + NL;

/** Insert `text` straight after the applyAttributesToCell call inside `method`. */
function afterApplyIn(method, text, label) {
    const head = '    ' + method + '(values) {';
    const start = s.indexOf(head);
    must(start >= 0, label + ' (method head)');
    const call = s.indexOf(CALL, start);
    must(call > start && call - start < 400, label + ' (apply call)');
    const at = call + CALL.length;
    s = s.slice(0, at) + text + s.slice(at);
}

// The shape HEAD uses to push a new name onto the shape's first child label.
const LABEL_SYNC = [
    "        if ('name' in values) {",
    "            const graph = this.ui?.editor?.graph;",
    "            if (graph) {",
    "                const model = graph.getModel();",
    "                if (model.getChildCount(this.cell) > 0) {",
    "                    const child = model.getChildAt(this.cell, 0);",
    "                    model.setValue(child, values.name);",
    "                }",
    "            }",
    "        }",
    "",
].join(NL);

// --- 1. four elements sync their label from the name field ---------------
for (const m of ['applyGeneratorValues', 'applyStaticGeneratorValues', 'applyBusValues', 'applyDcBusValues']) {
    afterApplyIn(m, LABEL_SYNC, m);
}

// --- 2. applyWindTurbineValues: match HEAD's child-const shape -----------
sub("                if (model.getChildCount(this.cell) > 0) {" + NL +
    "                    model.setValue(model.getChildAt(this.cell, 0), values.name);" + NL +
    "                }",
    "                if (model.getChildCount(this.cell) > 0) {" + NL +
    "                    const child = model.getChildAt(this.cell, 0);" + NL +
    "                    model.setValue(child, values.name);" + NL +
    "                }",
    'wind turbine child const');

// --- 3. applyLoadValues: the label may live on child 1, and falls back to
//        the cell's own label when child 0 is blank ---------------------
afterApplyIn('applyLoadValues', [
    "        if ('name' in values) {",
    "            const graph = this.ui?.editor?.graph;",
    "            if (graph) {",
    "                const model = graph.getModel();",
    "                const childCount = model.getChildCount(this.cell);",
    "                if (childCount > 1) {",
    "                    model.setValue(model.getChildAt(this.cell, 1), values.name);",
    "                } else if (childCount > 0) {",
    "                    const child = model.getChildAt(this.cell, 0);",
    "                    if (String(model.getValue(child) ?? '').trim() === '') {",
    "                        this.cell.value.setAttribute('label', String(values.name));",
    "                        model.setValue(this.cell, this.cell.value);",
    "                    } else {",
    "                        model.setValue(child, values.name);",
    "                    }",
    "                }",
    "                try {",
    "                    graph.refresh(this.cell);",
    "                } catch (refreshErr) { /* ignore */ }",
    "            }",
    "        }",
    "",
].join(NL), 'applyLoadValues');

// --- 4. the two transformer applies force a redraw ----------------------
for (const [method, logLine] of [
    ['applyTransformerValues', "        console.log('Transformer values applied to cell');"],
    ['applyThreeWindingTransformerValues', "        console.log('Three Winding Transformer values applied to cell');"],
]) {
    const start = s.indexOf('    ' + method + '(values) {');
    must(start >= 0, method + ' head');
    const at = s.indexOf(logLine, start);
    must(at > start, method + ' log line');
    const insertAt = at + logLine.length;
    s = s.slice(0, insertAt) + NL +
        "        try {" + NL +
        "            if (this.ui?.editor?.graph) this.ui.editor.graph.refresh(this.cell);" + NL +
        "        } catch (refreshErr) { /* ignore */ }" +
        s.slice(insertAt);
}

// --- 5. external grid dialog gets its legacy and harmonic back-fill ------
sub("            this.populateExternalGridDialog(externalGridDialog);",
    "            this.populateExternalGridDialog(externalGridDialog);" + NL +
    "            if (externalGridDialog.applyLegacyMinZeroSequenceIfMissing) {" + NL +
    "                externalGridDialog.applyLegacyMinZeroSequenceIfMissing(this.cell.value);" + NL +
    "            }" + NL +
    "            if (externalGridDialog.applyHarmonicSpectrumCustomFromCell) {" + NL +
    "                externalGridDialog.applyHarmonicSpectrumCustomFromCell(this.cell.value);" + NL +
    "            }",
    'external grid back-fill');

// --- 6. AG Grid v31 replaced the Grid constructor with createGrid --------
sub("new window.agGrid.Grid(", "window.agGrid.createGrid(", 'agGrid createGrid');

// --- 7. in-service styling refreshed after a generic apply --------------
sub("            console.log('Changes applied successfully');",
    "            const graph = this.ui?.editor?.graph;" + NL +
    "            if (graph) syncInServiceCellStyle(graph, this.cell);" + NL +
    "            console.log('Changes applied successfully');",
    'applyChanges in-service sync');

sub("            console.log('=== applyLineValues completed ===');",
    "            const graph = this.ui?.editor?.graph;" + NL +
    "            if (graph) syncInServiceCellStyle(graph, this.cell);" + NL +
    "            console.log('=== applyLineValues completed ===');",
    'applyLineValues in-service sync');

fs.writeFileSync(P, s);
console.log('method-level fixes applied:', s.split(NL).length, 'lines');

// --- 8. the class defines applyTransformerValues and
//        applyThreeWindingTransformerValues TWICE; the later definition is the
//        live one. HEAD adds the refresh to both copies, so match that.
for (const logLine of [
    "            console.log('Applied Transformer values to cell:', values);",
    "            console.log('Applied Three Winding Transformer values to cell:', values);",
]) {
    must(s.includes(logLine), 'second-copy log line: ' + logLine.trim().slice(0, 40));
    s = s.replace(logLine, logLine + NL +
        "            try {" + NL +
        "                const graph = this.ui?.editor?.graph;" + NL +
        "                if (graph) syncInServiceCellStyle(graph, this.cell);" + NL +
        "                if (graph) graph.refresh(this.cell);" + NL +
        "            } catch (refreshErr) { /* ignore */ }");
}

fs.writeFileSync(P, s);
console.log('second-copy refreshes applied');
