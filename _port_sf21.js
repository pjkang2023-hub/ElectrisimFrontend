// Port supportingFunctions.js, stage 21: lines skip missing buses.
//
// A line row can reference a bus index the import never placed, and reading
// [0] off the missing row threw, aborting the whole insertion from that line on.
const fs = require('fs');
const P = 'src/main/webapp/js/electrisim/supportingFunctions.js';
let s = fs.readFileSync(P, 'utf8');
const NL = '\n';
const must = (c, m) => { if (!c) { console.error('ANCHOR FAILED: ' + m); process.exit(1); } };

const OLD = [
    '                    parallel, type, in_service] = line;',
    '',
    '                // Get bus data for from and to buses',
].join(NL);

const NEW = [
    '                    parallel, type, in_service] = line;',
    '',
    '                // A line can name a bus the import did not place.',
    '                if (!(busData.data[from_bus] && busData.data[to_bus])) return;',
    '',
    '                // Get bus data for from and to buses',
].join(NL);

must(s.includes(OLD), 'line loop head');
s = s.replace(OLD, NEW);

fs.writeFileSync(P, s);
console.log('stage 21 applied: lines skip missing buses');
