/**
 * Analyse what a file's post-minification deltas actually changed.
 *
 * Usage: node _delta.js <path> <readableRev> <firstMinRev> [outDir]
 *        node _delta.js --verify <path> <outDir>
 *
 * Diffing minified code directly is mostly noise: adding a few lines makes terser
 * reallocate its short names, so a hundred lines "change" when ten did. Two things
 * cut through that, and this does both:
 *
 *   1. String/template literals survive mangling, so diffing the literal SETS
 *      isolates added behaviour exactly.
 *   2. Re-minifying the readable source and diffing against the committed minified
 *      file separates "what the commit changed" from "what minification changed".
 *      It also reveals commits that edited AND minified in one go - those changes
 *      exist only in minified form and a commit-log check alone will miss them.
 *
 * --verify re-minifies the current working-tree file and compares to HEAD. An exact
 * match proves the port is complete. A consistent alpha-rename (terser's tie-break
 * between equally-used short names) is proof-equivalent and reported as such.
 */

const { minify } = require('terser');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const OPT = {
    compress: { dead_code: true, drop_console: false, drop_debugger: true,
                keep_classnames: true, keep_fnames: true, passes: 2 },
    mangle: { keep_classnames: true, keep_fnames: true },
    format: { comments: false, beautify: false },
    sourceMap: { filename: undefined, url: undefined },
    module: true,
};
const BEAUT = { compress: false, mangle: false, format: { beautify: true }, module: true };

const show = (rev, p) => execFileSync('git', ['show', `${rev}:${p}`], { maxBuffer: 1 << 28 }).toString();
const norm = (t) => t.replace(/\r\n/g, '\n').trim();

function literals(text) {
    const out = [];
    const re = /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;
    let m;
    while ((m = re.exec(text))) {
        const v = m[1] ?? m[2] ?? m[3];
        if (v && v.length > 2) out.push(v);
    }
    return out;
}

function literalDelta(before, after, label) {
    const ca = {}, cb = {};
    for (const x of literals(before)) ca[x] = (ca[x] || 0) + 1;
    for (const x of literals(after)) cb[x] = (cb[x] || 0) + 1;
    const added = Object.keys(cb).filter((k) => !ca[k]);
    const removed = Object.keys(ca).filter((k) => !cb[k]);
    console.log(`\n--- ${label} ---`);
    console.log(`  added strings  (${added.length}):`);
    added.forEach((s) => console.log('    + ' + s.slice(0, 150)));
    if (removed.length) {
        console.log(`  removed strings (${removed.length}):`);
        removed.forEach((s) => console.log('    - ' + s.slice(0, 150)));
    }
    return { added, removed };
}

/** True when `a` and `b` differ only by a consistent renaming of short identifiers. */
function alphaRenameOnly(a, b) {
    if (a.length !== b.length) return false;
    const idc = /[A-Za-z_$]/;
    const map = new Map(), rmap = new Map();
    for (let i = 0; i < a.length; i++) {
        if (a[i] === b[i]) continue;
        if (!idc.test(a[i]) || !idc.test(b[i])) return false;
        if (map.has(a[i]) && map.get(a[i]) !== b[i]) return false;
        if (rmap.has(b[i]) && rmap.get(b[i]) !== a[i]) return false;
        map.set(a[i], b[i]); rmap.set(b[i], a[i]);
    }
    return { pairs: [...map.entries()] };
}

async function analyse(file, readableRev, firstMinRev, outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    const R0 = show(readableRev, file);
    const M0 = norm(show(firstMinRev, file));
    const M1 = norm(show('HEAD', file));
    const M0p = norm((await minify(R0, OPT)).code);

    fs.writeFileSync(path.join(outDir, 'R0.readable.js'), R0);
    for (const [n, t] of [['M0', M0], ['M1', M1], ['M0prime', M0p]]) {
        fs.writeFileSync(path.join(outDir, `${n}.min.js`), t);
        fs.writeFileSync(path.join(outDir, `${n}.beaut.js`), (await minify(t, BEAUT)).code);
    }

    console.log(`\n=== ${path.basename(file)} ===`);
    console.log(`  readable @${readableRev}: ${R0.length} bytes, ${R0.split('\n').length} lines`);
    console.log(`  minified @${firstMinRev}: ${M0.length} bytes`);
    console.log(`  minified @HEAD        : ${M1.length} bytes`);
    const sameSource = M0p === M0;
    console.log(`\n  minify(readable) == first minified commit? ${sameSource ? 'YES' : 'NO'}`);
    if (!sameSource) {
        console.log(`  -> ${firstMinRev} edited the source AND minified it (${M0p.length} vs ${M0.length} bytes).`);
        console.log('     That edit exists only in minified form. DELTA A below.');
    }

    const bt = (n) => fs.readFileSync(path.join(outDir, `${n}.beaut.js`), 'utf8');
    if (!sameSource) literalDelta(bt('M0prime'), bt('M0'), `DELTA A  (inside ${firstMinRev})`);
    literalDelta(bt('M0'), bt('M1'), `DELTA B  (${firstMinRev} -> HEAD)`);
}

async function verify(file, outDir) {
    const current = fs.readFileSync(file, 'utf8');
    const mine = norm((await minify(current, OPT)).code);
    const head = norm(show('HEAD', file));
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'R1.minified.js'), mine);

    console.log(`\n=== verify ${path.basename(file)} ===`);
    if (mine === head) {
        console.log(`  EXACT MATCH - minify(ported) == HEAD (${mine.length} bytes)`);
        return true;
    }
    console.log(`  byte length  ported: ${mine.length}   HEAD: ${head.length}`);
    const alpha = alphaRenameOnly(mine, head);
    if (alpha) {
        console.log('  ALPHA-RENAME ONLY - semantically identical to HEAD.');
        console.log('    terser tie-break between equally-used names: ' +
                    alpha.pairs.map(([x, y]) => `${x}<->${y}`).join(', '));
        return true;
    }
    // Byte-match is impossible when the committed file was hand-edited while
    // minified: those edits are uncompressed, so terser output can never equal
    // them. Normalise BOTH through terser again - that compresses the hand-written
    // parts the same way - and compare the fixed points.
    const reMine = norm((await minify(mine, OPT)).code);
    const reHead = norm((await minify(head, OPT)).code);
    const headIsGenerated = reHead === head;
    if (!headIsGenerated) {
        console.log(`  NOTE: HEAD is not a terser fixed point (${head.length} -> ${reHead.length} bytes).`);
        console.log('        It contains code hand-written into the minified file, so an');
        console.log('        exact byte match is not achievable. Comparing fixed points instead.');
    }
    if (reMine === reHead) {
        console.log(`  EQUIVALENT - minify(minify(ported)) == minify(HEAD) (${reMine.length} bytes)`);
        return true;
    }

    let i = 0;
    while (i < Math.min(reMine.length, reHead.length) && reMine[i] === reHead[i]) i++;
    console.log(`  MISMATCH at byte ${i} of the normalised forms`);
    console.log('    ported: ...' + reMine.slice(Math.max(0, i - 110), i + 110));
    console.log('    HEAD  : ...' + reHead.slice(Math.max(0, i - 110), i + 110));
    return false;
}

(async () => {
    const args = process.argv.slice(2);
    if (args[0] === '--verify') {
        const ok = await verify(args[1], args[2] || '.delta-out');
        process.exit(ok ? 0 : 1);
    }
    const [file, readableRev, firstMinRev, outDir = '.delta-out'] = args;
    if (!file || !readableRev || !firstMinRev) {
        console.error('usage: node _delta.js <path> <readableRev> <firstMinRev> [outDir]');
        console.error('       node _delta.js --verify <path> [outDir]');
        process.exit(2);
    }
    await analyse(file, readableRev, firstMinRev, outDir);
})();
