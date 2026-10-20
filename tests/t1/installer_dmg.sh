#!/bin/sh
# macOS disk images (ZN-320.02): `zinc export --target macos --dmg` of a template app writes dist/<name>-<version>.dmg; it mounts (hdiutil attach)
# and holds the signed .app (codesign --verify) and the link to /Applications; --dmg for another target, or without the .app's zinc.json app.id,
# is refused. macOS only (77 elsewhere).
cd "$(dirname "$0")/../.." || exit 2
[ "$(uname)" = Darwin ] || { echo "installer_dmg: macOS only"; exit 77; }
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d); mnt="$tmp/mnt"; trap 'hdiutil detach -quiet "$mnt" 2>/dev/null; rm -rf "$tmp"' EXIT
fail=0
"$Z" new game-2d "$tmp/game" >/dev/null || exit 2
(cd "$tmp/game" && "$Z" export . --target macos --dmg >/dev/null 2>"$tmp/err") || { echo "export --dmg failed: $(tail -3 "$tmp/err")"; exit 1; }
dmg="$tmp/game/dist/game-0.1.0.dmg"
[ -f "$dmg" ] || { echo "no $dmg"; exit 1; }
mkdir -p "$mnt"
hdiutil attach -quiet -nobrowse -readonly -mountpoint "$mnt" "$dmg" || { echo "the .dmg does not mount"; exit 1; }
[ -d "$mnt/game.app/Contents/MacOS" ] || { echo "no game.app in the image: $(ls "$mnt")"; fail=1; }
[ "$(readlink "$mnt/Applications")" = /Applications ] || { echo "no Applications link"; fail=1; }
codesign --verify "$mnt/game.app" 2>"$tmp/cs" || { echo "the .app's signature does not verify: $(cat "$tmp/cs")"; fail=1; }
hdiutil detach -quiet "$mnt"
(cd "$tmp/game" && "$Z" export . --target linux --dmg >/dev/null 2>&1); [ $? -eq 2 ] || { echo "--dmg for linux must be refused"; fail=1; }
"$Z" new cli "$tmp/cli" >/dev/null && (cd "$tmp/cli" && "$Z" export . --target macos --dmg >/dev/null 2>"$tmp/err2"); grep -q 'app.*id' "$tmp/err2" || { echo "--dmg without app.id must say so: $(cat "$tmp/err2")"; fail=1; }
[ $fail -eq 0 ] && echo "installer dmg: ok"
exit $fail
