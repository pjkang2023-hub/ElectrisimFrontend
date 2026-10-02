// Port EditDataDialog.js: re-apply the eleven commits that landed on the minified
// file onto the readable source at 6f476220.
//
// Purely additive: 11 new methods, 6 new dispatch branches, 3 imports, a doc-link
// bump, and one mechanical refactor of 27 applyXValues bodies onto a shared
// applyAttributesToCell helper (which also syncs the in-service cell style).
const fs = require('fs');
const P = 'src/main/webapp/js/electrisim/dialogs/EditDataDialog.js';
let s = fs.readFileSync(P, 'utf8');
const NL = '\n';
const must = (c, m) => { if (!c) { console.error('ANCHOR FAILED: ' + m); process.exit(1); } };
const sub = (from, to, label) => { must(s.includes(from), label); s = s.replace(from, to); };

// --- 1. new imports ------------------------------------------------------
sub("import { StaticGeneratorDialog } from '../staticGeneratorDialog.js';",
    "import { StaticGeneratorDialog } from '../staticGeneratorDialog.js';" + NL +
    "import { WindTurbineDialog } from '../windTurbineDialog.js';",
    'WindTurbineDialog import');

sub("import { updateSwitchCellStyle } from '../configureAttributes.js';",
    "import { updateSwitchCellStyle } from '../configureAttributes.js';" + NL +
    "import { syncInServiceCellStyle } from '../utils/inServiceCellStyle.js';",
    'inServiceCellStyle import');

sub("import { PVSystemDialog } from '../PVSystemDialog.js';",
    "import { PVSystemDialog } from '../PVSystemDialog.js';" + NL +
    "import { Load1phDialog, Source1phDialog, Line1phDialog, Transformer1phDialog, Generator1phDialog } from '../OpenDss1phDialogs.js';",
    'OpenDss1ph imports');

// --- 2. dispatch: Wind Turbine sits right after Static Generator ----------
sub("            // Handle Storage with new tabbed dialog" + NL +
    "            if (this.elementType === \"Storage\") {",
    "            // Handle Wind Turbine with its own tabbed dialog" + NL +
    "            if (this.elementType === \"Wind Turbine\") {" + NL +
    "                this.handleWindTurbine();" + NL +
    "                return;" + NL +
    "            }" + NL + NL +
    "            // Handle Storage with new tabbed dialog" + NL +
    "            if (this.elementType === \"Storage\") {",
    'Wind Turbine dispatch');

// --- 3. dispatch: the five OpenDSS single-phase elements, after PVSystem --
sub("            // Handle PVSystem with new tabbed dialog" + NL +
    "            if (this.elementType === \"PVSystem\") {" + NL +
    "                this.handlePVSystem();" + NL +
    "                return;" + NL +
    "            }",
    "            // Handle PVSystem with new tabbed dialog" + NL +
    "            if (this.elementType === \"PVSystem\") {" + NL +
    "                this.handlePVSystem();" + NL +
    "                return;" + NL +
    "            }" + NL + NL +
    "            // OpenDSS single-phase elements" + NL +
    "            if (this.elementType === \"Load 1ph\") {" + NL +
    "                this.handleLoad1ph();" + NL +
    "                return;" + NL +
    "            }" + NL + NL +
    "            if (this.elementType === \"Source 1ph\") {" + NL +
    "                this.handleSource1ph();" + NL +
    "                return;" + NL +
    "            }" + NL + NL +
    "            if (this.elementType === \"Generator 1ph\") {" + NL +
    "                this.handleGenerator1ph();" + NL +
    "                return;" + NL +
    "            }" + NL + NL +
    "            if (this.elementType === \"Transformer 1ph\") {" + NL +
    "                this.handleTransformer1ph();" + NL +
    "                return;" + NL +
    "            }" + NL + NL +
    "            if (this.elementType === \"Line 1ph\") {" + NL +
    "                this.handleLine1ph();" + NL +
    "                return;" + NL +
    "            }",
    '1ph dispatch');

// --- 5. every applyXValues body goes through that helper -----------------
const BLOCK = /^ {8}this\.ensureCellValueIsXmlElement\(\);\n(?:[ ]*(?:\/\/[^\n]*)?\n)* {8}for \(const \[attributeName, attributeValue\] of Object\.entries\(values\)\) \{\n {12}this\.cell\.value\.setAttribute\(attributeName, attributeValue\);\n {8}\}\n/gm;
const before = s;
s = s.replace(BLOCK, '        this.applyAttributesToCell(values);' + NL);
const refactored = (before.match(BLOCK) || []).length;
must(refactored === 26, `applyXValues refactor (expected 26, got ${refactored})`);

// --- 4. the shared attribute writer, after ensureCellValueIsXmlElement ----
const ENSURE = '    ensureCellValueIsXmlElement() {';
const ensureStart = s.indexOf(ENSURE);
must(ensureStart >= 0, 'ensureCellValueIsXmlElement');
const ensureEnd = s.indexOf(NL + '    }' + NL, ensureStart) + (NL + '    }' + NL).length;
must(ensureEnd > ensureStart, 'ensureCellValueIsXmlElement terminator');
s = s.slice(0, ensureEnd) +
    NL +
    "    /** Write every value onto the cell, then refresh the in-service styling. */" + NL +
    "    applyAttributesToCell(values) {" + NL +
    "        this.ensureCellValueIsXmlElement();" + NL +
    "        for (const [attributeName, attributeValue] of Object.entries(values)) {" + NL +
    "            this.cell.value.setAttribute(attributeName, attributeValue);" + NL +
    "        }" + NL +
    "        const graph = this.ui?.editor?.graph;" + NL +
    "        if (graph) syncInServiceCellStyle(graph, this.cell);" + NL +
    "    }" + NL +
    s.slice(ensureEnd);

// --- 6. handleWindTurbine, after handleStaticGenerator -------------------
const HSG = '    handleStaticGenerator() {';
const hsgStart = s.indexOf(HSG);
must(hsgStart >= 0, 'handleStaticGenerator');
const hsgEnd = s.indexOf(NL + '    }' + NL, hsgStart) + (NL + '    }' + NL).length;
s = s.slice(0, hsgEnd) +
    NL +
    "    handleWindTurbine() {" + NL +
    "        this.shouldShowDialog = false;" + NL +
    "        this.container.style.display = 'none';" + NL +
    "        this.container.innerHTML = '';" + NL + NL +
    "        if (window._globalDialogShowing || document.querySelector('.modal-overlay')) {" + NL +
    "            console.log('Wind Turbine dialog: Another dialog is already showing, ignoring request');" + NL +
    "            return;" + NL +
    "        }" + NL + NL +
    "        window._globalDialogShowing = true;" + NL +
    "        if (this.cell) this.cell._dialogShowing = true;" + NL + NL +
    "        try {" + NL +
    "            const windTurbineDialog = new WindTurbineDialog(this.ui);" + NL +
    "            this.setDialogCleanup(windTurbineDialog);" + NL +
    "            windTurbineDialog.populateDialog(this.cell.value);" + NL +
    "            windTurbineDialog.show((values) => {" + NL +
    "                console.log('Wind Turbine dialog values received:', values);" + NL +
    "                this.applyWindTurbineValues(values);" + NL +
    "                this.cleanup();" + NL +
    "                if (window._globalDialogShowing) delete window._globalDialogShowing;" + NL +
    "                if (this.cell && this.cell._dialogShowing) delete this.cell._dialogShowing;" + NL +
    "            });" + NL +
    "            // The dialog rebuilds its form on show; repopulate once it has settled." + NL +
    "            setTimeout(() => {" + NL +
    "                windTurbineDialog.populateDialog(this.cell.value);" + NL +
    "            }, 100);" + NL +
    "        } catch (error) {" + NL +
    "            console.error('Error showing Wind Turbine dialog:', error);" + NL +
    "            this.cleanup();" + NL +
    "            if (window._globalDialogShowing) delete window._globalDialogShowing;" + NL +
    "            if (this.cell && this.cell._dialogShowing) delete this.cell._dialogShowing;" + NL +
    "            alert('Error opening Wind Turbine dialog: ' + error.message);" + NL +
    "        }" + NL +
    "    }" + NL +
    s.slice(hsgEnd);

// --- 7. applyWindTurbineValues, after applyStaticGeneratorValues --------
const ASG = '    applyStaticGeneratorValues(values) {';
const asgStart = s.indexOf(ASG);
must(asgStart >= 0, 'applyStaticGeneratorValues');
const asgEnd = s.indexOf(NL + '    }' + NL, asgStart) + (NL + '    }' + NL).length;
s = s.slice(0, asgEnd) +
    NL +
    "    applyWindTurbineValues(values) {" + NL +
    "        this.applyAttributesToCell(values);" + NL +
    "        // The turbine's label lives on its first child cell." + NL +
    "        if ('name' in values) {" + NL +
    "            const graph = this.ui?.editor?.graph;" + NL +
    "            if (graph) {" + NL +
    "                const model = graph.getModel();" + NL +
    "                if (model.getChildCount(this.cell) > 0) {" + NL +
    "                    model.setValue(model.getChildAt(this.cell, 0), values.name);" + NL +
    "                }" + NL +
    "            }" + NL +
    "        }" + NL +
    "        console.log('Wind Turbine values applied to cell');" + NL +
    "    }" + NL +
    s.slice(asgEnd);

// --- 8. the single-phase handlers, after applyPVSystemValues ------------
const APV = '    applyPVSystemValues(values) {';
const apvStart = s.indexOf(APV);
must(apvStart >= 0, 'applyPVSystemValues');
const apvEnd = s.indexOf(NL + '    }' + NL, apvStart) + (NL + '    }' + NL).length;
s = s.slice(0, apvEnd) +
    NL +
    "    handleLoad1ph() {" + NL +
    "        this._showOpenDss1phDialog(new Load1phDialog(this.ui), (values) => this.applyOpenDss1phValues(values));" + NL +
    "    }" + NL + NL +
    "    handleSource1ph() {" + NL +
    "        this._showOpenDss1phDialog(new Source1phDialog(this.ui), (values) => this.applyOpenDss1phValues(values));" + NL +
    "    }" + NL + NL +
    "    handleGenerator1ph() {" + NL +
    "        this._showOpenDss1phDialog(new Generator1phDialog(this.ui), (values) => this.applyOpenDss1phValues(values));" + NL +
    "    }" + NL + NL +
    "    handleLine1ph() {" + NL +
    "        this._showOpenDss1phDialog(new Line1phDialog(this.ui), (values) => this.applyLine1phValues(values));" + NL +
    "    }" + NL + NL +
    "    handleTransformer1ph() {" + NL +
    "        this._showOpenDss1phDialog(new Transformer1phDialog(this.ui), (values) => this.applyOpenDss1phValues(values));" + NL +
    "    }" + NL + NL +
    "    /** Shared show/cleanup wrapper for the five OpenDSS single-phase dialogs. */" + NL +
    "    _showOpenDss1phDialog(dialog, onValues) {" + NL +
    "        this.shouldShowDialog = false;" + NL +
    "        this.container.style.display = 'none';" + NL +
    "        this.container.innerHTML = '';" + NL + NL +
    "        if (window._globalDialogShowing || document.querySelector('.modal-overlay')) return;" + NL + NL +
    "        window._globalDialogShowing = true;" + NL +
    "        if (this.cell) this.cell._dialogShowing = true;" + NL + NL +
    "        try {" + NL +
    "            this.setDialogCleanup(dialog);" + NL +
    "            dialog.populateDialog(this.cell.value);" + NL +
    "            dialog.show((values) => {" + NL +
    "                onValues(values);" + NL +
    "                this.cleanup();" + NL +
    "                if (window._globalDialogShowing) delete window._globalDialogShowing;" + NL +
    "                if (this.cell && this.cell._dialogShowing) delete this.cell._dialogShowing;" + NL +
    "            });" + NL +
    "        } catch (error) {" + NL +
    "            console.error('Error showing OpenDSS 1ph dialog:', error);" + NL +
    "            this.cleanup();" + NL +
    "            if (window._globalDialogShowing) delete window._globalDialogShowing;" + NL +
    "            if (this.cell && this.cell._dialogShowing) delete this.cell._dialogShowing;" + NL +
    "            alert('Error opening dialog: ' + error.message);" + NL +
    "        }" + NL +
    "    }" + NL + NL +
    "    applyOpenDss1phValues(values) {" + NL +
    "        this.applyAttributesToCell(values);" + NL +
    "        // These shapes carry their label on the second child when one exists." + NL +
    "        if ('name' in values) {" + NL +
    "            const graph = this.ui?.editor?.graph;" + NL +
    "            if (graph) {" + NL +
    "                const model = graph.getModel();" + NL +
    "                const childCount = model.getChildCount(this.cell);" + NL +
    "                if (childCount > 1) {" + NL +
    "                    model.setValue(model.getChildAt(this.cell, 1), values.name);" + NL +
    "                } else if (childCount > 0) {" + NL +
    "                    model.setValue(model.getChildAt(this.cell, 0), values.name);" + NL +
    "                }" + NL +
    "            }" + NL +
    "        }" + NL +
    "    }" + NL + NL +
    "    applyLine1phValues(values) {" + NL +
    "        this.applyAttributesToCell(values);" + NL +
    "        const graph = this.ui?.editor?.graph;" + NL +
    "        if (graph) graph.refresh(this.cell);" + NL +
    "    }" + NL +
    s.slice(apvEnd);

// --- 9. transformer and line read the live model value -------------------
sub("            transformerDialog.populateDialog(this.cell.value);",
    "            transformerDialog.populateDialog(this.ui?.editor?.graph?.getModel()?.getValue(this.cell) ?? this.cell.value);",
    'transformer populateDialog');
sub("            lineDialog.populateDialog(this.cell.value);",
    "            lineDialog.populateDialog(this.ui?.editor?.graph?.getModel()?.getValue(this.cell) ?? this.cell.value);",
    'line populateDialog');

// --- 10. external grid also carries harmonic parameters -----------------
sub("                const opfParam = dialog.opfParameters.find(p => p.id === attributeName);" + NL +
    "                if (opfParam) {" + NL +
    "                    if (opfParam.type === 'checkbox') {" + NL +
    "                        opfParam.value = attributeValue === 'true' || attributeValue === true;" + NL +
    "                    } else {" + NL +
    "                        opfParam.value = attributeValue.toString();" + NL +
    "                    }" + NL +
    "                }" + NL +
    "            }" + NL +
    "        }",
    "                const opfParam = dialog.opfParameters.find(p => p.id === attributeName);" + NL +
    "                if (opfParam) {" + NL +
    "                    if (opfParam.type === 'checkbox') {" + NL +
    "                        opfParam.value = attributeValue === 'true' || attributeValue === true;" + NL +
    "                    } else {" + NL +
    "                        opfParam.value = attributeValue.toString();" + NL +
    "                    }" + NL +
    "                }" + NL + NL +
    "                const harmonicParam = dialog.harmonicParameters && dialog.harmonicParameters.find(p => p.id === attributeName);" + NL +
    "                if (harmonicParam) {" + NL +
    "                    harmonicParam.value = attributeValue != null ? attributeValue.toString() : '';" + NL +
    "                }" + NL +
    "            }" + NL +
    "        }",
    'external grid harmonics');

// --- 11. help links: pin the version, and two pages were renamed ---------
const urlsBefore = (s.match(/pandapower\.readthedocs\.io\/en\/latest\//g) || []).length;
must(urlsBefore >= 28, `expected >=28 doc links, found ${urlsBefore}`);
s = s.split('pandapower.readthedocs.io/en/latest/').join('pandapower.readthedocs.io/en/v3.4.0/');
sub('/en/v3.4.0/elements/dc_bus.html', '/en/v3.4.0/elements/bus_dc.html', 'dc_bus doc rename');
sub('/en/v3.4.0/elements/b2b_vsc.html', '/en/v3.4.0/elements/vsc_stacked.html', 'b2b_vsc doc rename');

fs.writeFileSync(P, s);
console.log('port applied:', s.split(NL).length, 'lines;', refactored, 'apply methods refactored;', urlsBefore, 'doc links pinned');
