// Port lineBaseDialog.js: re-apply the seven commits that landed on the minified
// file onto the last readable source (0dd01457).
const fs = require('fs');
const P = 'src/main/webapp/js/electrisim/lineBaseDialog.js';
let s = fs.readFileSync(P, 'utf8');
const NL = '\n';
const must = (c, m) => { if (!c) { console.error('ANCHOR FAILED: ' + m); process.exit(1); } };
const sub = (from, to, label) => { must(s.includes(from), label); s = s.replace(from, to); };

// 1. economic tab helper
sub("import { LibraryDialogManager } from './LibraryDialogManager.js';",
    "import { LibraryDialogManager } from './LibraryDialogManager.js';" + NL +
    "import { createEconomicTabContent, buildCostPerUnitByCurrency } from './utils/economicTabHelper.js';",
    'imports');

// 2. defaults
sub("    df: 1.0" + NL + "};",
    "    df: 1.0," + NL + "    max_loading_percent: 0," + NL +
    '    cost_per_unit_by_currency: "{}"' + NL + "};",
    'defaultLineData');

// 3. OPF thermal limit + economic parameter set
const oldOpfHead = "        this.opfParameters = [" + NL +
    "            // Lines typically don't have specific OPF parameters beyond load flow" + NL +
    "            // This tab is kept for consistency but may be empty or contain future extensions";
must(s.includes(oldOpfHead), 'opfParameters comment block');
const opfStart = s.indexOf(oldOpfHead);
const opfEnd = s.indexOf('];', opfStart);
must(opfEnd > 0, 'opfParameters terminator');
s = s.slice(0, opfStart) +
    "        this.opfParameters = [" + NL +
    "            {" + NL +
    "                id: 'max_loading_percent'," + NL +
    "                label: 'Maximum loading (OPF) — max_loading_percent'," + NL +
    "                unit: '%'," + NL +
    "                description: 'Optional AC optimal power flow thermal limit: maximum line loading in percent (pandapower line max_loading_percent). Use 0 for no limit. See https://pandapower.readthedocs.io/en/latest/elements/line.html'," + NL +
    "                type: 'number'," + NL +
    "                value: this.data.max_loading_percent.toString()," + NL +
    "                step: '0.1'," + NL +
    "                min: '0'" + NL +
    "            }" + NL +
    "        ];" + NL + NL +
    "        this.economicParameters = [" + NL +
    "            { id: 'cost_per_unit_by_currency', label: 'Cost per unit', description: 'Cost per unit for Economic Analysis CAPEX calculation', type: 'text', value: '' }" + NL +
    "        ];" +
    s.slice(opfEnd + 2);

// 4. documentation link
sub('https://electrisim.com/documentation#line" target="_blank">',
    'https://electrisim.com/documentation.html#line" target="_blank" rel="noopener noreferrer">',
    'documentation link');

// 5-9. Economic tab, content, and four-way wiring
sub("        const opfTab = this.createTab('OPF', 'opf', this.currentTab === 'opf');",
    "        const opfTab = this.createTab('OPF', 'opf', this.currentTab === 'opf');" + NL +
    "        const economicTab = this.createTab('Economic', 'economic', this.currentTab === 'economic');",
    'opfTab');

sub("        tabContainer.appendChild(opfTab);" + NL + "        container.appendChild(tabContainer);",
    "        tabContainer.appendChild(opfTab);" + NL +
    "        tabContainer.appendChild(economicTab);" + NL +
    "        container.appendChild(tabContainer);",
    'tab append');

sub("        const opfContent = this.createTabContent('opf', this.opfParameters);",
    "        const opfContent = this.createTabContent('opf', this.opfParameters);" + NL +
    "        const economicContent = this.createTabContent('economic', this.economicParameters);",
    'opfContent');

sub("        contentArea.appendChild(opfContent);",
    "        contentArea.appendChild(opfContent);" + NL +
    "        contentArea.appendChild(economicContent);",
    'content append');

sub("        loadFlowTab.onclick = () => this.switchTab('loadflow', loadFlowTab, [shortCircuitTab, opfTab], loadFlowContent, [shortCircuitContent, opfContent]);" + NL +
    "        shortCircuitTab.onclick = () => this.switchTab('shortcircuit', shortCircuitTab, [loadFlowTab, opfTab], shortCircuitContent, [loadFlowContent, opfContent]);" + NL +
    "        opfTab.onclick = () => this.switchTab('opf', opfTab, [loadFlowTab, shortCircuitTab], opfContent, [loadFlowContent, shortCircuitContent]);",
    "        loadFlowTab.onclick = () => this.switchTab('loadflow', loadFlowTab, [shortCircuitTab, opfTab, economicTab], loadFlowContent, [shortCircuitContent, opfContent, economicContent]);" + NL +
    "        shortCircuitTab.onclick = () => this.switchTab('shortcircuit', shortCircuitTab, [loadFlowTab, opfTab, economicTab], shortCircuitContent, [loadFlowContent, opfContent, economicContent]);" + NL +
    "        opfTab.onclick = () => this.switchTab('opf', opfTab, [loadFlowTab, shortCircuitTab, economicTab], opfContent, [loadFlowContent, shortCircuitContent, economicContent]);" + NL +
    "        economicTab.onclick = () => this.switchTab('economic', economicTab, [loadFlowTab, shortCircuitTab, opfTab], economicContent, [loadFlowContent, shortCircuitContent, opfContent]);",
    'tab wiring');

// 10. economic tab rendered by the shared helper, after the container exists
sub("        if (parameters.length === 0) {",
    "        if (tabId === 'economic' && parameters.length > 0 && parameters[0]?.id === 'cost_per_unit_by_currency') {" + NL +
    "            content.appendChild(createEconomicTabContent(buildCostPerUnitByCurrency(this.data), this.inputs, true));" + NL +
    "            return content;" + NL +
    "        }" + NL + NL +
    "        if (parameters.length === 0) {",
    'createTabContent economic branch');

// 11-13. the name row gets a wider, stretchy value column
sub("        parameters.forEach(param => {" + NL +
    "            const parameterRow = document.createElement('div');" + NL +
    "            Object.assign(parameterRow.style, {" + NL +
    "                display: 'grid'," + NL +
    "                gridTemplateColumns: '1fr 200px',",
    "        parameters.forEach(param => {" + NL +
    "            const isName = param.id === 'name';" + NL +
    "            const parameterRow = document.createElement('div');" + NL +
    "            Object.assign(parameterRow.style, {" + NL +
    "                display: 'grid'," + NL +
    "                gridTemplateColumns: isName ? 'minmax(0,1fr) minmax(300px,1.2fr)' : '1fr 200px',",
    'grid template');

sub("                minHeight: '60px'," + NL + "                width: '200px'",
    "                minHeight: '60px'," + NL +
    "                width: isName ? '100%' : '200px'," + NL +
    "                ...(isName ? { minWidth: '0' } : {})",
    'right column width');

const WIDTH_OLD = "                    width: '180px',";
const WIDTH_NEW = "                    width: isName ? '100%' : '180px'," + NL +
                  "                    ...(isName ? { minWidth: '0' } : {}),";
must(s.split(WIDTH_OLD).length - 1 === 2, 'two 180px widths');
s = s.split(WIDTH_OLD).join(WIDTH_NEW);

// 14-15. namespaced DOM ids (plain param ids collided with other dialogs)
sub("            input.id = param.id;", "            input.id = 'esim-line-' + param.id;", 'input id');
sub("            label.htmlFor = param.id;", "            label.htmlFor = 'esim-line-' + param.id;", 'label htmlFor');

// 16. economic params join three of the four parameter sweeps. The "Initial
//     parameter values" logger is left alone - it runs before economicParameters
//     has been populated from cell data.
const SPREAD_OLD = '[...this.loadFlowParameters, ...this.shortCircuitParameters, ...this.opfParameters].forEach(param => {';
const SPREAD_NEW = '[...this.loadFlowParameters, ...this.shortCircuitParameters, ...this.opfParameters, ...(this.economicParameters || [])].forEach(param => {';
for (const lead of [
    "        // Collect values from all parameter sets" + NL,
    "        console.log('Final parameter values:');" + NL,
    "        console.log('Updating DOM inputs with parameter values...');" + NL,
]) {
    sub(lead + "        " + SPREAD_OLD, lead + "        " + SPREAD_NEW, 'spread: ' + lead.trim().slice(0, 40));
}

// 17. getFormValues handles the JSON cost field and plain text inputs
sub("                } else if (input.tagName === 'SELECT') {" + NL +
    "                    values[param.id] = input.value;" + NL +
    "                } else {",
    "                } else if (input.tagName === 'SELECT') {" + NL +
    "                    values[param.id] = input.value;" + NL +
    "                } else if (param.id === 'cost_per_unit_by_currency') {" + NL +
    "                    values[param.id] = input.value || '{}';" + NL +
    "                } else if (param.type === 'text') {" + NL +
    "                    values[param.id] = input.value;" + NL +
    "                } else {",
    'getFormValues branches');

// 18. mirror the name onto this.data so the wide name row can read it
sub("                        loadFlowParam.value = attributeValue;" + NL +
    "                    }" + NL +
    "                    console.log(`  Updated loadFlow",
    "                        loadFlowParam.value = attributeValue;" + NL +
    "                    }" + NL +
    "                    if (attributeName === 'name') this.data.name = attributeValue;" + NL +
    "                    console.log(`  Updated loadFlow",
    'name mirror');

// 19. the cost field arrives as a cell attribute, not as a form parameter
sub("                if (!loadFlowParam && !shortCircuitParam && !opfParam) {" + NL +
    "                    console.log(`  WARNING: No parameter found for attribute",
    "                if (attributeName === 'cost_per_unit_by_currency') {" + NL +
    "                    this.data[attributeName] = attributeValue;" + NL +
    "                    const ep = this.economicParameters && this.economicParameters.find(p => p.id === attributeName);" + NL +
    "                    if (ep) ep.value = attributeValue.toString();" + NL +
    "                }" + NL + NL +
    "                if (!loadFlowParam && !shortCircuitParam && !opfParam) if (attributeName !== 'cost_per_unit_by_currency') {" + NL +
    "                    console.log(`  WARNING: No parameter found for attribute",
    'cost attribute');

// 20. mappings gain the OPF limit
sub("            'df': lineData.df || 1.0" + NL + "        };",
    "            'df': lineData.df || 1.0," + NL +
    "            'max_loading_percent': lineData.max_loading_percent != null ? parseFloat(lineData.max_loading_percent) : 0" + NL +
    "        };",
    'mappings');

// 21-22. library grid columns and row defaults
const lastCol = '    { field: "endtemp_degree", headerTooltip: "Short-Circuit end temperature of the line", maxWidth: 150, valueParser: (params) => parseFloat(params.newValue) || 0 }';
sub(lastCol + NL + '];',
    lastCol + ',' + NL +
    '    { field: "max_loading_percent", headerTooltip: "OPF max loading % (pandapower); 0 = no limit", maxWidth: 160, valueParser: (params) => parseFloat(params.newValue) || 0 },' + NL +
    '    { field: "cost_per_unit_by_currency", headerTooltip: \'Cost per unit for Economic Analysis (JSON e.g. {"EUR":100})\', maxWidth: 200 }' + NL + '];',
    'columnDefs');

sub('endtemp_degree:250.0, in_service: true },',
    'endtemp_degree:250.0, in_service: true, max_loading_percent: 0, cost_per_unit_by_currency: "{}" },',
    'rowDefs defaults');

// 23. ag-grid renamed this option
sub('    stopEditingWhenGridLosesFocus: true', '    stopEditingWhenCellsLoseFocus: true', 'grid option');

fs.writeFileSync(P, s);
console.log('port applied:', s.split(NL).length, 'lines');
