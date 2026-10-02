// Port supportingFunctions.js, stage 14: switch placement.
//
// The vertical-SLD branch splits in two. On a radial import a switch that drops
// to a peer well below the bar sits on the drop itself, stacked sideways when
// several share a side; a short hop keeps the old stack-under-the-bar form.
// On a transmission import the switch is placed by distance to its peer, which
// keeps it on the connection instead of floating at a fixed fraction.
const fs = require('fs');
const P = 'src/main/webapp/js/electrisim/supportingFunctions.js';
let s = fs.readFileSync(P, 'utf8');
const NL = '\n';
const must = (c, m) => { if (!c) { console.error('ANCHOR FAILED: ' + m); process.exit(1); } };

const OLD = [
    '                    swCx = B.x + t * (Px - B.x);',
    '                    swCy = B.y + t * (Py - B.y);',
    '                    if (importPandapowerVerticalSld && Math.abs(B.x - Px) <= IMPORT_VERTICAL_COLLINEAR_X_EPS) {',
    '                        swCx = Px;',
    '                    }',
    '                    if (importPandapowerVerticalSld) {',
    "                        const sideKey = `${busVertex.id || ''}|${String(bus_name)}|${Py > B.y ? 'below' : 'above'}`;",
    '                        const stackIdx = verticalSwitchStackPerBusSide.get(sideKey) || 0;',
    '                        verticalSwitchStackPerBusSide.set(sideKey, stackIdx + 1);',
    '                        const sign = Py > B.y ? 1 : -1;',
    '                        const firstCenterOffset = swH / 2 + IMPORT_VERTICAL_SWITCH_GAP_FROM_BUS;',
    '                        const stackStep = swH + IMPORT_VERTICAL_SWITCH_STACK_PADDING;',
    '                        swCx = B.x;',
    '                        swCy = B.y + sign * (firstCenterOffset + stackIdx * stackStep);',
    '                    }',
].join(NL);

const NEW = [
    '                    swCx = B.x + t * (Px - B.x);',
    '                    swCy = B.y + t * (Py - B.y);',
    '',
    '                    if (importPandapowerVerticalSld && window._elxxxRadialImport) {',
    '                        if (Math.abs(B.x - Px) <= IMPORT_VERTICAL_COLLINEAR_X_EPS) swCx = Px;',
    "                        const sideKey = `${busVertex.id || ''}|${String(bus_name)}|${Py > B.y ? 'below' : 'above'}`;",
    '                        const stackIdx = verticalSwitchStackPerBusSide.get(sideKey) || 0;',
    '                        verticalSwitchStackPerBusSide.set(sideKey, stackIdx + 1);',
    '                        const sign = Py > B.y ? 1 : -1;',
    '                        const firstCenterOffset = swH / 2 + IMPORT_VERTICAL_SWITCH_GAP_FROM_BUS;',
    '                        const stackStep = swH + IMPORT_VERTICAL_SWITCH_STACK_PADDING;',
    '                        if (Math.abs(Py - B.y) > 40) {',
    '                            // Long drop: sit on the drop itself, fanned by stack index.',
    '                            swCx = Px;',
    '                            swCy = (B.y + Py) / 2 + sign * stackIdx * 16;',
    '                        } else {',
    '                            swCx = B.x;',
    '                            swCy = B.y + sign * (firstCenterOffset + stackIdx * stackStep);',
    '                        }',
    '                    } else if (importPandapowerVerticalSld) {',
    '                        const dx = Px - B.x;',
    '                        const dy = Py - B.y;',
    '                        const dist = Math.hypot(dx, dy);',
    '                        if (dist < 360 && Math.abs(dy) < 150 && Math.abs(dy) > 24) {',
    '                            swCx = Px;',
    '                            swCy = (B.y + Py) / 2;',
    '                        } else if (dist < 360) {',
    '                            swCx = (B.x + Px) / 2;',
    '                            swCy = (B.y + Py) / 2;',
    '                        } else {',
    '                            const frac = Math.min(0.42, t || 0.34);',
    '                            swCx = B.x + frac * dx;',
    '                            swCy = B.y + frac * dy;',
    '                        }',
    '                    }',
].join(NL);

must(s.includes(OLD), 'switch placement');
s = s.replace(OLD, NEW);

fs.writeFileSync(P, s);
console.log('stage 14 applied: switch placement');
