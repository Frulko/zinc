#!/bin/sh
# zinc:fs in an exported page (docs/targets/web.md, "Files"): the web-fs fixture reads a project file shipped by zinc.json targets.web.files, writes, appends, copies, renames,
# lists, stats and removes files, and finds them again after a reload (IndexedDB); a project file is read only. Its zinc.json requires fs: the export takes it without --force.
# targets.web.demo.samples: sampleData() gives the folder and the demo bar says the part shows sample data.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
export ZINC_BACKGROUND=1
python3 -I -c "import sys; sys.path.insert(0, 'tools'); from cdp import find_chrome; sys.exit(0 if find_chrome() else 1)" 2>/dev/null || { echo "web_fs: no Chrome: skipped"; exit 0; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
"$Z" export tests/fixtures/web-fs --target web -o "$tmp/site" >"$tmp/export" 2>&1 || { echo "web_fs: the export failed: $(cat "$tmp/export")"; exit 1; }
ls "$tmp/site/data" | grep -q '^seed\..*\.txt$' || { echo "web_fs: data/seed.txt was not shipped"; exit 1; }
timeout 90 python3 -I tools/web-browser-test "$tmp/site" --wait 3 --reload 3 >"$tmp/o" 2>&1 || { echo "web_fs: the page: $(cat "$tmp/o")"; exit 1; }
fail=0
grep -q '"errors": \[\]' "$tmp/o" || { echo "web_fs: errors in the page: $(cat "$tmp/o")"; fail=1; }
want='seed=hello from the project list=count.txt,log.txt,moved.txt,sub size=3 file=true dir=true'
grep -q "fs-run 1 $want runs=1 readonly=true moved=true sample=data" "$tmp/o" || { echo "web_fs: first load: $(cat "$tmp/o")"; fail=1; }
grep -q "fs-run 2 $want runs=2 readonly=true moved=true sample=data" "$tmp/o" || { echo "web_fs: the files did not survive a reload: $(cat "$tmp/o")"; fail=1; }
grep -q 'Web demo: the app runs in your browser. Spotify shows sample data.' "$tmp/o" || { echo "web_fs: no demo bar for the sample data: $(cat "$tmp/o")"; fail=1; }
exit $fail
