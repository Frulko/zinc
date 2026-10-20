#!/bin/sh
# Installs Musique (arbre) on an HP TouchPad (webOS 3) over novacom (README.md): builds it for armv7-webos, installs it as a webOS
# application shown in the launcher under its own id (org.zinc.music-tree, beside examples/music), with its icon, a CA bundle for HTTPS
# (the Mac's /etc/ssl/cert.pem), the Spotify login when spotify.json is here and not yet on the tablet (--spotify replaces it), and
# zinc-helper (tools/webos-helper: full speed, backlight, firewall ports, time zone). Then starts it.
# Needs: the tablet in developer mode seen by `novacom -l`, tools/webos-sysroot run once.
set -e
here=$(cd "$(dirname "$0")" && pwd -P); repo=$(cd "$here/../.." && pwd -P)
ZINC=${ZINC:-$repo/build/zinc}
# The app's id, name and version from zinc.json (app.id dev.zinc.X installs as org.zinc.X, as examples/music does)
app() { python3 -c 'import json, sys; print(json.load(open(sys.argv[1]))["app"][sys.argv[2]])' "$here/zinc.json" "$1"; }
appid=$(app id); version=$(app version); title=$(app name)
ID=org.${appid#dev.}; BIN=music-tree; APP=/media/cryptofs/apps/usr/palm/applications/$ID
work=$(mktemp -d); trap 'rm -rf "$work"' EXIT
strip=$(command -v llvm-strip || ls /opt/homebrew/opt/llvm*/bin/llvm-strip /usr/local/opt/llvm*/bin/llvm-strip 2>/dev/null | head -1 || true)
remote() { printf '%s\n' "$1" | novacom run file://bin/sh; }
put() { novacom put "file:/$APP/$2" < "$1"; }

novacom -l | grep -q . || { echo "install: no tablet (novacomd running? developer mode?)" >&2; exit 1; }
echo "install: building for the TouchPad" >&2
ZINC_DISPLAY= ZINC_NATIVE=real "$ZINC" build --target armv7-webos "$here/src/main.ts" -o "$work/$BIN" > "$work/build.log" 2>&1 || { tail -20 "$work/build.log" >&2; exit 1; }
rm -f "$work/$BIN.components"
[ -z "$strip" ] || "$strip" "$work/$BIN"
sips -z 64 64 "$here/icon.png" --out "$work/icon64.png" > /dev/null
# requiredMemory: the MB webOS's MemoryMonitor allows a native card (64 warned at 111 for Musique, 2026-10-15: a GL program with its
# images and buffers)
printf '{\n\t"title": "%s",\n\t"type": "pdk",\n\t"main": "%s",\n\t"id": "%s",\n\t"version": "%s",\n\t"vendor": "Zinc",\n\t"icon": "icon64.png",\n\t"requiredMemory": 160\n}\n' "$title" "$BIN" "$ID" "$version" > "$work/appinfo.json"

echo "install: copying to $APP" >&2
remote "killall $BIN 2>/dev/null; sleep 1; killall -9 $BIN 2>/dev/null; mkdir -p $APP && chmod 777 $APP"   # the program writes its settings there
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
novacom put "file:/$APP/$BIN.new" < "$work/$BIN"
remote "chmod 755 $APP/$BIN.new && mv -f $APP/$BIN.new $APP/$BIN && chmod 666 $APP/*.json 2>/dev/null; true"

"$repo/tools/webos-helper"   # the root helper of zinc:webos

remote 'luna-send -n 1 palm://com.palm.applicationManager/rescan "{}" < /dev/null > /dev/null 2>&1'
remote "luna-send -n 1 palm://com.palm.applicationManager/launch '{\"id\":\"$ID\"}' < /dev/null > /dev/null 2>&1"
echo "install: done, $title $version ($ID) is in the launcher and running" >&2
