#!/bin/sh
# Installs Musique on an HP TouchPad (webOS 3) over novacom (README.md): builds it for armv7-webos, installs it as a webOS application shown in the
# launcher (org.zinc.music), with its icon, a CA bundle for HTTPS (the Mac's /etc/ssl/cert.pem), the Spotify login when spotify.json is here and
# not yet on the tablet (--spotify replaces it), and zinc-helper (tools/webos-helper: full speed, backlight, firewall ports, time zone).
# Then starts it. Needs: the tablet in developer mode seen by `novacom -l`, tools/webos-sysroot run once.
set -e
here=$(cd "$(dirname "$0")" && pwd -P); repo=$(cd "$here/../.." && pwd -P)
ZINC=${ZINC:-$repo/build/zinc}
ID=org.zinc.music; APP=/media/cryptofs/apps/usr/palm/applications/$ID
work=$(mktemp -d); trap 'rm -rf "$work"' EXIT
strip=$(command -v llvm-strip || ls /opt/homebrew/opt/llvm*/bin/llvm-strip /usr/local/opt/llvm*/bin/llvm-strip 2>/dev/null | head -1 || true)
remote() { printf '%s\n' "$1" | novacom run file://bin/sh; }
put() { novacom put "file:/$APP/$2" < "$1"; }

novacom -l | grep -q . || { echo "install: no tablet (novacomd running? developer mode?)" >&2; exit 1; }
echo "install: building for the TouchPad" >&2
ZINC_DISPLAY= ZINC_NATIVE=real "$ZINC" build --target armv7-webos "$here/src/main.ts" -o "$work/music" > "$work/build.log" 2>&1 || { tail -20 "$work/build.log" >&2; exit 1; }
rm -f "$work/music.components"
[ -z "$strip" ] || "$strip" "$work/music"
sips -z 64 64 "$here/icon.png" --out "$work/icon64.png" > /dev/null
version=$(sed -n 's/^ *"version": *"\([^"]*\)".*/\1/p' "$here/zinc.json" | head -1)   # the app's version, zinc.json app.version
# requiredMemory: the MB webOS's MemoryMonitor allows a native card (64 warned at 111 for Musique, 2026-10-15: a GL program with its
# images and buffers)
printf '{\n\t"title": "Musique",\n\t"type": "pdk",\n\t"main": "music",\n\t"id": "%s",\n\t"version": "%s",\n\t"vendor": "Zinc",\n\t"icon": "icon64.png",\n\t"requiredMemory": 160\n}\n' "$ID" "$version" > "$work/appinfo.json"

echo "install: copying to $APP" >&2
remote "killall music 2>/dev/null; sleep 1; killall -9 music 2>/dev/null; mkdir -p $APP && chmod 777 $APP"   # the program writes its settings there
put "$work/appinfo.json" appinfo.json
put "$work/icon64.png" icon64.png
put /etc/ssl/cert.pem cacert.pem
login="$here/spotify.json"; [ -f "$login" ] || login="${ZINC_HOME:-$HOME/.zinc}/spotify.json"   # the app's own login, else the machine's shared one
if [ -f "$login" ]; then
  if [ "$1" = --spotify ] || ! remote "test -f $APP/spotify.json && echo yes" | grep -q yes; then put "$login" spotify.json; echo "install: Spotify login copied" >&2; fi
fi
seed=$(python3 -c "import json; print(json.load(open('$here/config.json')).get('seed', ''))" 2>/dev/null || true)
if [ -n "$seed" ] && ! remote "test -f $APP/config.json && echo yes" | grep -q yes; then   # a speaker this machine found: the first start needs no search
  printf '{"sleep":120,"seed":"%s"}\n' "$seed" > "$work/config.json"; put "$work/config.json" config.json
fi
novacom put "file:/$APP/music.new" < "$work/music"
remote "chmod 755 $APP/music.new && mv -f $APP/music.new $APP/music && chmod 666 $APP/*.json 2>/dev/null; true"

# the root helper of zinc:webos, and the jobs of the first versions of this app gone
remote "stop zinc-music > /dev/null 2>&1; stop zinc-backlight > /dev/null 2>&1; if [ -f /etc/event.d/zinc-music ] || [ -f /etc/event.d/zinc-backlight ]; then mount -o remount,rw / && rm -f /etc/event.d/zinc-music /etc/event.d/zinc-backlight; mount -o remount,ro /; fi; rm -f $APP/helper.sh $APP/backlight.sh"
"$repo/tools/webos-helper"

remote 'luna-send -n 1 palm://com.palm.applicationManager/rescan "{}" < /dev/null > /dev/null 2>&1'
remote "luna-send -n 1 palm://com.palm.applicationManager/launch '{\"id\":\"$ID\"}' < /dev/null > /dev/null 2>&1"
echo "install: done, Musique is in the launcher and running" >&2
