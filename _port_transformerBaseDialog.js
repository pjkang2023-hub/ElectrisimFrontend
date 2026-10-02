// Port transformerBaseDialog.js: re-apply the ten commits that landed on the
// minified file onto the last readable source (d56b6813).
//
// The readable idiom for the new bracket-group rendering, schematic/OPF/economic
// tabs and economic helper is taken from threeWindingTransformerBaseDialog.js,
// which is the direct sibling of this dialog and was never minified.
const fs = require('fs');
const P = 'src/main/webapp/js/electrisim/transformerBaseDialog.js';
let s = fs.readFileSync(P, 'utf8');
const NL = '\n';
const must = (c, m) => { if (!c) { console.error('ANCHOR FAILED: ' + m); process.exit(1); } };
const sub = (from, to, label) => { must(s.includes(from), label); s = s.replace(from, to); };

// 1. helpers
sub("import { LibraryDialogManager } from './LibraryDialogManager.js';",
    "import { LibraryDialogManager } from './LibraryDialogManager.js';" + NL +
    "import { createEconomicTabContent, buildCostPerUnitByCurrency } from './utils/economicTabHelper.js';" + NL +
    "import { createDialogBracketGroup } from './utils/dialogBracketGroup.js';",
    'imports');

// 2. defaults: the schematic labels sit next to the name, the OPF/economic
//    fields at the end of the block
sub(s.match(/^ {4}name: "Transformer",$/m)[0],
    '    name: "Transformer",' + NL +
    '    term_label_0: "HV",' + NL +
    '    term_label_1: "LV",',
    'term labels');

sub("    XRConst: 'No'" + NL + "};",
    "    XRConst: 'No'," + NL +
    '    cost_per_unit_by_currency: "0",' + NL +
    "    max_loading_percent: 0" + NL + "};",
    'defaults tail');

// 3. schematic parameters, declared before the load-flow set
sub("        this.inputs = new Map(); // Initialize inputs map for form elements",
    "        this.inputs = new Map(); // Initialize inputs map for form elements" + NL + NL +
    "        this.schematicParameters = [" + NL +
    "            {" + NL +
    "                id: 'term_label_0'," + NL +
    "                label: 'Schematic label — port 0 (HV bus / first connection)'," + NL +
    "                description: 'Display only. Matches edge order for export (hv_bus). Does not change ratings or solver data.'," + NL +
    "                type: 'text'," + NL +
    "                value: this.data.term_label_0 || 'HV'" + NL +
    "            }," + NL +
    "            {" + NL +
    "                id: 'term_label_1'," + NL +
    "                label: 'Schematic label — port 1 (LV bus / second connection)'," + NL +
    "                description: 'Display only. Matches edge order for export (lv_bus). Does not change ratings or solver data.'," + NL +
    "                type: 'text'," + NL +
    "                value: this.data.term_label_1 || 'LV'" + NL +
    "            }" + NL +
    "        ];",
    'schematicParameters');

// 4. vector group list trimmed to the base groups
sub("                options: ['Dyn', 'Dyn11', 'Dyn1', 'Yd', 'Yy', 'YNyn0', 'YNd', 'YNd1', 'YNd11', 'Dd', 'Dd0', 'Dd6', 'Yz', 'Dz']",
    "                options: ['Dyn', 'Yd', 'Yy', 'YNd', 'Dd', 'Yz', 'Dz']",
    'vector group options');

// 5-7. the four discrete-tap-control fields become one bracketed group
sub("                value: this.data.discrete_tap_control" + NL + "            },",
    "                value: this.data.discrete_tap_control," + NL +
    "                bracketGroup: 'discreteTapControl'," + NL +
    "                bracketGroupTitle: 'Discrete tap control (DiscreteTapControl)'" + NL +
    "            },",
    'discrete_tap_control bracket');

sub("                options: ['lv', 'hv']" + NL + "            },",
    "                options: ['lv', 'hv']," + NL +
    "                bracketGroup: 'discreteTapControl'" + NL +
    "            },",
    'control_side bracket');

const MIN09 = "                min: '0.9'" + NL + "            },";
const MIN09_NEW = "                min: '0.9'," + NL +
                  "                bracketGroup: 'discreteTapControl'" + NL + "            },";
must(s.split(MIN09).length - 1 === 1, 'vm_lower_pu min 0.9');
s = s.replace(MIN09, MIN09_NEW);
const MIN09B = "                min: '0.9'" + NL + "            }";
must(s.includes(MIN09B), 'vm_upper_pu min 0.9');
s = s.replace(MIN09B, "                min: '0.9'," + NL +
                      "                bracketGroup: 'discreteTapControl'" + NL + "            }");

// 8-9. OPF and economic parameter sets, after the harmonic set
const harmStart = s.indexOf('        this.harmonicParameters = [');
must(harmStart > 0, 'harmonicParameters');
const harmEnd = s.indexOf('        ];', harmStart);
must(harmEnd > 0, 'harmonicParameters terminator');
s = s.slice(0, harmEnd + '        ];'.length) +
    NL + NL +
    "        this.opfParameters = [" + NL +
    "            {" + NL +
    "                id: 'max_loading_percent'," + NL +
    "                label: 'Maximum loading (OPF)'," + NL +
    "                symbol: 'max_loading_percent'," + NL +
    "                unit: '%'," + NL +
    "                description: 'Optional AC optimal power flow thermal limit: maximum loading in percent of rated sn_mva (pandapower trafo max_loading_percent). Use 0 for no limit. See https://pandapower.readthedocs.io/en/latest/elements/trafo.html'," + NL +
    "                type: 'number'," + NL +
    "                value: this.data.max_loading_percent.toString()," + NL +
    "                step: '0.1'," + NL +
    "                min: '0'" + NL +
    "            }" + NL +
    "        ];" + NL + NL +
    "        this.economicParameters = [" + NL +
    "            {" + NL +
    "                id: 'cost_per_unit_by_currency'," + NL +
    "                label: 'Cost per unit'," + NL +
    "                description: 'Cost per unit for Economic Analysis CAPEX calculation'," + NL +
    "                type: 'text'," + NL +
    "                value: ''" + NL +
    "            }" + NL +
    "        ];" +
    s.slice(harmEnd + '        ];'.length);

// 10. documentation link
sub('https://electrisim.com/documentation#transformer" target="_blank">',
    'https://electrisim.com/documentation.html#transformer" target="_blank" rel="noopener noreferrer">',
    'documentation link');

// 11a. the three new tabs are appended to the tab strip
sub("        tabContainer.appendChild(harmonicTab);",
    "        tabContainer.appendChild(harmonicTab);" + NL +
    "        tabContainer.appendChild(opfTab);" + NL +
    "        tabContainer.appendChild(schematicTab);" + NL +
    "        tabContainer.appendChild(economicTab);",
    'tab strip append');

// 11-12. three further tabs and their content panes
sub("        const harmonicTab = this.createTab('Harmonic', 'harmonic', this.currentTab === 'harmonic');",
    "        const harmonicTab = this.createTab('Harmonic', 'harmonic', this.currentTab === 'harmonic');" + NL +
    "        const opfTab = this.createTab('OPF', 'opf', this.currentTab === 'opf');" + NL +
    "        const schematicTab = this.createTab('Schematic', 'schematic', this.currentTab === 'schematic');" + NL +
    "        const economicTab = this.createTab('Economic', 'economic', this.currentTab === 'economic');",
    'tabs');

sub("        const harmonicContent = this.createTabContent('harmonic', this.harmonicParameters);",
    "        const harmonicContent = this.createTabContent('harmonic', this.harmonicParameters);" + NL +
    "        const opfContent = this.createTabContent('opf', this.opfParameters);" + NL +
    "        const schematicContent = this.createTabContent('schematic', this.schematicParameters);" + NL +
    "        const economicContent = this.createTabContent('economic', this.economicParameters);",
    'tab contents');

sub("        contentArea.appendChild(harmonicContent);",
    "        contentArea.appendChild(harmonicContent);" + NL +
    "        contentArea.appendChild(opfContent);" + NL +
    "        contentArea.appendChild(schematicContent);" + NL +
    "        contentArea.appendChild(economicContent);",
    'content append');

// 13. tab wiring for six tabs
sub("        const allTabs = [loadFlowTab, shortCircuitTab, harmonicTab];" + NL +
    "        const allContents = [loadFlowContent, shortCircuitContent, harmonicContent];" + NL +
    "        loadFlowTab.onclick = () => this.switchTab('loadflow', loadFlowTab, allTabs.filter(t => t !== loadFlowTab), loadFlowContent, allContents.filter(c => c !== loadFlowContent));" + NL +
    "        shortCircuitTab.onclick = () => this.switchTab('shortcircuit', shortCircuitTab, allTabs.filter(t => t !== shortCircuitTab), shortCircuitContent, allContents.filter(c => c !== shortCircuitContent));" + NL +
    "        harmonicTab.onclick = () => this.switchTab('harmonic', harmonicTab, allTabs.filter(t => t !== harmonicTab), harmonicContent, allContents.filter(c => c !== harmonicContent));",
    "        const allTabs = [loadFlowTab, shortCircuitTab, harmonicTab, opfTab, schematicTab, economicTab];" + NL +
    "        const allContents = [loadFlowContent, shortCircuitContent, harmonicContent, opfContent, schematicContent, economicContent];" + NL +
    "        loadFlowTab.onclick = () => this.switchTab('loadflow', loadFlowTab, allTabs.filter(t => t !== loadFlowTab), loadFlowContent, allContents.filter(c => c !== loadFlowContent));" + NL +
    "        shortCircuitTab.onclick = () => this.switchTab('shortcircuit', shortCircuitTab, allTabs.filter(t => t !== shortCircuitTab), shortCircuitContent, allContents.filter(c => c !== shortCircuitContent));" + NL +
    "        harmonicTab.onclick = () => this.switchTab('harmonic', harmonicTab, allTabs.filter(t => t !== harmonicTab), harmonicContent, allContents.filter(c => c !== harmonicContent));" + NL +
    "        opfTab.onclick = () => this.switchTab('opf', opfTab, allTabs.filter(t => t !== opfTab), opfContent, allContents.filter(c => c !== opfContent));" + NL +
    "        schematicTab.onclick = () => this.switchTab('schematic', schematicTab, allTabs.filter(t => t !== schematicTab), schematicContent, allContents.filter(c => c !== schematicContent));" + NL +
    "        economicTab.onclick = () => this.switchTab('economic', economicTab, allTabs.filter(t => t !== economicTab), economicContent, allContents.filter(c => c !== economicContent));",
    'tab wiring');

// 14. the economic tab is rendered by the shared helper, after the container
//     exists so it inherits the same dataset/display handling
sub("        const form = document.createElement('form');",
    "        if (tabId === 'economic' && parameters.length > 0 && parameters[0]?.id === 'cost_per_unit_by_currency') {" + NL +
    "            content.appendChild(createEconomicTabContent(buildCostPerUnitByCurrency(this.data), this.inputs, true));" + NL +
    "            return content;" + NL +
    "        }" + NL + NL +
    "        const form = document.createElement('form');",
    'createTabContent economic branch');

// 15. bracket groups wrap consecutive fields sharing a bracketGroup
sub("        parameters.forEach(param => {" + NL +
    "            const parameterRow = document.createElement('div');" + NL +
    "            Object.assign(parameterRow.style, {" + NL +
    "                display: 'grid'," + NL +
    "                gridTemplateColumns: '1fr 200px',",
    "        let bracketWrap = null;" + NL + NL +
    "        parameters.forEach((param, paramIndex) => {" + NL +
    "            const prev = paramIndex > 0 ? parameters[paramIndex - 1] : null;" + NL +
    "            if (param.bracketGroup && (!prev || prev.bracketGroup !== param.bracketGroup)) {" + NL +
    "                bracketWrap = createDialogBracketGroup(param.bracketGroupTitle || '');" + NL +
    "                form.appendChild(bracketWrap);" + NL +
    "            }" + NL +
    "            if (!param.bracketGroup) {" + NL +
    "                bracketWrap = null;" + NL +
    "            }" + NL + NL +
    "            const isNameField = param.id === 'name';" + NL +
    "            const parameterRow = document.createElement('div');" + NL +
    "            Object.assign(parameterRow.style, {" + NL +
    "                display: 'grid'," + NL +
    "                gridTemplateColumns: isNameField ? 'minmax(0,1fr) minmax(300px,1.2fr)' : '1fr 200px',",
    'bracket group loop');

// 16. stretchy value column on the name row
sub("                width: '200px'", "                width: isNameField ? '100%' : '200px'," + NL +
    "                ...(isNameField ? { minWidth: '0' } : {})", 'right column width');

const W = "                    width: '180px',";
const WN = "                    width: isNameField ? '100%' : '180px'," + NL +
           "                    ...(isNameField ? { minWidth: '0' } : {}),";
must(s.split(W).length - 1 === 2, 'two 180px widths');
s = s.split(W).join(WN);

// 17. rows inside a bracket group sit tighter and go into the group box
sub("            parameterRow.appendChild(leftColumn);" + NL +
    "            parameterRow.appendChild(rightColumn);" + NL +
    "            form.appendChild(parameterRow);" + NL +
    "        });",
    "            parameterRow.appendChild(leftColumn);" + NL +
    "            parameterRow.appendChild(rightColumn);" + NL +
    "            Object.assign(parameterRow.style, param.bracketGroup ? { marginBottom: '2px' } : {});" + NL + NL +
    "            const appendTarget = param.bracketGroup && bracketWrap ? bracketWrap : form;" + NL +
    "            appendTarget.appendChild(parameterRow);" + NL + NL +
    "            const next = parameters[paramIndex + 1];" + NL +
    "            param.bracketGroup && (!next || next.bracketGroup !== param.bracketGroup) && (bracketWrap = null);" + NL +
    "        });",
    'row append');

// 18. getFormValues covers every tab, and the cost field stays a string
sub("        [...this.loadFlowParameters, ...this.shortCircuitParameters, ...this.harmonicParameters].forEach(param => {" + NL +
    "            const input = this.inputs.get(param.id);" + NL +
    "            if (input) {" + NL +
    "                if (param.type === 'number') {",
    "        [...this.schematicParameters, ...this.loadFlowParameters, ...this.shortCircuitParameters, ...this.harmonicParameters, ...this.opfParameters, ...(this.economicParameters || [])].forEach(param => {" + NL +
    "            const input = this.inputs.get(param.id);" + NL +
    "            if (input) {" + NL +
    "                if (param.id === 'cost_per_unit_by_currency') {" + NL +
    "                    values[param.id] = input.value || '0';" + NL +
    "                } else if (param.type === 'number') {",
    'getFormValues');

// 19. mappings gain the OPF limit
sub("            'vm_upper_pu': transformerData.vm_upper_pu != null ? parseFloat(transformerData.vm_upper_pu) : 1.01",
    "            'vm_upper_pu': transformerData.vm_upper_pu != null ? parseFloat(transformerData.vm_upper_pu) : 1.01," + NL +
    "            'max_loading_percent': transformerData.max_loading_percent != null ? parseFloat(transformerData.max_loading_percent) : 0",
    'mappings');

// 20. stored attributes reach the three new parameter sets
sub("                // Update the dialog's parameter values (not DOM inputs)" + NL +
    "                const loadFlowParam = this.loadFlowParameters.find(p => p.id === attributeName);",
    "                // Update the dialog's parameter values (not DOM inputs)" + NL +
    "                const schematicParam = this.schematicParameters.find(p => p.id === attributeName);" + NL +
    "                if (schematicParam) {" + NL +
    "                    schematicParam.value = attributeValue;" + NL +
    "                }" + NL + NL +
    "                const loadFlowParam = this.loadFlowParameters.find(p => p.id === attributeName);",
    'schematic attribute');

sub("                const harmonicParam = this.harmonicParameters.find(p => p.id === attributeName);" + NL +
    "                if (harmonicParam) {" + NL +
    "                    if (harmonicParam.type === 'checkbox') {" + NL +
    "                        harmonicParam.value = attributeValue === 'true' || attributeValue === true;" + NL +
    "                    } else {" + NL +
    "                        harmonicParam.value = attributeValue;" + NL +
    "                    }" + NL +
    "                }",
    "                const harmonicParam = this.harmonicParameters.find(p => p.id === attributeName);" + NL +
    "                if (harmonicParam) {" + NL +
    "                    if (harmonicParam.type === 'checkbox') {" + NL +
    "                        harmonicParam.value = attributeValue === 'true' || attributeValue === true;" + NL +
    "                    } else {" + NL +
    "                        harmonicParam.value = attributeValue;" + NL +
    "                    }" + NL +
    "                }" + NL + NL +
    "                const opfParam = this.opfParameters.find(p => p.id === attributeName);" + NL +
    "                if (opfParam) {" + NL +
    "                    if (opfParam.type === 'checkbox') {" + NL +
    "                        opfParam.value = attributeValue === 'true' || attributeValue === true;" + NL +
    "                    } else {" + NL +
    "                        opfParam.value = attributeValue;" + NL +
    "                    }" + NL +
    "                }" + NL + NL +
    "                if (attributeName === 'cost_per_unit_by_currency') {" + NL +
    "                    this.data[attributeName] = attributeValue;" + NL +
    "                    const ep = this.economicParameters && this.economicParameters.find(p => p.id === attributeName);" + NL +
    "                    if (ep) ep.value = attributeValue.toString();" + NL +
    "                }",
    'opf and economic attributes');

// 21-23. library grid
sub('tap_phase_shifter: false, tap_changer_type: "Ratio" },',
    'tap_phase_shifter: false, tap_changer_type: "Ratio", cost_per_unit_by_currency: "0", max_loading_percent: 0 },',
    'rowDefs defaults');

sub('    stopEditingWhenGridLosesFocus: true,', '    stopEditingWhenCellsLoseFocus: true,', 'grid option');

fs.writeFileSync(P, s);
console.log('port applied:', s.split(NL).length, 'lines');
