// Append the two new library-grid columns to transformerBaseDialog's columnDefs.
// Kept separate from the main port script purely so the anchor (which carries
// unusual trailing-comma formatting) is easy to read.
const fs = require('fs');
const P = 'src/main/webapp/js/electrisim/transformerBaseDialog.js';
let s = fs.readFileSync(P, 'utf8');
const NL = '\n';

const anchor =
    "    { " + NL +
    "      field: \"tap_changer_type\"," + NL +
    "      headerTooltip: \"tap changer type: 'Ratio' (default) or 'Symmetrical' - new in pandapower 3.0+\"," + NL +
    "      maxWidth: 150," + NL +
    "    }" + NL +
    "];";

if (!s.includes(anchor)) {
    console.error('ANCHOR FAILED: columnDefs tail');
    process.exit(1);
}

const replacement =
    "    { " + NL +
    "      field: \"tap_changer_type\"," + NL +
    "      headerTooltip: \"tap changer type: 'Ratio' (default) or 'Symmetrical' - new in pandapower 3.0+\"," + NL +
    "      maxWidth: 150," + NL +
    "    }," + NL +
    "    { " + NL +
    "      field: \"max_loading_percent\"," + NL +
    "      headerTooltip: \"OPF max loading % of sn_mva (pandapower); 0 = no limit\"," + NL +
    "      maxWidth: 160," + NL +
    "      valueParser: (params) => parseFloat(params.newValue) || 0" + NL +
    "    }," + NL +
    "    { " + NL +
    "      field: \"cost_per_unit_by_currency\"," + NL +
    "      headerTooltip: 'Cost per unit for Economic Analysis (JSON e.g. {\"EUR\":100})'," + NL +
    "      maxWidth: 200" + NL +
    "    }" + NL +
    "];";

s = s.replace(anchor, replacement);
fs.writeFileSync(P, s);
console.log('columnDefs extended');
