// Compare method bodies between two beautified files, ignoring terser's
// single-letter identifier choices, and list the ones that genuinely differ.
const fs = require('fs');

function methods(file) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    const out = new Map();
    let name = null, buf = [];
    for (const line of lines) {
        const m = line.match(/^ {4}([a-zA-Z_][a-zA-Z0-9_]*)\(/);
        if (m) {
            if (name) out.set(name, buf.join('\n'));
            name = m[1];
            buf = [line];
        } else if (name) {
            buf.push(line);
            if (line === '    }') { out.set(name, buf.join('\n')); name = null; buf = []; }
        }
    }
    if (name) out.set(name, buf.join('\n'));
    return out;
}

// Collapse every 1-2 char identifier to a placeholder so renames do not register.
const norm = (s) => s
    .replace(/\b[a-zA-Z_$][a-zA-Z0-9_$]?\b/g, '@')
    .replace(/\s+/g, ' ')
    .trim();

const [a, b] = process.argv.slice(2);
const A = methods(a), B = methods(b);

const differing = [];
for (const [k, vb] of B) {
    const va = A.get(k);
    if (va === undefined) { differing.push([k, 'MISSING from port']); continue; }
    if (norm(va) !== norm(vb)) differing.push([k, 'differs']);
}
console.log('methods differing:', differing.length);
differing.forEach(([k, why]) => console.log('  ' + k + '  (' + why + ')'));
