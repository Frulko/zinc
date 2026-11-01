#!/bin/sh
# Hamlet balance: the bot player opens a village and works the campaign goals headless. The first goals must come on time and the village must grow (a regression test of the balance:
# the opening used to dead-end at 4 people with no plank). Seed 2, a 24 x 24 map, 40 days (13 minutes of play).
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
BOT_SEEDS=2 BOT_SIZES=24 BOT_PRESETS=0 BOT_DAYS=40 ZINC_HEADLESS=1 ZINC_BACKGROUND=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=1 "$ZINC" run tests/data/hamlet/bot.ts > "$tmp/out" 2> "$tmp/err"
[ ! -s "$tmp/err" ] || { cat "$tmp/err"; exit 1; }
line=$(grep '^bot seed' "$tmp/out")
at() { echo "$line" | sed -n "s/.* $1@\([0-9-]*\).*/\1/p"; }
maxpop=$(echo "$line" | sed -n 's/.*maxPop \([0-9]*\).*/\1/p')
[ "$(at planks)" != - ] && [ "$(at planks)" -le 6 ] || { echo "planks goal late: $line"; exit 1; }
[ "$(at street)" != - ] && [ "$(at street)" -le 6 ] || { echo "street goal late: $line"; exit 1; }
[ "$(at growth)" != - ] && [ "$(at growth)" -le 12 ] || { echo "growth goal late: $line"; exit 1; }
[ "$maxpop" -ge 20 ] || { echo "the village did not grow: $line"; exit 1; }
# seed 6 in the forest: the gate pocket is walled in by rock and the bot's own houses; the lumber hut used to say "full" with trees all around and the village stayed at 6 people
BOT_SEEDS=6 BOT_SIZES=24 BOT_PRESETS=4 BOT_DAYS=40 ZINC_HEADLESS=1 ZINC_BACKGROUND=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=1 "$ZINC" run tests/data/hamlet/bot.ts > "$tmp/out6" 2> "$tmp/err"
[ ! -s "$tmp/err" ] || { cat "$tmp/err"; exit 1; }
line6=$(grep '^bot seed' "$tmp/out6")
[ "$(echo "$line6" | sed -n 's/.*maxPop \([0-9]*\).*/\1/p')" -ge 20 ] || { echo "the forest village is stuck: $line6"; exit 1; }
echo 'hamlet bot: goals on time and the village grows PASS'
