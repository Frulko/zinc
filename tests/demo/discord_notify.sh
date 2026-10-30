#!/bin/sh
# examples/discord: who notifies (src/notify.ts) over recorded events (tests/notify-events.json: READY's notification settings in
# Discord's shape, then messages): levels all / mentions only / nothing from the server, its default, a channel or its category; mutes
# with and without an end time; @everyone and role mentions and their suppression; DMs, muted DMs and a mention that beats the mute;
# @silent messages, my own, a voice channel's chat. One line per case, compared with tests/golden/discord/notify.out on the interpreter
# and AOT. ZN_UPDATE_GOLDEN=1 records again.
cd "$(dirname "$0")/../.." || exit 2
golden=tests/golden/discord/notify.out
export NOTIFY_EVENTS="$PWD/examples/discord/tests/notify-events.json"
if [ -n "$ZN_UPDATE_GOLDEN" ]; then "$ZINC" run --interp examples/discord/tests/notify-rules.ts > $golden 2>&1; echo "discord_notify: golden recorded"; exit 0; fi
fail=0
for e in --interp --native; do
  "$ZINC" run $e examples/discord/tests/notify-rules.ts 2>&1 | grep -v '^zinc' | diff -u $golden - || { echo "discord_notify: $e differs"; fail=1; }
done
exit $fail
