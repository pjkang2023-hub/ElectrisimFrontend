// Structural comparison of minify(ported) against minify(HEAD).
//
// A single extra or missing declaration makes terser reallocate its short names,
// so a byte diff of minified output reports rename noise instead of the change.
// This blanks every mangled short name to "#" and then compares statements as
// multisets, which is insensitive to both renaming and to code moving, so what
// is reported is only what one side has and the other does not.
const fs = require('fs');
const { execFileSync } = require('child_process');
const { minify } = require('terser');

const FILE = 'src/main/webapp/js/electrisim/supportingFunctions.js';
const OPT = {
    compress: { dead_code: true, drop_console: false, drop_debugger: true,
                keep_classnames: true, keep_fnames: true, passes: 2 },
    mangle: { keep_classnames: true, keep_fnames: true },
    format: { comments: false, beautify: false },
    module: true,
};

// Mangled names are one or two characters and never follow a dot; anything
// longer, and every property name, terser kept as written.
const blank = (code) => code.replace(
    /(?<![A-Za-z0-9_$.])[A-Za-z_$][A-Za-z0-9_$]?(?![A-Za-z0-9_$])/g,
    (m) => (/^(if|in|do|of)$/.test(m) ? m : '#'));

// Statements, with string and template literals held out so a ";" inside one
// does not split it.
function statements(code) {
    const lits = [];
    const masked = code.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g,
        (m) => `\u0000${lits.push(m) - 1}\u0000`);
    return masked.split(/[;{}]/)
        .map((t) => t.replace(/\u0000(\d+)\u0000/g, (_, i) => lits[i]).trim())
        .filter((t) => t.length > 3);
}

const counts = (list) => {
    const m = new Map();
    for (const x of list) m.set(x, (m.get(x) || 0) + 1);
    return m;
};

(async () => {
    const mine = (await minify(fs.readFileSync(FILE, 'utf8'), OPT)).code;
    const head = (await minify(execFileSync('git', ['show', `HEAD:${FILE}`],
        { maxBuffer: 1 << 28, encoding: 'utf8' }), OPT)).code;

    const a = counts(statements(blank(mine)));
    const b = counts(statements(blank(head)));
    const keys = [...new Set([...a.keys(), ...b.keys()])].sort();

    let n = 0;
    for (const k of keys) {
        const x = a.get(k) || 0;
        const y = b.get(k) || 0;
        if (x === y) continue;
        n++;
        const tag = x === 0 ? 'HEAD only ' : y === 0 ? 'mine only ' : `${x} vs ${y}   `;
        console.log(`${tag} ${k}`);
    }
    console.log(`\n${n} statement difference(s)`);
})();
