// Port supportingFunctions.js, stage 22: two fixes around missing bus rows.
//
// 1. The external grid sat a fixed 130 px from the bar's left edge and 80 px
//    above it. Radial and large imports size each bar individually, so the
//    offset now comes from the bar's own width, and the symbol moved 10 px
//    further up to clear the taller bus labels.
// 2. A switch on a line read the line's bus rows without checking they exist.
const fs = require('fs');
const P = 'src/main/webapp/js/electrisim/supportingFunctions.js';
let s = fs.readFileSync(P, 'utf8');
const NL = '\n';
const must = (c, m) => { if (!c) { console.error('ANCHOR FAILED: ' + m); process.exit(1); } };
const sub = (from, to, label) => { must(s.includes(from), label); s = s.replace(from, to); };

sub([
    '                const anchorX = busVertex.geometry.x + IMPORT_BUSBAR_W / 2;',
    '                const anchorY = busVertex.geometry.y - 80;',
].join(NL), [
    '                const anchorX = busVertex.geometry.x + busVertex.geometry.width / 2;',
    '                const anchorY = busVertex.geometry.y - 90;',
].join(NL), 'external grid anchor');

sub([
    '                            const [, , fbIdx, tbIdx] = lineRow;',
    '                            const fbNm = busData.data[fbIdx][0];',
    '                            const tbNm = busData.data[tbIdx][0];',
    '                            if (String(bus_name) === String(fbNm)) t = 0.26;',
    '                            else if (String(bus_name) === String(tbNm)) t = 0.26;',
].join(NL), [
    '                            const [, , fbIdx, tbIdx] = lineRow;',
    '                            // The line may name a bus the import did not place.',
    '                            if (!(busData.data[fbIdx] && busData.data[tbIdx])) return;',
    '                            const fbNm = busData.data[fbIdx][0];',
    '                            const tbNm = busData.data[tbIdx][0];',
    '                            if (String(bus_name) === String(fbNm)',
    '                                || String(bus_name) === String(tbNm)) t = 0.26;',
].join(NL), 'switch-on-line bus rows');

fs.writeFileSync(P, s);
console.log('stage 22 applied: external grid anchor + switch line bus guard');
