// Port supportingFunctions.js, stage 8: the remaining elRadialLabel call sites.
//
// On a radial import the pandapower element name is replaced by the friendly
// name from the sidecar, with the original kept in pp_element_name. The
// transformer site went in with stage 7; these are the other four. Each call
// goes immediately after the element's configure*Attributes call, before the
// edge down to the busbar is inserted.
const fs = require('fs');
const P = 'src/main/webapp/js/electrisim/supportingFunctions.js';
let s = fs.readFileSync(P, 'utf8');
const NL = '\n';
const must = (c, m) => { if (!c) { console.error('ANCHOR FAILED: ' + m); process.exit(1); } };

// Closing line of a configure*Attributes({ ... }) call at the usual depth.
const CLOSE = NL + '                })';

for (const fn of [
    'configureExternalGridAttributes',
    'configureGeneratorAttributes',
    'configureStaticGeneratorAttributes',
    'configureStorageAttributes',
]) {
    const head = fn + '(grafka, vertex, {';
    const at = s.indexOf(head);
    must(at >= 0, fn);
    const close = s.indexOf(CLOSE, at);
    must(close > at, fn + ' closing brace');
    let eol = close + CLOSE.length;
    if (s[eol] === ';') eol += 1;
    must(s[eol] === NL, fn + ' end of closing line');
    s = s.slice(0, eol + 1) +
        '                elRadialLabel(grafka, vertex, name);' + NL +
        s.slice(eol + 1);
}

fs.writeFileSync(P, s);
console.log('stage 8 applied: 4 elRadialLabel call sites');
