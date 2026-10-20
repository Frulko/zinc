#!/bin/sh
# A fresh clone builds (ZN-331): every file of the repository that cmake reads at configure time (CMakeFiles/Makefile.cmake) or that a compiled
# source includes (compiler_depend.make of every target) is tracked by git, so no .gitignore rule (build*/ once hid SDL3's build_config) can leave it
# out of a clone. Reads the build directory of this checkout (ZINC_BUILD, default build); skipped (77) when it has not been built.
cd "$(dirname "$0")/../.." || exit 2
b=${ZINC_BUILD:-build}
[ -f "$b/CMakeFiles/Makefile.cmake" ] || { echo "build_inputs_tracked: no configured $b"; exit 77; }
root=$(git rev-parse --show-toplevel) || exit 2
python3 - "$root" "$b" <<'PY'
import os, re, subprocess, sys
root, build = sys.argv[1], os.path.abspath(sys.argv[2])
tracked = set(subprocess.run(['git', '-C', root, 'ls-files', '-z'], capture_output=True, text=True, check=True).stdout.split('\0'))
paths = set()
for d, _, files in os.walk(build):
    for f in files:
        if f in ('Makefile.cmake', 'compiler_depend.make'):
            for p in re.findall(r'(/[^\s"\\]+)', open(os.path.join(d, f), errors='replace').read()): paths.add(p.rstrip(':'))
missing = []
for p in sorted(paths):
    if not p.startswith(root + '/') or p.startswith(build + '/') or '/CMakeFiles/' in p or not os.path.isfile(p): continue
    rel = os.path.relpath(p, root)
    if rel not in tracked: missing.append(rel)
if missing:
    print(f'build_inputs_tracked: {len(missing)} build input(s) not tracked by git (a clone would miss them): ' + ' '.join(missing[:8])); sys.exit(1)
print(f'build_inputs_tracked: ok ({len([p for p in paths if p.startswith(root + "/")])} inputs)')
PY
