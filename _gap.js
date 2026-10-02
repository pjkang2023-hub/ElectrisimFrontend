// What does HEAD have that the ported file does not? Methods and string literals.
const { minify } = require('terser');
const fs = require('fs');

const [mineMin, headBeaut, outBeaut] = process.argv.slice(2);

function literals(text) {
    const out = new Set();
    const re = /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;
    let m;
    while ((m = re.exec(text))) {
        const v = m[1] ?? m[2] ?? m[3];
        if (v && v.length > 2) out.add(v);
    }
    return out;
}

const methods = (text) => new Set(
    (text.match(/^ {4}[a-zA-Z_][a-zA-Z0-9_]*\(/gm) || []).map((x) => x.trim().replace('(', ''))
);

(async () => {
    const src = fs.readFileSync(mineMin, 'utf8');
    const beaut = (await minify(src, { compress: false, mangle: false, format: { beautify: true }, module: true })).code;
    fs.writeFileSync(outBeaut, beaut);
    const head = fs.readFileSync(headBeaut, 'utf8');

    const mMine = methods(beaut), mHead = methods(head);
    const missingMethods = [...mHead].filter((x) => !mMine.has(x));
    console.log('methods in HEAD missing from port:', missingMethods.length, missingMethods.join(', ') || '(none)');

    const lMine = literals(beaut), lHead = literals(head);
    const missing = [...lHead].filter((x) => !lMine.has(x));
    const extra = [...lMine].filter((x) => !lHead.has(x));
    console.log('\nstrings in HEAD missing from port:', missing.length);
    missing.slice(0, 30).forEach((x) => console.log('  + ' + x.slice(0, 130)));
    console.log('\nstrings in port not in HEAD:', extra.length);
    extra.slice(0, 20).forEach((x) => console.log('  - ' + x.slice(0, 130)));
})();
