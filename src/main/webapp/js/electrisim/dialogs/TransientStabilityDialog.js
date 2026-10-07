// TransientStabilityDialog.js - ANDES time-domain simulation parameters
import { Dialog } from '../Dialog.js';

function parseCellStyle(style) {
    if (!style) return {};
    return Object.fromEntries(
        style.split(';').filter(Boolean).map((pair) => {
            const i = pair.indexOf('=');
            return i >= 0 ? [pair.slice(0, i), pair.slice(i + 1)] : [pair, ''];
        })
    );
}

function getCellAttr(cell, attrName) {
    if (!cell?.value?.attributes) return null;
    for (let i = 0; i < cell.value.attributes.length; i++) {
        if (cell.value.attributes[i].nodeName === attrName) {
            return cell.value.attributes[i].nodeValue;
        }
    }
    return null;
}

function technicalNameOf(cell) {
    return cell.mxObjectId?.replace('#', '_') || String(cell.id);
}

/** The bus a device is drawn on. */
function connectedBusName(cell) {
    for (const edge of cell.edges || []) {
        const other = edge.source === cell ? edge.target : edge.source;
        const style = other?.getStyle?.() || '';
        if (style.includes('shapeELXXX=Bus')) return technicalNameOf(other);
    }
    return '';
}

function collectBusesGeneratorsLines(graph) {
    const buses = [{ value: '', label: '(none)' }];
    const lines = [{ value: '', label: '(none)' }];
    const generators = [{ value: '', label: '(none — no trip)' }];
    let generatorBus = '';
    if (!graph?.getModel) return { buses, lines, generators, generatorBus };
    const cells = graph.getModel().getChildCells(graph.getDefaultParent(), true, true) || [];
    for (const cell of cells) {
        const styleStr = cell.getStyle?.() || '';
        if (styleStr.includes('Result')) continue;
        const style = parseCellStyle(styleStr);
        const componentType = style.shapeELXXX || '';
        const technicalName = cell.mxObjectId?.replace('#', '_') || String(cell.id);
        const label = getCellAttr(cell, 'name') || technicalName;
        if (componentType === 'Bus' || componentType === 'Busbar' || styleStr.includes('shapeELXXX=Bus')) {
            buses.push({ value: technicalName, label });
        } else if (componentType === 'Line' || styleStr.includes('shapeELXXX=Line')) {
            lines.push({ value: technicalName, label });
        } else if (componentType === 'Switch' || styleStr.includes('shapeELXXX=Switch')) {
            // A breaker's outage is its line's or transformer's.
            lines.push({ value: technicalName, label: /breaker|tie/i.test(label) ? label : `${label} (breaker)` });
        } else if (componentType === 'External Grid' || styleStr.includes('shapeELXXX=External Grid')) {
            // The utility lost: what it held islands, or runs on its own machines and grid-forming PCS.
            lines.push({ value: technicalName, label: `${label} (utility trip)` });
        } else if (componentType === 'Generator' || styleStr.includes('shapeELXXX=Generator')) {
            generators.push({ value: technicalName, label });
            generatorBus = generatorBus || connectedBusName(cell);
        }
    }
    return { buses, lines, generators, generatorBus };
}

export class TransientStabilityDialog extends Dialog {
    constructor(editorUi) {
        super('Transient Stability (ANDES TDS)', 'Run Simulation');
        this.requiresSubscription = true;
        this.subscriptionFeatureName = 'Transient Stability (ANDES)';
        this.useStudyModalShell = true;
        this.studyModalBoxWidth = 720;
        this.ui = editorUi || window.App?.main?.editor?.editorUi;
        this.graph = this.ui?.editor?.graph;
        const { buses, lines, generators, generatorBus } = collectBusesGeneratorsLines(this.graph);
        // A fault at the first generator's terminals by default. The second
        // bus in the list was the default: often the External Grid's, which
        // ANDES holds at its set voltage, so the fault did nothing.
        const defaultBus = buses.some((b) => b.value === generatorBus) ? generatorBus : '';

        this.parameters = [
            {
                id: 'frequency',
                label: 'System Frequency (Hz)',
                type: 'number',
                value: '50',
                min: '1',
                step: '1'
            },
            {
                id: 'sn_mva',
                label: 'System Base (MVA)',
                type: 'number',
                value: '100',
                min: '1',
                step: '1'
            },
            {
                id: 'tf',
                label: 'Simulation End Time tf (s)',
                type: 'number',
                value: '10',
                min: '0.1',
                step: '0.1'
            },
            {
                id: 'tstep',
                label: 'Time Step Hint (s, 0 = auto)',
                type: 'number',
                value: '0',
                min: '0',
                step: '0.001'
            },
            {
                id: 'fault_bus',
                label: 'Fault Bus',
                type: 'select',
                options: buses.map((b) => ({
                    value: b.value,
                    label: b.label,
                    default: b.value === defaultBus
                }))
            },
            {
                id: 'fault_tf',
                label: 'Fault Apply Time (s)',
                type: 'number',
                value: '1.0',
                min: '0',
                step: '0.01'
            },
            {
                id: 'fault_tc',
                label: 'Fault Clear Time (s)',
                type: 'number',
                value: '1.1',
                min: '0',
                step: '0.01'
            },
            {
                id: 'toggle_line',
                label: 'Outage: line, breaker or External Grid (optional)',
                type: 'select',
                options: lines.map((l, i) => ({
                    value: l.value,
                    label: l.label,
                    default: i === 0
                }))
            },
            {
                id: 'toggle_t',
                label: 'Outage Time (s)',
                type: 'number',
                value: '2.0',
                min: '0',
                step: '0.01'
            },
            {
                id: 'toggle_gen',
                label: 'Generator trip (optional)',
                type: 'select',
                options: generators.map((g, i) => ({
                    value: g.value,
                    label: g.label,
                    default: i === 0
                }))
            },
            {
                id: 'toggle_gen_t',
                label: 'Generator trip time (s)',
                type: 'number',
                value: '2.0',
                min: '0',
                step: '0.01'
            },
            {
                id: 'poi_bus',
                label: 'POI bus (voltage / ride-through check)',
                type: 'select',
                options: buses.map((b) => ({
                    value: b.value,
                    label: b.label,
                    default: b.value === defaultBus
                }))
            }
        ];
    }

    /**
     * Values keyed by parameter id. The base Dialog returns them as an array,
     * which the caller read by name - so every field fell back to its
     * default and nothing entered here reached the study.
     */
    getFormValues() {
        const values = super.getFormValues();
        const ids = this.parameters.filter((p) => p.type !== 'section').map((p) => p.id);
        return Object.fromEntries(ids.map((id, i) => [id, values[i]]));
    }

    getDescription() {
        return 'Time-domain transient stability using ANDES (RMS). Optional generator trip and POI voltage ride-through check when Computational load is enabled on a Load. Not EMT — sub-cycle sag requires future ParaEMT/dpsim integration.';
    }
}

if (typeof window !== 'undefined') {
    window.TransientStabilityDialog = TransientStabilityDialog;
}

export default TransientStabilityDialog;
