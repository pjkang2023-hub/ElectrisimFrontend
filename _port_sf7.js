// Port supportingFunctions.js, stage 7: bus and transformer vertex creation.
//
// Buses: width and height now follow the layout (radial gives per-bus widths,
// large imports get narrow 56/110 px bars 2 px tall instead of the 260x12
// default), radial buses are stroked green, and the pandapower bus name is kept
// in pp_bus_name so findVertexByBusId can still match after a friendly name is
// applied to `name`.
//
// Transformers: orientation is chosen from the actual bus geometry rather than
// the importPandapowerVerticalSld flag, with a 180 degree rotation when HV sits
// below (or right of) LV, and the resolved bus cell ids are recorded in
// pp_hv_bus / pp_lv_bus for loadFlow's resolver to fall back on.
const fs = require('fs');
const P = 'src/main/webapp/js/electrisim/supportingFunctions.js';
let s = fs.readFileSync(P, 'utf8');
const NL = '\n';
const must = (c, m) => { if (!c) { console.error('ANCHOR FAILED: ' + m); process.exit(1); } };

// --- 1. bus vertices -----------------------------------------------------
const BUS_OLD = [
    '                // Svg busbar stretched to cell; points= restore edge docking along the bar (Graph.js)',
    "                const busStyle = vertexStyleImportedBusbar('Bus');",
    '',
    '                const vertex = grafka.insertVertex(',
    '                    parent,',
    '                    null,',
    '                    ``,',
    '                    vertexX,',
    '                    vertexY,',
    '                    IMPORT_BUSBAR_W,',
    '                    IMPORT_BUSBAR_H,',
    '                    busStyle',
    '                );',
    '',
    '                configureBusAttributes(grafka, vertex, {',
    '                    name: `${name}`,',
    '                    vn_kv: `${vn_kv}`',
    '                });',
].join(NL);

const BUS_NEW = [
    '                // Svg busbar stretched to cell; points= restore edge docking along the bar (Graph.js)',
    '                // Radial layouts size each bar individually; big imports use thin bars.',
    '                const busW = (busPositions[index] && busPositions[index].w)',
    '                    || (busCount > 4000 ? 56 : busCount > 800 ? 110 : IMPORT_BUSBAR_W);',
    '                const busH = busCount > 40 ? 2 : IMPORT_BUSBAR_H;',
    "                const busStyle = vertexStyleImportedBusbar('Bus')",
    "                    + (window._elxxxRadialImport ? ';strokeColor=#1B7A1B;strokeWidth=3' : '');",
    '',
    '                const vertex = grafka.insertVertex(',
    '                    parent,',
    '                    null,',
    '                    ``,',
    '                    vertexX,',
    '                    vertexY,',
    '                    busW,',
    '                    busH,',
    '                    busStyle',
    '                );',
    '',
    '                const friendlyBusName = window._elxxxRadialImport',
    '                    && window._elxxxUfn && window._elxxxUfn[name];',
    '                configureBusAttributes(grafka, vertex, {',
    '                    name: friendlyBusName ? String(friendlyBusName) : `${name}`,',
    '                    vn_kv: `${vn_kv}`',
    '                });',
    '',
    '                // Keep the pandapower name even when a friendly name replaces it,',
    '                // so later lookups by bus name still resolve.',
    '                if (window._elxxxRadialImport && vertex.value && vertex.value.setAttribute) {',
    "                    vertex.value.setAttribute('pp_bus_name', String(name));",
    '                    if (friendlyBusName) {',
    "                        vertex.value.setAttribute('name', String(friendlyBusName));",
    "                        vertex.value.setAttribute('userFriendlyName', String(friendlyBusName));",
    '                    }',
    '                }',
].join(NL);

must(s.includes(BUS_OLD), 'bus vertex creation');
s = s.replace(BUS_OLD, BUS_NEW);

// --- 2. transformer orientation -----------------------------------------
const TR_OLD = [
    '                    // Calculate the midpoint between the two buses',
    '                    const hvX = hvBusVertex.geometry.x;',
    '                    const hvY = hvBusVertex.geometry.y;',
    '                    const lvX = lvBusVertex.geometry.x;',
    '                    const lvY = lvBusVertex.geometry.y;',
    '',
    '                    const hvCx = hvX + IMPORT_BUSBAR_W / 2;',
    '                    const lvCx = lvX + IMPORT_BUSBAR_W / 2;',
    '',
    '                    // Place transformer between busbar centers (palette SVG)',
    '                    const vertexCenterX = (hvCx + lvCx) / 2;',
    '                    const vertexCenterY = (hvY + lvY) / 2;',
    '',
    "                    let trafoStyle = vertexStyleFromElectrisimSymbol('sym-transformer', 'Transformer');",
    "                    let [trafoW, trafoH] = vertexSizeFromElectrisimSymbol('sym-transformer', 40, 60);",
    '                    if (importPandapowerVerticalSld) {',
    '                        // Dedicated vertical SVG (HV top / LV bottom) — larger windings, no rotation.',
    "                        trafoStyle = vertexStyleFromElectrisimSymbol('sym-transformer-v', 'Transformer');",
    "                        [trafoW, trafoH] = vertexSizeFromElectrisimSymbol('sym-transformer-v', 72, 108);",
    '                    }',
].join(NL);

const TR_NEW = [
    '                    // Orientation follows the buses themselves: stack vertically when',
    '                    // they are separated mostly in y, and rotate when HV is the far side.',
    '                    const hvCx = hvBusVertex.geometry.x + hvBusVertex.geometry.width / 2;',
    '                    const hvCy = hvBusVertex.geometry.y + hvBusVertex.geometry.height / 2;',
    '                    const lvCx = lvBusVertex.geometry.x + lvBusVertex.geometry.width / 2;',
    '                    const lvCy = lvBusVertex.geometry.y + lvBusVertex.geometry.height / 2;',
    '                    const stackVertically = Math.abs(lvCy - hvCy) >= Math.abs(lvCx - hvCx);',
    '',
    '                    let trafoStyle;',
    '                    let trafoW;',
    '                    let trafoH;',
    '                    if (stackVertically) {',
    "                        trafoStyle = vertexStyleFromElectrisimSymbol('sym-transformer-v', 'Transformer');",
    "                        [trafoW, trafoH] = vertexSizeFromElectrisimSymbol('sym-transformer-v', 72, 108);",
    "                        if (hvCy > lvCy) trafoStyle += ';rotation=180';",
    '                    } else {',
    "                        trafoStyle = vertexStyleFromElectrisimSymbol('sym-transformer', 'Transformer');",
    "                        [trafoW, trafoH] = vertexSizeFromElectrisimSymbol('sym-transformer', 40, 60);",
    "                        if (hvCx > lvCx) trafoStyle += ';rotation=180';",
    '                    }',
    '',
    '                    // Place transformer between busbar centers (palette SVG)',
    '                    const vertexCenterX = (hvCx + lvCx) / 2;',
    '                    const vertexCenterY = (hvCy + lvCy) / 2;',
].join(NL);

must(s.includes(TR_OLD), 'transformer orientation');
s = s.replace(TR_OLD, TR_NEW);

// --- 3. radial label + the resolved bus ids -----------------------------
const AFTER_ATTRS = [
    '                    const switchedBuses = trafoSwitchBusSets.twoW[index];',
].join(NL);
must(s.includes(AFTER_ATTRS), 'trafoSwitchBusSets');
s = s.replace(AFTER_ATTRS, [
    '                    elRadialLabel(grafka, vertex, name);',
    '',
    '                    // loadFlow falls back to these when the edge walk cannot',
    '                    // resolve the two windings.',
    '                    if (vertex.value && vertex.value.setAttribute) {',
    "                        const hvId = hvBusVertex && hvBusVertex.mxObjectId ? String(hvBusVertex.mxObjectId).replace(/#/g, '_') : '';",
    "                        const lvId = lvBusVertex && lvBusVertex.mxObjectId ? String(lvBusVertex.mxObjectId).replace(/#/g, '_') : '';",
    "                        if (hvId) vertex.value.setAttribute('pp_hv_bus', hvId);",
    "                        if (lvId) vertex.value.setAttribute('pp_lv_bus', lvId);",
    '                    }',
    '',
    AFTER_ATTRS,
].join(NL));

fs.writeFileSync(P, s);
console.log('stage 7 applied:', s.split(NL).length, 'lines');
