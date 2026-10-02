const fs = require('fs');
const P = 'src/main/webapp/js/electrisim/loadDialog.js';
let s = fs.readFileSync(P, 'utf8');
const must = (c, m) => { if (!c) { console.error('ANCHOR FAILED: ' + m); process.exit(1); } };
const sub = (from, to, label) => { must(s.includes(from), label); s = s.replace(from, to); };

// --- data-centre defaults ----------------------------------------------
sub(
    "    opf_cp2_eur_per_mw2: '',\n};",
    "    opf_cp2_eur_per_mw2: '',\n" +
    "    dc_computational_enabled: false,\n" +
    "    dc_it_share_percent: 85,\n" +
    "    dc_ups_hold_s: 0,\n" +
    "    dc_ride_through_csv: '0,0.9\\n10,0.9\\n20,0.9',\n};",
    'data defaults');

// --- computationalParameters, right after economicParameters ------------
const TERM = '        ];';
const econEnd = s.indexOf(TERM, s.indexOf('this.economicParameters = ['));
must(econEnd > 0, 'economicParameters terminator');
const computational = TERM + `

        this.computationalParameters = [
            {
                id: 'dc_computational_enabled',
                label: 'Enable computational load model',
                symbol: 'dc_computational_enabled',
                description: 'When enabled, ANDES transient stability can compare POI voltage to the ride-through curve below. IT share is constant-P in load flow (remainder uses ZIP % on Load Flow tab).',
                type: 'checkbox',
                value: this.data.dc_computational_enabled
            },
            {
                id: 'dc_it_share_percent',
                label: 'IT / constant-P share',
                symbol: 'dc_it_share_percent',
                unit: '%',
                description: 'Share of active power modeled as constant power (IT). Set cooling via Constant Impedance / Constant Current on the Load Flow tab.',
                type: 'number',
                value: String(this.data.dc_it_share_percent),
                step: '1',
                min: '0',
                max: '100'
            },
            {
                id: 'dc_ups_hold_s',
                label: 'UPS hold-up time',
                symbol: 'dc_ups_hold_s',
                unit: 's',
                description: 'Documented UPS hold-up for interconnection reports (not a separate EMT model in this release).',
                type: 'number',
                value: String(this.data.dc_ups_hold_s),
                step: '0.1',
                min: '0'
            },
            {
                id: 'dc_ride_through_csv',
                label: 'Voltage ride-through curve',
                symbol: 'dc_ride_through_csv',
                description: 'CSV lines: time_s, v_min_pu. POI voltage from ANDES TDS must stay at or above this envelope when computational load is enabled.',
                type: 'textarea',
                value: this.data.dc_ride_through_csv,
                rows: 6
            }
        ];`;
s = s.slice(0, econEnd) + computational + s.slice(econEnd + TERM.length);

// --- the Data center tab and its content pane ---------------------------
sub("        const economicTab = this.createTab('Economic', 'economic', this.currentTab === 'economic');",
    "        const economicTab = this.createTab('Economic', 'economic', this.currentTab === 'economic');\n" +
    "        const computationalTab = this.createTab('Data center', 'computational', this.currentTab === 'computational');",
    'economicTab');

sub("        tabContainer.appendChild(economicTab);\n        container.appendChild(tabContainer);",
    "        tabContainer.appendChild(economicTab);\n        tabContainer.appendChild(computationalTab);\n        container.appendChild(tabContainer);",
    'tab append');

sub("        const economicContent = this.createTabContent('economic', this.economicParameters);",
    "        const economicContent = this.createTabContent('economic', this.economicParameters);\n" +
    "        const computationalContent = this.createTabContent('computational', this.computationalParameters);",
    'economicContent');

sub("        contentArea.appendChild(economicContent);\n        container.appendChild(contentArea);",
    "        contentArea.appendChild(economicContent);\n        contentArea.appendChild(computationalContent);\n        container.appendChild(contentArea);",
    'content append');

// --- tab wiring: derive the "other tabs" lists instead of spelling them out
const oldWiring =
    "        // Tab click handlers\n" +
    "        loadFlowTab.onclick = () => this.switchTab('loadflow', loadFlowTab, [shortCircuitTab, opfTab, harmonicTab, economicTab], loadFlowContent, [shortCircuitContent, opfContent, harmonicContent, economicContent]);\n" +
    "        shortCircuitTab.onclick = () => this.switchTab('shortcircuit', shortCircuitTab, [loadFlowTab, opfTab, harmonicTab, economicTab], shortCircuitContent, [loadFlowContent, opfContent, harmonicContent, economicContent]);\n" +
    "        opfTab.onclick = () => this.switchTab('opf', opfTab, [loadFlowTab, shortCircuitTab, harmonicTab, economicTab], opfContent, [loadFlowContent, shortCircuitContent, harmonicContent, economicContent]);\n" +
    "        harmonicTab.onclick = () => this.switchTab('harmonic', harmonicTab, [loadFlowTab, shortCircuitTab, opfTab, economicTab], harmonicContent, [loadFlowContent, shortCircuitContent, opfContent, economicContent]);\n" +
    "        economicTab.onclick = () => this.switchTab('economic', economicTab, [loadFlowTab, shortCircuitTab, opfTab, harmonicTab], economicContent, [loadFlowContent, shortCircuitContent, opfContent, harmonicContent]);";

const newWiring =
    "        // Tab click handlers. With six tabs, spelling out \"every other tab\" and\n" +
    "        // \"every other content pane\" per line stopped being maintainable; derive both.\n" +
    "        const allTabs = [loadFlowTab, shortCircuitTab, opfTab, harmonicTab, economicTab, computationalTab];\n" +
    "        const allContents = [loadFlowContent, shortCircuitContent, opfContent, harmonicContent, economicContent, computationalContent];\n" +
    "        const bindTab = (tabId, tabEl, contentEl) => {\n" +
    "            tabEl.onclick = () => this.switchTab(\n" +
    "                tabId,\n" +
    "                tabEl,\n" +
    "                allTabs.filter((t) => t !== tabEl),\n" +
    "                contentEl,\n" +
    "                allContents.filter((c) => c !== contentEl)\n" +
    "            );\n" +
    "        };\n" +
    "        bindTab('loadflow', loadFlowTab, loadFlowContent);\n" +
    "        bindTab('shortcircuit', shortCircuitTab, shortCircuitContent);\n" +
    "        bindTab('opf', opfTab, opfContent);\n" +
    "        bindTab('harmonic', harmonicTab, harmonicContent);\n" +
    "        bindTab('economic', economicTab, economicContent);\n" +
    "        bindTab('computational', computationalTab, computationalContent);";
sub(oldWiring, newWiring, 'tab click handlers');

// --- include the new array wherever parameters are iterated -------------
sub("...this.harmonicParameters, ...this.economicParameters].forEach(param => {",
    "...this.harmonicParameters, ...this.economicParameters, ...this.computationalParameters].forEach(param => {",
    'parameter spread');

// --- apply stored cell attributes to the new fields --------------------
sub(
    "                if (attributeName === 'cost_per_unit_by_currency') {\n" +
    "                    this.data[attributeName] = attributeValue;\n" +
    "                }\n" +
    "                if (!loadFlowParam && !shortCircuitParam && !opfParam && !harmonicParam && !economicParam\n" +
    "                    && attributeName !== 'cost_per_unit_by_currency'",
    "                const computationalParam = this.computationalParameters.find(p => p.id === attributeName);\n" +
    "                if (computationalParam) {\n" +
    "                    if (computationalParam.type === 'checkbox') {\n" +
    "                        computationalParam.value = attributeValue === 'true' || attributeValue === true;\n" +
    "                    } else {\n" +
    "                        computationalParam.value = attributeValue != null\n" +
    "                            ? String(attributeValue)\n" +
    "                            : computationalParam.value;\n" +
    "                    }\n" +
    "                }\n" +
    "                if (attributeName === 'cost_per_unit_by_currency') {\n" +
    "                    this.data[attributeName] = attributeValue;\n" +
    "                }\n" +
    "                if (!loadFlowParam && !shortCircuitParam && !opfParam && !harmonicParam && !economicParam\n" +
    "                    && !computationalParam\n" +
    "                    && attributeName !== 'cost_per_unit_by_currency'",
    'attribute apply');

fs.writeFileSync(P, s);
console.log('port applied:', s.split('\n').length, 'lines');
