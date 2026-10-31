#!/bin/sh
# The Discord client's words and tooltips (ZN-922): tools/discord-i18n-check finds no visible string outside the catalog (i18n/<lang>/discord.json)
# and no icon-only button without a Tooltip, and catches both in a component made to break the rules; then the app against the fake Discord,
# in English and in French: Tab through the screen prints each stop's label and whether its tooltip is on screen, to the Mute button of the user
# bar (the last frame, French and English, are compared by hash with tests/golden/discord-i18n); the Language row of Settings > Appearance switches
# the app to French at once, keeps the choice in ZINC_HOME/config.json, and shows the Account safety page in French (its frame hash too).
# ZN_UPDATE_GOLDEN=1 records the goldens again.
cd "$(dirname "$0")/../.." || exit 2
golden=$PWD/tests/golden/discord-i18n
case $ZINC in /*) ;; *) ZINC=$PWD/$ZINC ;; esac   # the app runs from its own directory
tmp=$(mktemp -d)
cleanup() { [ -n "$fake" ] && { kill "$fake" 2>/dev/null; wait "$fake" 2>/dev/null; }; rm -rf "$tmp"; }
trap cleanup EXIT
fail=0
python3 tools/discord-i18n-check || { echo "discord_i18n: the static scan finds problems"; fail=1; }
# the scan catches what it is for: a literal text, a literal attribute and an icon-only button without a Tooltip in a copy of the sources
mkdir -p "$tmp/repo/examples/discord" "$tmp/repo/i18n"
cp -R examples/discord/src "$tmp/repo/examples/discord/src" && cp -R i18n/en "$tmp/repo/i18n/en"
cat > "$tmp/repo/examples/discord/src/components/Broken.tsx" <<'EOF'
import { Icon } from 'zinc:icons';
import { tr } from '../i18n';
export function Broken() {
  return <View><Text>Hello there</Text><Text aria-label="Plain words">{tr('discord.nowhere.key')}</Text>
    <View onPress={() => {}}><Icon name="x" size={16} /></View></View>;
}
EOF
python3 tools/discord-i18n-check "$tmp/repo" > "$tmp/broken" 2>&1
for want in "Broken.tsx:4: visible text outside the catalog: 'Hello there'" 'Broken.tsx:4: aria-label="Plain words" is not a catalog entry' "Broken.tsx:5: an icon-only button without a Tooltip" "discord.nowhere.key is not in i18n/en/discord.json"; do
  grep -qF "$want" "$tmp/broken" || { echo "discord_i18n: the scan does not report: $want"; fail=1; }
done
export ZINC_BACKGROUND=1 ZINC_DETERMINISTIC=0 ZINC_HEADLESS=1 ZINC_SCALE=1 ZINC_SIZE=1200x760 ZINC_FRAMES=1000000 ZINC_FRAMEHASH=last
export ZINC_SYSTEM_RUNTIME_DIR=$tmp ZINC_STORAGE=$tmp/storage.kv DISCORD_CACHE=$tmp/cache DISCORD_TOKEN=test-token ZINC_HOME=$tmp/home
FAKE_ASSETS=$PWD/examples/discord/tests/assets FAKE_PORTS_FILE=$tmp/ports timeout 330 "$ZINC" run --interp examples/discord/tests/fake-discord.ts > "$tmp/fake" 2>&1 &
fake=$!
for _ in $(seq 2400); do [ -s "$tmp/ports" ] && break; kill -0 $fake 2>/dev/null || break; sleep 0.1; done
[ -s "$tmp/ports" ] || { echo "discord_i18n: the fake server did not start"; tail -5 "$tmp/fake"; exit 1; }
read -r api gw < "$tmp/ports"
export DISCORD_API="http://127.0.0.1:$api/api/v9" DISCORD_GATEWAY="ws://127.0.0.1:$gw" DISCORD_CDN="http://127.0.0.1:$api/cdn"
cd examples/discord || exit 2
for run in en fr; do
  ZINC_LANG=$run DISCORD_DEMO=tips timeout 60 "$ZINC" run . > "$tmp/tips-$run" 2>&1 || { echo "discord_i18n: the $run tips session failed"; tail -8 "$tmp/tips-$run"; exit 1; }
  grep -E '^(language|tab )' "$tmp/tips-$run" > "$tmp/tips-$run.out"
  sed -n 's/^zinc: framehash [0-9]* [0-9x]* //p' "$tmp/tips-$run" | tail -1 > "$tmp/tips-$run.hash"
done
ZINC_LANG=en DISCORD_DEMO=tips DISCORD_TIPS=language timeout 60 "$ZINC" run . > "$tmp/lang" 2>&1 || { echo "discord_i18n: the language session failed"; tail -8 "$tmp/lang"; exit 1; }
cd ../.. || exit 2
grep -E '^language' "$tmp/lang" > "$tmp/lang.out"
sed -n 's/^zinc: framehash [0-9]* [0-9x]* //p' "$tmp/lang" | tail -1 > "$tmp/lang.hash"
cat "$tmp/home/config.json" >> "$tmp/lang.out"
# every stop of the Tab walk that has a tooltip is an icon button of the user bar, the rail, the composer...: the Mute button's one shows
grep -q "tab [0-9]*: Couper le micro tip true" "$tmp/tips-fr.out" || { echo "discord_i18n: the French Mute button shows no tooltip"; fail=1; }
grep -q "tab [0-9]*: Mute tip true" "$tmp/tips-en.out" || { echo "discord_i18n: the English Mute button shows no tooltip"; fail=1; }
if [ -n "$ZN_UPDATE_GOLDEN" ]; then mkdir -p "$golden"
  for f in tips-en.out tips-fr.out tips-en.hash tips-fr.hash lang.out lang.hash; do cp "$tmp/$f" "$golden/$f"; done
  echo "discord_i18n: goldens recorded"; exit 0; fi
for f in tips-en.out tips-fr.out tips-en.hash tips-fr.hash lang.out lang.hash; do
  cmp -s "$tmp/$f" "$golden/$f" || { echo "discord_i18n: $f differs"; diff "$golden/$f" "$tmp/$f" | head -8; fail=1; }
done
exit $fail
