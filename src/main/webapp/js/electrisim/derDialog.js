// derDialog.js - the battery's, supercapacitor's, flywheel's, SOFC system's and
// PV array's dialogs: their fields from utils/derParameters.js, laid out as the
// DC load's dialog, which they extend.
import { LoadDcDialog } from './loadDcDialog.js';
import { DER_PARAMETERS, DER_DESCRIPTIONS, derDefaults } from './utils/derParameters.js';
import { profileOptions } from './utils/loadProfileLibrary.js';

class DerDialog extends LoadDcDialog {
    constructor(editorUi, kind) {
        super(editorUi);
        this.kind = kind;
        this.title = `${kind} Parameters`;
        this.data = { ...derDefaults(kind), cost_per_unit_by_currency: '0' };
        this.loadFlowParameters = DER_PARAMETERS[kind].map(p => ({
            ...p,
            // A profile field lists the library's profiles of its kind.
            options: p.profileKind ? profileOptions(this.graph, p.profileKind) : (p.options ? [...p.options] : undefined),
        }));
        this.shortCircuitParameters = [];
        this.opfParameters = [];
    }

    getDescription() {
        return `<strong>Configure ${this.kind} Parameters</strong><br>${DER_DESCRIPTIONS[this.kind]} `
            + (this.kind === 'PCS' || this.kind === 'Grounding Transformer' ? ''
                : 'Its pin goes to a DC bus, or to a PCS. Fields marked Ratings:, Cells: or Modules: are used with that sizing.');
    }
}

export class BatteryDialog extends DerDialog { constructor(ui) { super(ui, 'Battery'); } }
export class SupercapacitorDialog extends DerDialog { constructor(ui) { super(ui, 'Supercapacitor'); } }
export class FlywheelDialog extends DerDialog { constructor(ui) { super(ui, 'Flywheel'); } }
export class SofcDialog extends DerDialog { constructor(ui) { super(ui, 'SOFC'); } }
export class PvArrayDialog extends DerDialog { constructor(ui) { super(ui, 'PV Array'); } }
export class PcsDialog extends DerDialog { constructor(ui) { super(ui, 'PCS'); } }
export class GroundingTransformerDialog extends DerDialog { constructor(ui) { super(ui, 'Grounding Transformer'); } }

export const DER_DIALOGS = {
    Battery: BatteryDialog, Supercapacitor: SupercapacitorDialog, Flywheel: FlywheelDialog,
    SOFC: SofcDialog, 'PV Array': PvArrayDialog, PCS: PcsDialog, 'Grounding Transformer': GroundingTransformerDialog
};

if (typeof window !== 'undefined') {
    Object.assign(window, { BatteryDialog, SupercapacitorDialog, FlywheelDialog, SofcDialog, PvArrayDialog, PcsDialog,
        GroundingTransformerDialog });
}
