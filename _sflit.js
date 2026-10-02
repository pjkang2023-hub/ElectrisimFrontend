// Compare the literals of minify(ported) against the committed HEAD, so a
// mangler rename cascade cannot hide a real semantic difference behind it.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { minify } = require('terser');

const FILE = 'src/main/webapp/js/electrisim/supportingFunctions.js';
const OPT = {
    module: true,
    compress: { passes: 3 },
    mangle: { keep_fnames: true, keep_classnames: true },
    format: { comments: false },
};

// Every string literal, template chunk and numeric literal, as a multiset.
function literals(src) {
    const out = [];
    const re = /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|`((?:[^`\\]|\\.)*)`|\b\d+(?:\.\d+)?(?:e[-+]?\d+)?\b/gi;
    let m;
    while ((m = re.exec(src))) out.push(m[0]);
    return out;
}

function counts(list) {
    const m = new Map();
    for (const x of list) m.set(x, (m.get(x) || 0) + 1);
    return m;
}

(async () => {
    const mine = (await minify(fs.readFileSync(FILE, 'utf8'), OPT)).code;
    const head = execFileSync('git', ['show', `HEAD:${FILE.replace(/\\/g, '/')}`], {
        cwd: process.cwd(),
        maxBuffer: 1 << 28,
        encoding: 'utf8',
    });
    const reHead = (await minify(head, OPT)).code;

    const a = counts(literals(mine));
    const b = counts(literals(reHead));
    const keys = [...new Set([...a.keys(), ...b.keys()])].sort();

    let n = 0;
    for (const k of keys) {
        const x = a.get(k) || 0;
        const y = b.get(k) || 0;
        if (x === y) continue;
        n++;
        const tag = x === 0 ? 'HEAD only' : y === 0 ? 'mine only ' : `count ${x} vs ${y}`;
        console.log(`${tag}  ${k}`);
    }
    console.log(`\n${n} literal differences`);
})();
