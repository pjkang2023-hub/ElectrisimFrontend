/**
 * Restore readable sources after an in-place minify.
 *
 * `scripts/minify-js.js` overwrites each source file with its minified output.
 * That is fine for a deploy, but if the result is committed the readable source
 * is gone from HEAD and every later edit has to be made against mangled code.
 * That happened once already: 25 files were committed minified, and only 15
 * could be recovered losslessly.
 *
 * Run this after a deploy build, before committing:
 *     npm run restore-sources
 *
 * It restores every file in FILES_TO_MINIFY from git HEAD, so it only works
 * while HEAD holds the readable version - which is the invariant to protect.
 *
 * Usage: node scripts/restore-sources.js [--check]
 *   --check  report which files are currently minified and exit 1 if any are,
 *            without changing anything. Suitable for a pre-commit hook or CI.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const { FILES_TO_MINIFY } = require('./minify-js.js');

// A line this long is machine-generated, not something anyone typed.
const MINIFIED_LINE_THRESHOLD = 2000;

function longestLine(file) {
    const text = fs.readFileSync(file, 'utf8');
    let longest = 0;
    for (const line of text.split('\n')) {
        if (line.length > longest) longest = line.length;
    }
    return longest;
}

function isMinified(file) {
    return fs.existsSync(file) && longestLine(file) > MINIFIED_LINE_THRESHOLD;
}

function main() {
    const checkOnly = process.argv.includes('--check');
    const repoRoot = path.resolve(__dirname, '..');
    const minified = FILES_TO_MINIFY.filter((f) => isMinified(path.join(repoRoot, f)));

    if (minified.length === 0) {
        console.log('✅ All sources are readable.');
        return;
    }

    if (checkOnly) {
        console.error(`❌ ${minified.length} source file(s) are minified in the working tree:`);
        minified.forEach((f) => console.error(`   ${f}`));
        console.error('\nRun `npm run restore-sources` before committing.');
        process.exit(1);
    }

    let restored = 0;
    for (const file of minified) {
        try {
            execFileSync('git', ['checkout', 'HEAD', '--', file], { cwd: repoRoot });
            const still = isMinified(path.join(repoRoot, file));
            if (still) {
                console.error(`⚠️  ${file} is minified in HEAD too - cannot restore from git.`);
            } else {
                console.log(`✅ restored ${file}`);
                restored++;
            }
        } catch (err) {
            console.error(`❌ ${file}: ${err.message.split('\n')[0]}`);
        }
    }
    console.log(`\nRestored ${restored}/${minified.length} file(s).`);
    if (restored < minified.length) process.exit(1);
}

if (require.main === module) main();

module.exports = { isMinified, MINIFIED_LINE_THRESHOLD };
