// Port supportingFunctions.js, stage 11: route edges around machine symbols.
//
// After everything is placed, any edge whose vertical run passes through a
// generator or static generator is detoured around it. Without this the feeder
// drops on an imported plant diagram cross straight through the machine
// symbols.
const fs = require('fs');
const P = 'src/main/webapp/js/electrisim/supportingFunctions.js';
let s = fs.readFileSync(P, 'utf8');
const NL = '\n';
const must = (c, m) => { if (!c) { console.error('ANCHOR FAILED: ' + m); process.exit(1); } };

const ANCHOR = [
    '        } catch (error) {',
    "            console.error('Error during vertex insertion:', error);",
].join(NL);
must(s.includes(ANCHOR), 'end of vertex insertion try');

const BLOCK = [
    "        if (typeof mxPoint !== 'undefined') {",
    '            // Boxes to avoid, padded a little beyond the symbol itself.',
    '            const machineBoxes = [];',
    '            grafka.getChildCells(parent, true, false).forEach((cell) => {',
    '                if (!cell || cell.edge || !cell.geometry || !cell.style',
    "                    || !/shapeELXXX=Generator|shapeELXXX=Static Generator/.test(cell.style)) return;",
    '                const g = cell.geometry;',
    '                machineBoxes.push({ cell, x: g.x - 14, y: g.y - 14, w: g.width + 28, h: g.height + 28 });',
    '            });',
    '',
    '            if (machineBoxes.length) {',
    '                grafka.getChildCells(parent, false, true).forEach((edge) => {',
    '                    // An edge that belongs to a machine is meant to touch it.',
    "                    if (!edge || !edge.geometry || /NotEditableLine/.test(edge.style || '')",
    '                        || machineBoxes.some((b) => edge.source === b.cell || edge.target === b.cell)) return;',
    '',
    "                    const style = edge.style || '';",
    '                    const frac = (key, fallback) => {',
    "                        const m = new RegExp(key + '=([0-9.]+)').exec(style);",
    '                        return m ? parseFloat(m[1]) : fallback;',
    '                    };',
    '                    const pointAt = (cell, fx, fy) => (cell && cell.geometry',
    '                        ? { x: cell.geometry.x + cell.geometry.width * fx, y: cell.geometry.y + cell.geometry.height * fy }',
    '                        : null);',
    "                    const src = pointAt(edge.source, frac('exitX', 0.5), frac('exitY', 0.5));",
    "                    const dst = pointAt(edge.target, frac('entryX', 0.5), frac('entryY', 0.5));",
    '                    if (!src || !dst) return;',
    '',
    '                    const pts = [src].concat(edge.geometry.points || [], [dst]);',
    '                    const out = [src];',
    '                    let changed = false;',
    '                    for (let i = 0; i < pts.length - 1; i++) {',
    '                        const a = pts[i];',
    '                        const b = pts[i + 1];',
    '                        // Only vertical runs are detoured.',
    '                        if (Math.abs(a.x - b.x) < 4) {',
    '                            const x = (a.x + b.x) / 2;',
    '                            const top = Math.min(a.y, b.y);',
    '                            const bottom = Math.max(a.y, b.y);',
    '                            const hit = machineBoxes.find((box) =>',
    '                                x > box.x && x < box.x + box.w && bottom > box.y && top < box.y + box.h);',
    '                            if (hit) {',
    '                                const sideX = x - hit.x < hit.w / 2 ? hit.x - 16 : hit.x + hit.w + 16;',
    '                                const aboveY = hit.y - 12;',
    '                                const belowY = hit.y + hit.h + 12;',
    '                                if (a.y <= b.y) {',
    '                                    out.push(new mxPoint(x, aboveY), new mxPoint(sideX, aboveY),',
    '                                        new mxPoint(sideX, belowY), new mxPoint(x, belowY));',
    '                                } else {',
    '                                    out.push(new mxPoint(x, belowY), new mxPoint(sideX, belowY),',
    '                                        new mxPoint(sideX, aboveY), new mxPoint(x, aboveY));',
    '                                }',
    '                                changed = true;',
    '                            }',
    '                        }',
    '                        out.push(b);',
    '                    }',
    '',
    '                    if (changed) {',
    '                        const geo = edge.geometry.clone();',
    '                        geo.points = out.slice(1, -1);',
    '                        grafka.getModel().setGeometry(edge, geo);',
    "                        const next = String(edge.style || '').replace(/edgeStyle=[^;]*/, 'edgeStyle=orthogonalEdgeStyle');",
    "                        grafka.getModel().setStyle(edge, /edgeStyle=/.test(next) ? next : 'edgeStyle=orthogonalEdgeStyle;' + next);",
    '                    }',
    '                });',
    '            }',
    '        }',
    '',
].join(NL);

s = s.replace(ANCHOR, BLOCK + ANCHOR);

fs.writeFileSync(P, s);
console.log('stage 11 applied: machine-avoidance edge routing');
