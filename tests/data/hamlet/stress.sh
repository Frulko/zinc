#!/bin/sh
# Hamlet stress runner. By hand, never in a tier. One scenario = environment knobs, one engine, one frame count:
#   tests/data/hamlet/stress.sh <engine: --native|--interp> <frames> [label]
# Knobs (all optional): SIZE (map, default 128), PEOPLE, ANIMALS, BUILDINGS (ZINC_HAMLET_CROWD), VIEW (cite|pixel), INPUT (a ZINC_INPUT file),
# CAM ("i,j,zoom"), PERF (frames per report, default 200), WINDOWED=1 (Metal window + ZINC_PRESENT_STATS), STILL=0|1, SEED, PRESET.
# Prints the perf-total line of the game's PerfTrace plus the peak resident memory (/usr/bin/time -l).
set -u
cd "$(dirname "$0")/../../.."
Z=${ZINC:-build/zinc}
d=$(mktemp -d)
trap 'rm -rf "$d"' EXIT
export ZINC_BACKGROUND=1 ZINC_APP_DATA="$d" ZINC_SIZE=${ZINC_SIZE:-1100x900} ZINC_FRAMES=$2
[ "${WINDOWED:-0}" = 1 ] && export ZINC_PRESENT_STATS=1 || export ZINC_HEADLESS=1
export ZINC_HAMLET_VIEW=${VIEW:-cite} ZINC_HAMLET_PERF=${PERF:-200} ZINC_HAMLET_STILL=${STILL:-0}
export ZINC_HAMLET="${SEED:-3},${SIZE:-128},${PRESET:-0}"
[ -n "${PEOPLE:-}${ANIMALS:-}" ] && export ZINC_HAMLET_CROWD="${PEOPLE:-0},${ANIMALS:-0},${BUILDINGS:-160}"
[ -n "${CAM:-}" ] && export ZINC_HAMLET_CAM="$CAM"
[ -n "${INPUT:-}" ] && export ZINC_INPUT="$INPUT"
echo "== ${3:-scenario} $1 size ${SIZE:-128} people ${PEOPLE:-0} animals ${ANIMALS:-0} view ${VIEW:-cite} load $(uptime | sed 's/.*averages: //')"
/usr/bin/time -l timeout "${TMO:-900}" "$Z" run $1 examples/hamlet > "$d/out" 2> "$d/err"
grep -E "${GREP:-perf-total|stress|bake|gen }" "$d/out" | tail -${TAIL:-4}
grep 'zinc present' "$d/err" | tail -${PRESENT_TAIL:-3}
grep -E 'maximum resident|peak memory' "$d/err"
grep -vE 'maximum|peak|page|swap|context|involuntary|voluntary|signals|messages|block|real|instructions|cycles|reclaims|faults|^ +[0-9.]+ +(real|user|sys)' "$d/err" | head -5
