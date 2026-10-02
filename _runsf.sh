# Rebuild supportingFunctions.js from the readable revision by replaying every
# stage script in order. Each stage asserts its anchor text, so a stage that no
# longer matches stops the run instead of silently doing nothing.
#
#   node _delta.js src/main/webapp/js/electrisim/supportingFunctions.js \
#       94cac9f3 bcb7ac32 <outdir>      # writes <outdir>/R0.readable.js + beautified revisions
#   bash _runsf.sh <outdir-parent>      # expects <outdir-parent>/sf/R0.readable.js
#
# Then check the result against the committed bytes:
#
#   node _delta.js --verify src/main/webapp/js/electrisim/supportingFunctions.js <outdir>
#   node _sflit.js      # literal-level diff vs HEAD
#   node _sfstruct.js   # statement-level diff vs HEAD, blind to mangled names
set -e
cp "$1/sf/R0.readable.js" src/main/webapp/js/electrisim/supportingFunctions.js
node _port_supportingFunctions.js >/dev/null || { echo "STAGE 1 FAILED"; exit 1; }
for i in $(seq 2 40); do
  if [ -f "_port_sf$i.js" ]; then
    node "_port_sf$i.js" >/dev/null || { echo "STAGE $i FAILED"; exit 1; }
  fi
done
echo "all stages applied"
