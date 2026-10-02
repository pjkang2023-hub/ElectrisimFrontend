// Compare top-level function bodies between two beautified files, ignoring
// terser's short-identifier choices, and list the ones that genuinely differ.
const fs = require('fs');

function functions(file) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    const out = new Map();
    let name = null, buf = [];
    for (const line of lines) {
        const m = line.match(/^(?:async )?function ([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/);
        if (m) {
            if (name) out.set(name, buf.join('\n'));
            name = m[1];
            buf = [line];
        } else if (name) {
            buf.push(line);
            if (line === '}') { out.set(name, buf.join('\n')); name = null; buf = []; }
        }
    }
    if (name) out.set(name, buf.join('\n'));
    return out;
}

// Collapse 1-2 char identifiers so renames do not register as differences.
const norm = (s) => s
    .replace(/\b[a-zA-Z_$][a-zA-Z0-9_$]?\b/g, '@')
    .replace(/\s+/g, ' ')
    .trim();

const [a, b] = process.argv.slice(2);
const A = functions(a), B = functions(b);

const missing = [], differing = [];
for (const [k, vb] of B) {
    const va = A.get(k);
    if (va === undefined) { missing.push([k, vb.split('\n').length]); continue; }
    if (norm(va) !== norm(vb)) differing.push([k, vb.split('\n').length - va.split('\n').length]);
}
console.log('functions missing from port:', missing.length);
missing.forEach(([k, n]) => console.log('  + ' + k + '  (' + n + ' lines)'));
console.log('\nfunctions differing:', differing.length);
differing.sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]));
differing.forEach(([k, d]) => console.log('  ~ ' + k + '  (' + (d >= 0 ? '+' : '') + d + ' lines)'));
