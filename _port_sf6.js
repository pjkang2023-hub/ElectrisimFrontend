// Port supportingFunctions.js, stage 6: the voltage-group fallback layout.
//
// A voltage level with hundreds of buses used to be drawn as one enormously wide
// row. It now wraps onto a grid whose column count is derived from the level's
// aspect ratio, and rows accumulate down the canvas via rowBase.
//
// The transformer x-averaging pass is also skipped above 40 buses - on a large
// import it pulled whole columns together and undid the grid.
const fs = require('fs');
const P = 'src/main/webapp/js/electrisim/supportingFunctions.js';
let s = fs.readFileSync(P, 'utf8');
const NL = '\n';
const must = (c, m) => { if (!c) { console.error('ANCHOR FAILED: ' + m); process.exit(1); } };

const OLD = [
    '            sortedVoltages.forEach((voltage, levelIndex) => {',
    '                const busesAtLevel = voltageGroups[voltage];',
    '                const levelY = startY + levelIndex * levelHeight;',
    '',
    '                const totalWidth = (busesAtLevel.length - 1) * busSpacing;',
    '                const levelStartX = startX - totalWidth / 2;',
    '',
    '                busesAtLevel.forEach((busInfo, busIndex) => {',
    '                    const busX = levelStartX + busIndex * busSpacing;',
    '                    busPositions[busInfo.index] = {',
    '                        x: busX,',
    '                        y: levelY,',
    '                    };',
    '                });',
    '            });',
    '',
    '            transformerData.data.forEach((trafo) => {',
].join(NL);

const NEW = [
    '            let rowBase = 0;',
    '            sortedVoltages.forEach((voltage) => {',
    '                const busesAtLevel = voltageGroups[voltage];',
    '                // Wrap a wide level onto several rows rather than one long line.',
    '                const cols = busesAtLevel.length > 10',
    '                    ? Math.max(4, Math.round(Math.sqrt(busesAtLevel.length * levelHeight / busSpacing)))',
    '                    : busesAtLevel.length;',
    '                const rows = Math.ceil(busesAtLevel.length / Math.max(1, cols));',
    '',
    '                const totalWidth = (Math.min(cols, busesAtLevel.length) - 1) * busSpacing;',
    '                const levelStartX = startX - totalWidth / 2;',
    '',
    '                busesAtLevel.forEach((busInfo, busIndex) => {',
    '                    const col = busIndex % cols;',
    '                    const row = Math.floor(busIndex / cols);',
    '                    busPositions[busInfo.index] = {',
    '                        x: levelStartX + col * busSpacing,',
    '                        y: startY + (rowBase + row) * levelHeight,',
    '                    };',
    '                });',
    '',
    '                rowBase += rows;',
    '            });',
    '',
    '            // Pulling transformer ends onto a shared x only helps a small diagram;',
    '                                                                                  ',
    '            if (busCount <= 40) transformerData.data.forEach((trafo) => {',
].join(NL);

must(s.includes(OLD), 'voltage-group level layout');
s = s.replace(OLD, NEW);

// Tidy the placeholder comment line left above the guard.
s = s.replace(
    "            // Pulling transformer ends onto a shared x only helps a small diagram;" + NL +
    "                                                                                  " + NL,
    "            // Pulling transformer ends onto a shared x only helps a small diagram;" + NL +
    "            // on a large one it collapses the grid built above." + NL);

fs.writeFileSync(P, s);
console.log('stage 6 applied:', s.split(NL).length, 'lines');
