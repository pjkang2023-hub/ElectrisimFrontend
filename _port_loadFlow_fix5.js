// Replaces rule 5 of the loadFlow port: getLineBusEndpointsForPayload is
// rewritten wholesale rather than prepended to, because HEAD drops the old
// "first two edges" block entirely - the new id sweep supersedes it.
const fs = require('fs');
const P = '_port_loadFlow.js';
let s = fs.readFileSync(P, 'utf8');

const start = s.indexOf('// --- 5. line endpoints');
if (start < 0) { console.error('rule 5 not found'); process.exit(1); }
const end = s.indexOf("'line endpoints');", start) + "'line endpoints');".length;

const replacement = [
    "// --- 5. line endpoints: sweep every incident edge for a bus id. The old",
    "//     source/target pair plus \"first two edges\" fallback missed lines whose",
    "//     endpoints sit behind a switch, and could pick the same bus twice.",
    "const LINE_FN_OLD = [",
    "    \"    if (cell.source && cell.target) {\",",
    "    \"        const busFrom = resolveGraphEndpointToBusSemantic(cell.source, cell, model);\",",
    "    \"        const busTo = resolveGraphEndpointToBusSemantic(cell.target, cell, model);\",",
    "    \"        if (busFrom && busTo) return { busFrom, busTo };\",",
    "    \"    }\",",
    "    \"    const edges = edgesOfVertex(cell, model);\",",
    "    \"    if (edges.length >= 2) {\",",
    "    \"        const o0 = edges[0].source === cell ? edges[0].target : edges[0].source;\",",
    "    \"        const o1 = edges[1].source === cell ? edges[1].target : edges[1].source;\",",
    "    \"        const busFrom = resolveGraphEndpointToBusSemantic(o0, cell, model);\",",
    "    \"        const busTo = resolveGraphEndpointToBusSemantic(o1, cell, model);\",",
    "    \"        if (busFrom && busTo) return { busFrom, busTo };\",",
    "    \"    }\",",
    "].join(NL);",
    "",
    "const LINE_FN_NEW = [",
    "    \"    const ids = [];\",",
    "    \"    const seenIds = new Set();\",",
    "    \"    const add = (id) => { if (id && !seenIds.has(id)) { seenIds.add(id); ids.push(id); } };\",",
    "    \"    const other = (ed) => {\",",
    "    \"        if (!ed) return null;\",",
    "    \"        if (ed.source === cell || (ed.source && cell && ed.source.id === cell.id)) return ed.target;\",",
    "    \"        if (ed.target === cell || (ed.target && cell && ed.target.id === cell.id)) return ed.source;\",",
    "    \"        return ed.target && ed.target !== cell ? ed.target : ed.source;\",",
    "    \"    };\",",
    "    \"    const edges = edgesOfVertex(cell, model);\",",
    "    \"    for (let i = 0; i < edges.length; i++) {\",",
    "    \"        add(resolveGraphEndpointToBusSemantic(other(edges[i]), edges[i], model));\",",
    "    \"    }\",",
    "    \"    if (cell.source && cell.target) {\",",
    "    \"        add(resolveGraphEndpointToBusSemantic(cell.source, cell, model));\",",
    "    \"        add(resolveGraphEndpointToBusSemantic(cell.target, cell, model));\",",
    "    \"    }\",",
    "    \"    if (ids.length >= 2) return { busFrom: ids[0], busTo: ids[1] };\",",
    "    \"    if (ids.length === 1) return { busFrom: ids[0], busTo: ids[0] };\",",
    "].join(NL);",
    "",
    "sub(LINE_FN_OLD, LINE_FN_NEW, 'line endpoints');",
].join('\n');

s = s.slice(0, start) + replacement + s.slice(end);
fs.writeFileSync(P, s);
console.log('rule 5 rewritten');
