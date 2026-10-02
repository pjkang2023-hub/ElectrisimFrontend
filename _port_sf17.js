// Port supportingFunctions.js, stage 17: the import layout prompt.
//
// The question changed from "which direction do you want the drawing to run"
// to "what kind of system is this", because the answer now picks a whole
// layout engine rather than an axis: Transmission keeps the existing meshed
// placement, Radial draws a plant single-line, and Other takes the guess
// suggestImportSystem makes from the file itself (shown in the prompt so the
// choice is not blind). The horizontal option is gone.
const fs = require('fs');
const P = 'src/main/webapp/js/electrisim/supportingFunctions.js';
let s = fs.readFileSync(P, 'utf8');
const NL = '\n';
const must = (c, m) => { if (!c) { console.error('ANCHOR FAILED: ' + m); process.exit(1); } };

// --- 1. the prompt now needs the model to guess from ---------------------
must(s.includes('    const layout = await promptImportNetworkLayout();'), 'prompt call site');
s = s.replace('    const layout = await promptImportNetworkLayout();',
    '    const layout = await promptImportNetworkLayout(parsed);');

// --- 2. replace the whole function body ----------------------------------
const HEADER = 'function promptImportNetworkLayout() {';
const at = s.indexOf(HEADER);
must(at >= 0, 'promptImportNetworkLayout');
const END = NL + '}' + NL;
const end = s.indexOf(END, at);
must(end > at, 'promptImportNetworkLayout end');

const H3 = '<h3 style="margin:0 0 10px;font-size:18px;">What system are you importing?</h3>';
const PARA = '<p style="margin:0 0 14px;color:#444;line-height:1.45;font-size:14px;">'
    + 'Transmission keeps the existing meshed-network layout. '
    + 'Radial draws a plant single-line: grid at the top, feeders in columns.</p>';
const LIST_OPEN = '<ul style="margin:0 0 20px 18px;padding:0;color:#555;font-size:13px;line-height:1.5;">';
const LI_T = '<li><strong>Transmission</strong> — meshed grid (IEEE-style), unchanged.</li>';
const LI_R = '<li><strong>Radial</strong> — feeder / wind plant single-line.</li>';
const LI_O_HEAD = '<li><strong>Other</strong> — detect from the file (';
const LI_O_TAIL = ').</li></ul>';
const BUTTONS = '<div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;">'
    + '<button type="button" data-layout="cancel" style="padding:8px 14px;">Cancel</button>'
    + '<button type="button" data-layout="other" style="padding:8px 14px;">Other</button>'
    + '<button type="button" data-layout="radial" style="padding:8px 14px;">Radial</button>'
    + '<button type="button" data-layout="vertical" style="padding:8px 14px;">Transmission</button>'
    + '</div>';

const BODY = [
    'function promptImportNetworkLayout(model) {',
    '    return new Promise((resolve) => {',
    '        const guess = elSuggestSystem(model);',
    "        const overlay = document.createElement('div');",
    '        overlay.style.cssText =',
    "            'position:fixed;inset:0;background:rgba(0,0,0,0.35);z-index:100000;' +",
    "            'display:flex;align-items:center;justify-content:center;';",
    "        const box = document.createElement('div');",
    '        box.style.cssText =',
    "            'background:#fff;padding:24px 28px;border-radius:8px;' +",
    "            'box-shadow:0 4px 24px rgba(0,0,0,0.2);max-width:520px;' +",
    "            'font-family:Helvetica,Arial,sans-serif;';",
    "        const hint = guess === 'radial' ? 'radial plant' : 'transmission grid';",
    '        box.innerHTML =',
    "            '" + H3 + "' +",
    "            '" + PARA + "' +",
    "            '" + LIST_OPEN + "' +",
    "            '" + LI_T + "' +",
    "            '" + LI_R + "' +",
    "            '" + LI_O_HEAD + "' + hint + '" + LI_O_TAIL + "' +",
    "            '" + BUTTONS + "';",
    '        const finish = (layout) => {',
    '            if (overlay.parentNode) {',
    '                overlay.parentNode.removeChild(overlay);',
    '            }',
    '            resolve(layout);',
    '        };',
    "        box.addEventListener('click', (evt) => {",
    "            const btn = evt.target.closest('[data-layout]');",
    '            if (!btn) {',
    '                return;',
    '            }',
    "            const choice = btn.getAttribute('data-layout');",
    "            if (choice === 'cancel') {",
    '                finish(null);',
    "            } else if (choice === 'other') {",
    '                finish(guess);',
    "            } else if (choice === 'vertical' || choice === 'radial') {",
    '                finish(choice);',
    '            }',
    '        });',
    '        overlay.appendChild(box);',
    '        document.body.appendChild(overlay);',
    '    });',
].join(NL);

s = s.slice(0, at) + BODY + s.slice(end);

fs.writeFileSync(P, s);
console.log('stage 17 applied: import layout prompt');
