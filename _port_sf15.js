// Port supportingFunctions.js, stage 15: vertical-SLD switch edge pins.
//
// Both switch edges used to dock at the middle of the busbar and enter the
// switch on a side face. They now dock at a pin on the bar chosen from the
// switch's own X (importBusbarPinXFromPeerX) and enter the switch on the face
// turned toward the bar, so several switches on one bar no longer pile their
// edges onto the same point. endArrow=none drops the arrowhead these
// connection lines never should have had.
//
// The branch also splits by layout: a transmission import leaves the edge
// straight (the two pins are collinear, so routing would only add a bracket),
// while a radial import routes it orthogonally because the drop can need a jog.
const fs = require('fs');
const P = 'src/main/webapp/js/electrisim/supportingFunctions.js';
let s = fs.readFileSync(P, 'utf8');
const must = (c, m) => { if (!c) { console.error('ANCHOR FAILED: ' + m); process.exit(1); } };

// Replace the body between a function's opening line and the start of its
// horizontal-SLD tail, which both functions begin the same way.
function swapVerticalBranch(header, tail, replacement) {
    const h = s.indexOf(header);
    must(h >= 0, 'header: ' + header);
    const from = h + header.length;
    const t = s.indexOf(tail, from);
    must(t >= 0, 'tail after: ' + header);
    s = s.slice(0, from) + replacement + s.slice(t);
}

const TAIL = '\n    const bcy = importBusbarElectricalY(busVertex);'
    + '\n    const swCy = swVertex.geometry.y + swVertex.geometry.height / 2;';

swapVerticalBranch(
    'function importBusToSwitchEdgeStyle(busVertex, swVertex, verticalSld) {\n',
    TAIL,
    [
        '    if (verticalSld && !window._elxxxRadialImport) {',
        '        const busY = importBusbarElectricalY(busVertex);',
        '        const swY = swVertex.geometry.y + swVertex.geometry.height / 2;',
        '        const swX = swVertex.geometry.x + swVertex.geometry.width / 2;',
        '        const below = swY >= busY;',
        '        const pin = importBusbarPinXFromPeerX(busVertex, swX);',
        '        return (',
        "            'edgeStyle=none;rounded=0;orthogonalLoop=0;jettySize=0;html=1;endArrow=none;' +",
        '            `exitX=${pin};exitY=0.5;exitDx=0;exitDy=0;exitPerimeter=0;` +',
        '            `entryX=0.5;entryY=${below ? 0 : 1};entryDx=0;entryDy=0;entryPerimeter=0;shapeELXXX=NotEditableLine`',
        '        );',
        '    }',
        '    if (verticalSld) {',
        '        const busY = importBusbarElectricalY(busVertex);',
        '        const swY = swVertex.geometry.y + swVertex.geometry.height / 2;',
        '        const swX = swVertex.geometry.x + swVertex.geometry.width / 2;',
        '        const below = swY >= busY;',
        '        const pin = importBusbarPinXFromPeerX(busVertex, swX);',
        '        return (',
        "            'edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=0;html=1;endArrow=none;' +",
        '            `exitX=${pin};exitY=0.5;exitDx=0;exitDy=0;exitPerimeter=0;` +',
        '            `entryX=0.5;entryY=${below ? 0 : 1};entryDx=0;entryDy=0;entryPerimeter=0;shapeELXXX=NotEditableLine`',
        '        );',
        '    }',
    ].join('\n'));

swapVerticalBranch(
    'function importSwitchToPeerEdgeStyle(swVertex, peerCell, busVertex, verticalSld) {\n',
    TAIL,
    [
        '    if (verticalSld && !window._elxxxRadialImport) {',
        '        const swY = swVertex.geometry.y + swVertex.geometry.height / 2;',
        '        const swX = swVertex.geometry.x + swVertex.geometry.width / 2;',
        '        const peerY = peerCell.geometry.y + (peerCell.geometry.height || 0) / 2;',
        '        const peerBelow = peerY >= swY;',
        '        let entryX = 0.5;',
        '        let entryY = peerBelow ? 0 : 1;',
        '        // A wide peer is another busbar, so enter it along the bar, not at a corner.',
        '        if (peerCell.geometry && peerCell.geometry.width > 80) {',
        '            entryX = importBusbarPinXFromPeerX(peerCell, swX);',
        '            entryY = 0.5;',
        '        }',
        '        return (',
        "            'edgeStyle=none;rounded=0;orthogonalLoop=0;jettySize=0;html=1;endArrow=none;' +",
        '            `exitX=0.5;exitY=${peerBelow ? 1 : 0};exitDx=0;exitDy=0;exitPerimeter=0;` +',
        '            `entryX=${entryX};entryY=${entryY};entryDx=0;entryDy=0;entryPerimeter=0;shapeELXXX=NotEditableLine`',
        '        );',
        '    }',
        '    if (verticalSld) {',
        '        const swY = swVertex.geometry.y + swVertex.geometry.height / 2;',
        '        const peerY = peerCell.geometry.y + peerCell.geometry.height / 2;',
        '        const peerBelow = peerY >= swY;',
        '        return (',
        "            'edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=0;html=1;endArrow=none;' +",
        '            `exitX=0.5;exitY=${peerBelow ? 1 : 0};exitDx=0;exitDy=0;exitPerimeter=0;` +',
        '            `entryX=0.5;entryY=0.5;entryDx=0;entryDy=0;entryPerimeter=0;shapeELXXX=NotEditableLine`',
        '        );',
        '    }',
    ].join('\n'));

fs.writeFileSync(P, s);
console.log('stage 15 applied: vertical-SLD switch edge pins');
