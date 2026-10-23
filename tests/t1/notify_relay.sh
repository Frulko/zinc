#!/bin/sh
# Zinc Relay (examples/notify-relay, ZN-757) against a fixture of Notification Center's database: the schema of macOS 15.7's usernoted
# (its CREATE TABLE statements), WAL, records whose data is a binary property list made by plutil, and fixtures of the Focus files. No
# real notification is read and no permission is needed: RELAY_DB and RELAY_FOCUS_DIR name the fixtures. The relay pairs with a test
# tablet (tests/data/notify-relay/receiver.ts) found over DNS-SD on this machine and must: skip what was there before it started; relay
# Mail, Messages, Calendar and two web notifications (Chrome's alert helper counted as Chrome, the site from the subtitle; Firefox's
# "via ...") with their fields and a 128 px icon sent once per hash (need-icon after the tablet dropped one); give messages their kind,
# sender and avatar (the record's identity image, else a monogram); hold back an app blocked in advance, a blocked site, a site muted
# from the tablet, everything while paused (SIGUSR1, the menu's item) and what the Focus policies hold; open the app of a tapped
# notification (reported only: a test never takes the focus); send the direct test notification (SIGUSR2) and see the tablet's ack;
# queue while the tablet is away and deliver when it is back. Then the settings file lists the apps and sites with their counts, the
# settings window (headless) lists them, and --inspect prints the records' shape without a value.
cd "$(dirname "$0")/../.." || exit 2
[ "$(uname)" = Darwin ] || { echo "macOS only (Notification Center)"; exit 77; }
for t in plutil sqlite3 xxd sips; do command -v $t >/dev/null || { echo "needs $t"; exit 77; }; done
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d)
export LINK_SERVICE="zn-relay-$$"
# Stop at the first broken phase; later waits only repeat the same capture failure.
bad() {
  echo "FAIL: $*"
  if [ -f "$tmp/db" ]; then
    sqlite3 -header "$tmp/db" 'SELECT count(*) AS records, count(DISTINCT hex(uuid)) AS uuids, max(rec_id) AS newest_record FROM record;'
  fi
  for log in "$tmp/relay.log" "$tmp"/tablet*.log; do
    [ ! -f "$log" ] || { echo "$(basename "$log"):"; tail -40 "$log"; }
  done
  # A live stall needs a native stack before cleanup kills the fixture processes.
  if command -v sample >/dev/null; then
    for process in "$app" "$tpid"; do
      case $process in ''|*[!0-9]*) continue ;; esac
      [ "$process" -gt 1 ] || continue
      if timeout 6 sample "$process" 1 10 -file "$tmp/stack-$process.txt" >/dev/null 2>&1; then
        echo "fixture process $process:"
        cat "$tmp/stack-$process.txt"
      fi
    done
  fi
  exit 1
}
trap 'kill $rpid $tpid 2>/dev/null; [ -n "$app" ] && kill $app 2>/dev/null; wait 2>/dev/null; rm -rf "$tmp"' EXIT
until_grep() { n=0; while [ $n -lt ${3:-300} ] && ! grep -q "$1" "$2" 2>/dev/null; do sleep 0.1; n=$((n+1)); done; grep -q "$1" "$2" 2>/dev/null; }

db=$tmp/db
sqlite3 "$db" "PRAGMA journal_mode=WAL;
CREATE TABLE dbinfo (key VARCHAR, value VARCHAR);
CREATE TABLE app (app_id INTEGER PRIMARY KEY, identifier VARCHAR, badge INTEGER NULL);
CREATE TABLE record (rec_id INTEGER PRIMARY KEY, app_id INTEGER, uuid BLOB, data BLOB, request_date REAL, request_last_date REAL, delivered_date REAL, presented Bool, style INTEGER, snooze_fire_date REAL);
CREATE TABLE requests (app_id INTEGER PRIMARY KEY, list BLOB);
CREATE TABLE delivered (app_id INTEGER PRIMARY KEY, list BLOB);
CREATE TABLE displayed (app_id INTEGER PRIMARY KEY, list BLOB);
CREATE TABLE snoozed (app_id INTEGER PRIMARY KEY, list BLOB);
CREATE TABLE categories (app_id INTEGER PRIMARY KEY, categories BLOB);
INSERT INTO dbinfo VALUES ('compatibleVersion', '23');" > /dev/null || { echo "sqlite3 failed"; exit 1; }
# record <bundle id> <the req dictionary's XML> [presented] [seconds ago]: one delivered record, as usernoted writes it
record() {
  printf '<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>app</key><string>%s</string><key>req</key><dict>%s<key>iden</key><string>t%s</string></dict></dict></plist>' "$1" "$2" "$$" > "$tmp/r.xml"
  plutil -convert binary1 -o "$tmp/r.plist" "$tmp/r.xml" || exit 1
  when=$(( $(date +%s) - 978307200 - ${4:-0} ))
  sqlite3 "$db" "INSERT INTO app (identifier) SELECT '$1' WHERE NOT EXISTS (SELECT 1 FROM app WHERE identifier = '$1');
    INSERT INTO record (app_id, uuid, data, request_date, request_last_date, delivered_date, presented, style)
    VALUES ((SELECT app_id FROM app WHERE identifier = '$1'), X'$(xxd -l 16 -p /dev/urandom)', X'$(xxd -p "$tmp/r.plist" | tr -d '\n')', $when, $when, $when.5, ${3:-1}, 1);" || bad "insert into the fixture"
}
# add <bundle id> <title> <subtitle> <body> [presented] [seconds ago]
add() { record "$1" "<key>titl</key><string>$2</string><key>subt</key><string>$3</string><key>body</key><string>$4</string><key>thre</key><string>thread-1</string>" "${5:-1}" "${6:-0}"; }
add com.apple.mail "Old news" "" "delivered before the relay started" 1 3600

# the Focus files: two modes, none on
mkdir -p "$tmp/focus"
printf '{"data":[{"modeConfigurations":{"com.apple.focus.work":{"mode":{"name":"Work","modeIdentifier":"com.apple.focus.work"}},"com.apple.sleep.sleep-mode":{"mode":{"name":"Sleep","modeIdentifier":"com.apple.sleep.sleep-mode"}}}}]}' > "$tmp/focus/ModeConfigurations.json"
focus_on() { printf '{"data":[{"storeAssertionRecords":[%s]}]}' "$1" > "$tmp/focus/Assertions.json.tmp" && mv "$tmp/focus/Assertions.json.tmp" "$tmp/focus/Assertions.json"; }
focus_on ''
mode() { echo "{\"assertionDetails\":{\"assertionDetailsModeIdentifier\":\"$1\"}}"; }

tablet() {   # the test tablet; `pair` opens a pairing
  LINK_STORE="$tmp/tablet.keys" ZINC_REALTIME=1 "$Z" run tests/data/notify-relay/receiver.ts -- $1 > "$tmp/tablet$2.log" 2>&1 & tpid=$!
  until_grep "^ready" "$tmp/tablet$2.log" || { echo "the tablet did not start: $(cat "$tmp/tablet$2.log")"; exit 1; }
}
tablet pair 1
code=$(sed -n 's/^ready port [0-9]* code \([0-9]*\).*/\1/p' "$tmp/tablet1.log")
[ -n "$code" ] || { echo "no code: $(cat "$tmp/tablet1.log")"; exit 1; }

# the settings of a person who blocked an app in advance and a site, passed the optional steps, and chose per-mode Focus policies
mkdir -p "$tmp/settings"
printf '{"v":1,"paused":false,"welcomed":true,"skipped":["contacts","notify"],"focus":"relay","focusModes":[{"id":"com.apple.focus.work","policy":"follow"},{"id":"com.apple.sleep.sleep-mode","policy":"hold"}],"apps":[{"id":"com.example.blocked","name":"Blocked App","allowed":false,"count":0,"last":0}],"domains":[{"domain":"ads.example.com","allowed":false,"count":0,"last":0}]}' > "$tmp/settings/settings.json"
export RELAY_DB="$db" RELAY_DIR="$tmp/settings" RELAY_FOCUS_DIR="$tmp/focus" RELAY_MESSAGES_DB="$tmp/no-messages.db"
RELAY_CODE=$code LINK_STORE="$tmp/relay.keys" ZINC_REALTIME=1 "$Z" run examples/notify-relay > "$tmp/relay.log" 2>&1 & rpid=$!
until_grep "^ready pid" "$tmp/relay.log" 600 || { echo "the relay did not start: $(tail -20 "$tmp/relay.log")"; exit 1; }
app=$(sed -n 's/^ready pid \([0-9]*\).*/\1/p' "$tmp/relay.log")
until_grep "^tablet connected" "$tmp/relay.log" || { echo "the relay did not pair and connect: $(tail -20 "$tmp/relay.log")"; exit 1; }
grep -q "^paired Zinc Relay" "$tmp/tablet1.log" || bad "the tablet did not see the pairing"
until_grep "^hello notify-relay v1 from " "$tmp/tablet1.log" || bad "no hello"

add com.apple.mail "Lunch?" "Anna" "Noon at the usual place"
add com.apple.MobileSMS "Ben" "" "On my way"
add com.apple.iCal "Standup" "in 5 minutes" "Room 2"
add com.google.Chrome.framework.AlertNotificationService "New issue" "github.com" "#42 opened"
add org.mozilla.firefox "Build passed" "via ci.example.org" "main is green"
sips -s format png -z 64 64 /System/Library/CoreServices/CoreTypes.bundle/Contents/Resources/GenericApplicationIcon.icns --out "$tmp/face.png" > /dev/null || bad "sips"
record net.whatsapp.WhatsApp "<key>titl</key><string>Chloe Durand</string><key>body</key><string>See you</string><key>cnta</key><dict><key>identityImageData</key><data>$(base64 -i "$tmp/face.png")</data></dict>"
add com.example.blocked "Should not arrive A" "" "an app blocked in advance"
add com.google.Chrome "Should not arrive B" "ads.example.com" "a blocked site"
add com.google.Chrome "Mute this site" "www.noisy.example.net" "the tablet mutes it"
until_grep "^mute sent" "$tmp/tablet1.log" || bad "the tablet did not get the notification to mute"
until_grep "^muted from the tablet: a site" "$tmp/relay.log" || bad "the relay did not take the mute"
add com.google.Chrome "Should not arrive C" "noisy.example.net" "a site muted from the tablet"
record com.apple.mail "<key>titl</key><string>Open me</string><key>body</key><string>tap it</string><key>durl</key><string>message://%3cabc@example.com%3e</string>"
until_grep "^open com.apple.mail with its url" "$tmp/relay.log" || bad "a tap on the tablet did not open the app with its url: $(grep '^open' "$tmp/relay.log")"
kill -USR1 "$app"
until_grep "^paused" "$tmp/relay.log" || bad "SIGUSR1 did not pause"
add com.apple.mail "Should not arrive D" "" "while paused"
sleep 2
kill -USR1 "$app"
until_grep "^resumed" "$tmp/relay.log" || bad "SIGUSR1 did not resume"
add com.apple.mail "After the pause" "" "relayed again"
until_grep "| After the pause |" "$tmp/tablet1.log" || bad "nothing after the pause"

# Focus: Work follows the mode (what the Mac showed goes), Sleep holds everything, none relays again
focus_on "$(mode com.apple.focus.work)"
until_grep "^focus on" "$tmp/relay.log" 100 || bad "the Focus was not seen"
add com.apple.mail "Should not arrive E" "" "held by the Work focus (not presented)" 0
add com.apple.mail "Through focus" "" "presented despite the Work focus" 1
until_grep "| Through focus |" "$tmp/tablet1.log" || bad "follow: what the Mac showed did not go through"
focus_on "$(mode com.apple.sleep.sleep-mode)"
n=0; while [ $n -lt 100 ] && [ "$(grep -c '^focus on' "$tmp/relay.log")" -lt 2 ]; do sleep 0.1; n=$((n+1)); done
add com.apple.mail "Should not arrive F" "" "held by the Sleep focus" 1
sleep 1.5
focus_on ''
until_grep "^focus off" "$tmp/relay.log" 100 || bad "the end of the Focus was not seen"
add com.apple.mail "After focus" "" "relayed again" 1
until_grep "| After focus |" "$tmp/tablet1.log" || bad "nothing after the Focus"
# the clock went back (set by hand, corrected by the network): a new record dated before the newest one seen is news all the same
add com.apple.iCal "Clock back" "" "dated ten minutes ago" 1 600
until_grep "| Clock back |" "$tmp/tablet1.log" || bad "a record dated before the newest one was not relayed"

# the menu's direct test (SIGUSR2), acknowledged by the tablet
kill -USR2 "$app"
until_grep "^direct test acknowledged by the tablet" "$tmp/relay.log" || bad "the direct test was not acknowledged"
grep -q "^notif dev.zinc.notify-relay | Zinc Relay | Zinc Relay | Notification de test |" "$tmp/tablet1.log" || bad "the direct test did not reach the tablet"

# the tablet goes away: the relay queues, and delivers once it is back (on another port, found again by discovery)
kill $tpid; wait $tpid 2>/dev/null
n=0; while [ $n -lt 100 ] && [ "$(grep '^tablet ' "$tmp/relay.log" | tail -1)" = "tablet connected" ]; do sleep 0.1; n=$((n+1)); done
add com.apple.MobileSMS "Queued while away" "" "sent when the tablet is back"
sleep 1.5
tablet '' 2
until_grep "| Queued while away |" "$tmp/tablet2.log" 400 || bad "the queued notification did not arrive after the tablet came back: $(tail -5 "$tmp/relay.log")"
kill -TERM "$app" 2>/dev/null; wait $rpid 2>/dev/null; app=

T=$tmp/tablet1.log
for t in "com.apple.mail | Mail | Lunch? | Anna | Noon at the usual place | - |" "com.apple.MobileSMS | Messages | Ben |  | On my way | - | .* | message | sender Ben | avatar " \
         "com.apple.iCal | Calendar | Standup | in 5 minutes | Room 2 | - | .* | other | sender  | avatar none" \
         "com.google.Chrome | [^|]* | New issue | github.com | #42 opened | github.com |" \
         "org.mozilla.firefox | .* | Build passed | via ci.example.org | main is green | ci.example.org |" \
         "net.whatsapp.WhatsApp | .* | Chloe Durand |  | See you | - | .* | message | sender Chloe Durand | avatar " \
         "com.google.Chrome | [^|]* | Mute this site | www.noisy.example.net | the tablet mutes it | noisy.example.net |"; do
  grep -q "^notif $t" "$T" || bad "not relayed as expected: $t"
done
grep -q "Should not arrive\|Old news" "$T" "$tmp/tablet2.log" && bad "relayed what it must not: $(grep -h 'Should not arrive\|Old news' "$T" "$tmp/tablet2.log" | cut -c1-80)"
grep -q "| undated" "$T" && bad "a notification without its date"
grep -q "^icon dropped" "$T" && grep -q "^need-icon sent" "$T" || bad "no need-icon round"
grep -q "^icon ok 128x128" "$T" || bad "no 128 px icon: $(grep '^icon' "$T" | head -3)"
grep -q "^icon bad" "$T" && bad "an icon whose hash does not match"
grep -q "| icon known |" "$T" || bad "no notification found its icon in the tablet's cache"
grep -q "^avatar record" "$tmp/relay.log" || bad "the record's identity image was not the avatar"
grep -q "^avatar monogram" "$tmp/relay.log" || bad "no monogram for a sender without a picture"

S=$tmp/settings/settings.json
for k in '"id":"com.apple.mail","name":"Mail","allowed":true,"count":8' '"id":"com.google.Chrome","name":"[^"]*","allowed":true,"count":4' \
         '"id":"com.example.blocked","name":"Blocked App","allowed":false,"count":1' '"domain":"noisy.example.net","allowed":false,"count":2' \
         '"domain":"github.com","allowed":true,"count":1' '"domain":"ads.example.com","allowed":false,"count":1' '"paused":false' \
         '"focusModes":\[{"id":"com.apple.focus.work","policy":"follow"}'; do
  grep -q "$k" "$S" || bad "the settings miss $k: $(cat "$S")"
done

# the settings window, headless: the apps seen, their counts and the blocked one
RELAY_OPEN=Applications ZINC_HEADLESS=1 ZINC_FRAMES=4 ZINC_SCENE_DUMP="$tmp/scene.bin" timeout 120 "$Z" run examples/notify-relay > "$tmp/window.log" 2>&1
[ -f "$tmp/scene.bin" ] || bad "the settings window drew nothing: $(tail -5 "$tmp/window.log")"
[ -f "$tmp/scene.bin" ] && python3 tools/scene-texts "$tmp/scene.bin" > "$tmp/texts.txt" 2>&1
for t in "^Mail$" "Blocked App" "^Bloquée$" "com.google.Chrome · 4 notifications" "com.example.blocked · 1 notification ·" "^Relayée$"; do
  grep -q "$t" "$tmp/texts.txt" 2>/dev/null || bad "the settings window does not show $t"
done

# --inspect: the records' shape, never a value
timeout 120 "$Z" run examples/notify-relay -- --inspect 3 > "$tmp/inspect.log" 2>&1
grep -q "^record of com.apple.MobileSMS presented 1 style 1" "$tmp/inspect.log" && grep -q "^  /req/titl string 17" "$tmp/inspect.log" || bad "--inspect: $(tail -5 "$tmp/inspect.log")"
grep -q "Queued\|After focus\|sent when" "$tmp/inspect.log" && bad "--inspect printed a value"
exit 0
