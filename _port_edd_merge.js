// Final rule of the EditDataDialog port: applyLineValues merges the dialog's
// attributes instead of wiping every attribute first.
//
// Kept separate from the main script only because the old block is long and the
// anchor reads better on its own.
const fs = require('fs');
const P = 'src/main/webapp/js/electrisim/dialogs/EditDataDialog.js';
let s = fs.readFileSync(P, 'utf8');
const NL = '\n';

const OLD = [
    "            // Clear existing attributes by removing them individually",
    "            if (this.cell.value.attributes) {",
    "                console.log(`Clearing ${this.cell.value.attributes.length} existing attributes`);",
    "                ",
    "                // Get a copy of attribute names to avoid modifying while iterating",
    "                const attributeNames = [];",
    "                for (let i = 0; i < this.cell.value.attributes.length; i++) {",
    "                    attributeNames.push(this.cell.value.attributes[i].name);",
    "                }",
    "                ",
    "                // Remove each attribute",
    "                attributeNames.forEach(name => {",
    "                    console.log(`  Removing attribute: ${name}`);",
    "                    this.cell.value.removeAttribute(name);",
    "                });",
    "            }",
    "            ",
    "            // Add new attributes from values",
    "            console.log('Adding new attributes:');",
].join(NL);

const NEW = [
    "            // Merge, do not clear: wiping every attribute first also destroyed",
    "            // XML attributes this dialog does not manage.",
    "            console.log('Merging dialog attributes (preserving other XML attributes):');",
].join(NL);

if (!s.includes(OLD)) {
    console.error('ANCHOR FAILED: applyLineValues clear-attributes block');
    process.exit(1);
}
s = s.replace(OLD, NEW);
fs.writeFileSync(P, s);
console.log('applyLineValues now merges attributes');
