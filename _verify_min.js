// Does minifying the last-readable source reproduce the current HEAD bytes?
// If yes, the readable source is the exact preimage and restoring it is lossless.
const { minify } = require('terser');
const { execFileSync } = require('child_process');
const TERSER_OPTIONS = {
  compress: { dead_code:true, drop_console:false, drop_debugger:true,
              keep_classnames:true, keep_fnames:true, passes:2 },
  mangle: { keep_classnames:true, keep_fnames:true },
  format: { comments:false, beautify:false },
  sourceMap: { filename: undefined, url: undefined },
  module: true
};
const show = (rev, path) => execFileSync('git', ['show', `${rev}:${path}`], {maxBuffer: 1<<28}).toString();
const targets = JSON.parse(process.argv[2]);
(async () => {
  for (const [file, readableRev] of targets) {
    let verdict;
    try {
      const src = show(readableRev, file);
      const head = show('HEAD', file).replace(/\r\n/g,'\n').trim();
      const out = (await minify(src, TERSER_OPTIONS)).code.replace(/\r\n/g,'\n').trim();
      verdict = out === head ? 'LOSSLESS (re-minify == HEAD)'
              : `MISMATCH (${out.length} vs ${head.length} bytes)`;
    } catch (e) { verdict = 'ERROR ' + e.message.slice(0,60); }
    console.log(`  ${file.split('/').pop().padEnd(32)} ${verdict}`);
  }
})();
