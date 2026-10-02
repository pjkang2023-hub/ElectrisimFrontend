// Port loadFlow.js, stage 2: the payload flags, the line/switch bus fix, and the
// power-flow animation hooks (commit 6bf974df "animation").
const fs = require('fs');
const P = 'src/main/webapp/js/electrisim/loadFlow.js';
let s = fs.readFileSync(P, 'utf8');
const NL = '\n';
const must = (c, m) => { if (!c) { console.error('ANCHOR FAILED: ' + m); process.exit(1); } };
const sub = (from, to, label) => { must(s.includes(from), label); s = s.replace(from, to); };

// --- 6. the two dialog checkboxes travel with the payload -------------------
sub("                exportPdfReport: exportPdfReportValue,  // One-click PDF engineering report" + NL,
    "                exportPdfReport: exportPdfReportValue,  // One-click PDF engineering report" + NL +
    "                animatePowerFlow: !!isObjectFormat && coerceBool(a.animatePowerFlow)," + NL +
    "                colourDiagram: !!isObjectFormat && coerceBool(a.colourDiagram)," + NL,
    'payload flags');

// --- 7. a line switch must sit on one of its line's own two buses -----------
sub("        // Bus–Switch–injecting element (gen, load, shunt, …): aux bus + element on aux + native bus–bus switch" + NL +
    "        (function expandInjectStubSwitches() {",
    "        // A switch declared on a line (et='l') has to reference one of that line's" + NL +
    "        // own endpoints. Diagram edits can leave it pointing at a third bus, which" + NL +
    "        // pandapower rejects; repair it from the line's busFrom/busTo instead." + NL +
    "        (function reconcileLineSwitchBuses(lines, switches) {" + NL +
    "            const byKey = new Map();" + NL +
    "            (lines || []).forEach((line) => {" + NL +
    "                ['name', 'id', 'userFriendlyName'].forEach((k) => {" + NL +
    "                    if (line && line[k] != null && line[k] !== '') byKey.set(String(line[k]), line);" + NL +
    "                });" + NL +
    "            });" + NL +
    "            (switches || []).forEach((sw) => {" + NL +
    "                const et = String(sw.et || '').toLowerCase();" + NL +
    "                if (et !== 'l' && et !== 'line') return;" + NL +
    "                const line = byKey.get(String(sw.element || ''));" + NL +
    "                if (!line) return;" + NL +
    "                const a = line.busFrom ? String(line.busFrom) : '';" + NL +
    "                const b = line.busTo ? String(line.busTo) : '';" + NL +
    "                const bus = sw.bus ? String(sw.bus) : '';" + NL +
    "                if (a && b && a !== b && (bus === a || bus === b)) return;" + NL +
    "                if ((!b || a === b) && bus && bus !== a) {" + NL +
    "                    if (a) line.busTo = bus; else line.busFrom = bus;" + NL +
    "                    return;" + NL +
    "                }" + NL +
    "                if (a && bus !== a && bus !== b) sw.bus = a;" + NL +
    "            });" + NL +
    "        })(componentArrays.line, componentArrays.switch);" + NL + NL +
    "        // Bus–Switch–injecting element (gen, load, shunt, …): aux bus + element on aux + native bus–bus switch" + NL +
    "        (function expandInjectStubSwitches() {",
    'line switch reconcile');

// --- 8. stop any running animation before repainting the diagram -----------
sub("            console.log('Starting result visualization...');" + NL +
    "            " + NL +
    "            if (typeof window !== 'undefined' && typeof window.clearFlowArrows === 'function') {",
    "            console.log('Starting result visualization...');" + NL +
    "            if (typeof window !== 'undefined' && typeof window.stopLoadFlowPowerAnimation === 'function') {" + NL +
    "                window.stopLoadFlowPowerAnimation();" + NL +
    "            }" + NL +
    "            if (typeof window.stopLoadFlowDiagramColour === 'function') {" + NL +
    "                window.stopLoadFlowDiagramColour();" + NL +
    "            }" + NL +
    "            " + NL +
    "            if (typeof window !== 'undefined' && typeof window.clearFlowArrows === 'function') {",
    'stop hooks');

// --- 9. start animation / colouring once the results are painted -----------
sub("            if (typeof window !== 'undefined' && typeof window.showFlowConventionLegend === 'function') {" + NL +
    "                window.showFlowConventionLegend(b);" + NL +
    "            }" + NL,
    "            if (typeof window !== 'undefined' && typeof window.showFlowConventionLegend === 'function') {" + NL +
    "                window.showFlowConventionLegend(b);" + NL +
    "            }" + NL + NL +
    "            // Driven by the Load Flow dialog's animatePowerFlow / colourDiagram" + NL +
    "            // checkboxes. Never let a rendering failure block the results." + NL +
    "            try {" + NL +
    "                const __anim = !!(obj && obj[0] && obj[0].animatePowerFlow);" + NL +
    "                if (typeof window.startLoadFlowPowerAnimation === 'function') {" + NL +
    "                    window.startLoadFlowPowerAnimation(b, dataJson, __anim);" + NL +
    "                }" + NL +
    "                if (typeof window.startLoadFlowDiagramColour === 'function') {" + NL +
    "                    window.startLoadFlowDiagramColour(b, dataJson, !!(obj && obj[0] && obj[0].colourDiagram));" + NL +
    "                }" + NL +
    "            } catch (animErr) {" + NL +
    "                console.warn('Load flow animation skipped:', animErr);" + NL +
    "            }" + NL,
    'animation start');

fs.writeFileSync(P, s);
console.log('port stage 2 applied:', s.split(NL).length, 'lines');
