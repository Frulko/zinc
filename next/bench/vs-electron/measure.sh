#!/bin/bash
# The same small app made with Zinc, Electron and Tauri (ZN-713): builds the three shipped .app bundles and measures their size,
# the time from launch to the first frame and the resident memory 10 s after launch.
#
# usage: measure.sh [build] [measure]        (both when none is given)
#   ZINC=<zinc binary>   default ../../build/zinc
#   RUNS=<n>             launches per app, default 5
#   APPS="zinc electron tauri"
# Needs node and npm; Tauri needs cargo, taken from $ZINC_HOME/bench-tools (rustup with RUSTUP_HOME and CARGO_HOME there) or the PATH,
# and is skipped with a message without it. Nothing is installed outside this directory.
#
# How it measures:
# - size: "installed" is `du -sk` of the .app; "download" is the .app zipped with ditto, the same container for the three.
# - start: the bundle is started with `open -n`, as a double click does, and the time from there to its `first-frame` line on stdout
#   is taken (2 ms polling). Each app prints it at the start of its second frame, so the first one was presented. `open` also makes
#   the app the responsible process of its helpers, which a direct exec from a terminal does not.
# - memory: at 10 s, the sum of the RSS (`ps`) of the main process, its descendants (Electron's helpers) and the processes it is
#   responsible for (the XPC services of WebKit that Tauri's web view starts are children of launchd: they are found with
#   responsibility_get_pid_responsible_for_pid, what Activity Monitor groups by). A sum of RSS counts the pages shared between the
#   processes of one app once per process.
# Each run is printed with the 1-minute load average and the CPU speed limit of `pmset -g therm`: a time taken under load or below 100
# is to be retaken on a quiet machine.
set -euo pipefail
cd "$(dirname "$0")"
HERE=$PWD
ZINC=${ZINC:-$HERE/../../build/zinc}
TOOLS=${ZINC_HOME:-$HOME/.zinc}/bench-tools
if [ -x "$TOOLS/cargo/bin/cargo" ]; then export RUSTUP_HOME=$TOOLS/rustup CARGO_HOME=$TOOLS/cargo PATH=$TOOLS/cargo/bin:$PATH; fi
APPS=${APPS:-zinc electron tauri}
[ $# -eq 0 ] && set -- build measure

app_path() {
  case $1 in
    zinc) echo "$HERE/zinc/dist/bench-list-macos/bench-list.app" ;;
    electron) echo "$HERE"/electron/dist/*/"Bench List.app" ;;
    tauri) echo "$HERE/tauri/src-tauri/target/release/bundle/macos/Bench List.app" ;;
  esac
}

build() {
  mkdir -p zinc/assets
  cp image.png zinc/assets/; cp image.png electron/; cp image.png tauri/src/
  for a in $APPS; do
    echo "== build $a" >&2
    case $a in
      zinc) (cd zinc && "$ZINC" export --target macos) ;;
      electron) (cd electron && npm install --no-fund --no-audit && npm run package) ;;
      tauri)
        if ! command -v cargo >/dev/null; then echo "tauri: no cargo (rustup into $TOOLS, see the header): skipped" >&2; continue; fi
        # one rustc per physical core, as tools/build does: other trees build on this machine
        (cd tauri && npm install --no-fund --no-audit && npm run icons && CARGO_BUILD_JOBS=$(sysctl -n hw.physicalcpu) npm run build) ;;
    esac
  done
}

measure() {
  for a in $APPS; do
    app=$(app_path "$a")
    if [ ! -d "$app" ]; then echo "$a: not built" >&2; continue; fi
    zip=$(mktemp -u).zip
    ditto -c -k --keepParent "$app" "$zip"
    exe="$app/Contents/MacOS/$(/usr/libexec/PlistBuddy -c 'Print CFBundleExecutable' "$app/Contents/Info.plist")"
    echo "$a: download $(($(stat -f %z "$zip") / 1024)) KB (zip), installed $(du -sk "$app" | cut -f1) KB"
    rm -f "$zip"
    python3 - "$a" "$app" "$exe" "${RUNS:-5}" <<'PY'
import ctypes, os, re, signal, statistics, subprocess, sys, tempfile, time
name, app, exe, runs = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
libc = ctypes.CDLL(None)

def family(root):
    """root, its descendants and the processes it is responsible for: {pid: rss_kb}"""
    rows = [tuple(map(int, l.split())) for l in subprocess.check_output(["ps", "-axo", "pid=,ppid=,rss="], text=True).splitlines()]
    mine = {root}
    for _ in range(8):  # ponytail: a fixed number of passes instead of a tree walk; helpers are one or two levels deep
        mine |= {pid for pid, ppid, _ in rows if ppid in mine}
    mine |= {pid for pid, _, _ in rows if libc.responsibility_get_pid_responsible_for_pid(pid) == root}
    return {pid: rss for pid, _, rss in rows if pid in mine}

def main_pid():
    for l in subprocess.check_output(["ps", "-axo", "pid=,comm="], text=True).splitlines():
        pid, comm = l.strip().split(None, 1)
        if comm == exe: return int(pid)
    return None

def machine():
    m = re.search(r"CPU_Speed_Limit\s*=\s*(\d+)", subprocess.run(["pmset", "-g", "therm"], capture_output=True, text=True).stdout)
    return f"load {os.getloadavg()[0]:.1f}, speed limit {m.group(1) if m else '?'}"

out = tempfile.mktemp()
starts, mems = [], []
for i in range(runs):
    state = machine()
    open(out, "w").close()
    t0 = time.perf_counter()
    subprocess.run(["open", "-n", app, "--stdout", out], check=True)
    start = None
    while start is None and time.perf_counter() - t0 < 60:
        if b"first-frame" in open(out, "rb").read(): start = (time.perf_counter() - t0) * 1000
        else: time.sleep(0.002)
    time.sleep(max(0, t0 + 10 - time.perf_counter()))
    root = main_pid()
    fam = family(root) if root else {}
    for pid in fam:
        try: os.kill(pid, signal.SIGTERM)
        except ProcessLookupError: pass
    time.sleep(2)
    if start is None or not fam:
        print(f"  run {i + 1}: FAILED (first-frame line: {start}, alive at 10 s: {bool(fam)}) [{state}]")
        continue
    starts.append(start); mems.append(sum(fam.values()) / 1024)
    print(f"  run {i + 1}: start {start:.0f} ms, memory {mems[-1]:.1f} MB in {len(fam)} processes [{state}]")
os.remove(out)
if starts:
    print(f"{name}: start median {statistics.median(starts):.0f} ms (range {min(starts):.0f}-{max(starts):.0f}), "
          f"memory median {statistics.median(mems):.1f} MB (range {min(mems):.1f}-{max(mems):.1f}), {len(starts)} runs")
PY
  done
}

for step in "$@"; do
  case $step in build) build ;; measure) measure ;; *) sed -n '2,8p' "$0" >&2; exit 2 ;; esac
done
