// Port supportingFunctions.js, stage 18: voltage-band spacing scales with size.
//
// The legacy voltage-band placement used one fixed level height and bus pitch,
// so a few hundred buses landed on top of each other. Past 40 buses both open
// up (480 / 400 instead of 200 / 180).
const fs = require('fs');
const P = 'src/main/webapp/js/electrisim/supportingFunctions.js';
let s = fs.readFileSync(P, 'utf8');
const NL = '\n';
const must = (c, m) => { if (!c) { console.error('ANCHOR FAILED: ' + m); process.exit(1); } };

const OLD = [
    '        const levelHeight = 200;',
    '        const busSpacing = 180;',
].join(NL);

const NEW = [
    '        // A large network needs the bands pulled apart, or the bars overlap.',
    '        const levelHeight = busCount > 40 ? 480 : 200;',
    '        const busSpacing = busCount > 40 ? 400 : 180;',
].join(NL);

must(s.includes(OLD), 'voltage band spacing');
s = s.replace(OLD, NEW);

fs.writeFileSync(P, s);
console.log('stage 18 applied: voltage-band spacing');
