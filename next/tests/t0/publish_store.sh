#!/bin/sh
# zinc publish --itch / --site (ZN-325), on a project whose dist/ holds a macOS and a Linux export and a .dmg (made up: the command only reads
# dist/): --dry-run prints one butler push per export directory (channels mac and linux, the :suffix added, the version) and uploads nothing;
# --site writes index.html with each download's size and SHA-256 and a SHA256SUMS that shasum checks; butler is pinned: offline, a mirror
# serving another file is refused on its checksum and nothing is installed.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
"$ZINC" new cli "$tmp/app" >/dev/null || exit 2
name=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['name'])" "$tmp/app/zinc.json")
version=1.2.3
python3 -c "import json,sys; p=sys.argv[1]; d=json.load(open(p)); d['app'] = {'id': 'com.example.store', 'version': '1.2.3'}; json.dump(d, open(p, 'w'))" "$tmp/app/zinc.json"
mkdir -p "$tmp/app/dist/$name-macos" "$tmp/app/dist/$name-linux"
echo mac > "$tmp/app/dist/$name-macos/$name"; echo linux > "$tmp/app/dist/$name-linux/$name"; head -c 3000 /dev/urandom > "$tmp/app/dist/$name-$version.dmg"
out=$("$ZINC" publish "$tmp/app" --itch me/game:beta --dry-run 2>&1) || { echo "dry run failed: $out"; exit 1; }
echo "$out" | grep -q "push '[^']*/dist/$name-macos' 'me/game:mac-beta' --userversion '$version'" || { echo "no push of the macOS export: $out"; fail=1; }
echo "$out" | grep -q "push '[^']*/dist/$name-linux' 'me/game:linux-beta' --userversion '$version'" || { echo "no push of the Linux export: $out"; fail=1; }
[ "$(echo "$out" | grep -c ' push ')" = 2 ] || { echo "one push per export directory, not the installers: $out"; fail=1; }
echo "$out" | grep -q "^dry run: nothing was uploaded" || { echo "the dry run does not say so: $out"; fail=1; }
"$ZINC" publish "$tmp/app" --site "$tmp/site" >/dev/null || { echo "--site failed"; fail=1; }
for f in "$name-macos.tar.gz" "$name-linux.tar.gz" "$name-$version.dmg"; do
  sha=$(shasum -a 256 "$tmp/site/$f" | cut -d' ' -f1); size=$(wc -c < "$tmp/site/$f" | tr -d ' ')
  grep -q "href=\"$f\"" "$tmp/site/index.html" && grep -q "sha256 $sha" "$tmp/site/index.html" && grep -q "($size bytes)" "$tmp/site/index.html" || { echo "index.html lacks $f, its sha256 $sha or its size $size"; fail=1; }
done
(cd "$tmp/site" && shasum -a 256 -c SHA256SUMS >/dev/null) || { echo "SHA256SUMS does not check"; fail=1; }
case "$(uname -s)-$(uname -m)" in Darwin-x86_64) ch=darwin-amd64 ;; Darwin-arm64) ch=darwin-arm64 ;; Linux-x86_64) ch=linux-amd64 ;; Linux-aarch64) ch=linux-arm64 ;; *) ch= ;; esac
if [ -n "$ch" ]; then
  mkdir -p "$tmp/mirror"; head -c 1000 /dev/urandom > "$tmp/mirror/butler-$ch-15.31.0.zip"
  err=$(ZINC_HOME="$tmp/home" ZINC_OFFLINE=1 ZINC_MIRRORS="file://$tmp/mirror" "$ZINC" publish "$tmp/app" --itch me/game 2>&1) && { echo "a butler that does not match its pin was used: $err"; fail=1; }
  echo "$err" | grep -q "does not verify (SHA-256 .*, the pin is [0-9a-f]\{64\})" || { echo "no checksum refusal: $err"; fail=1; }
  [ ! -e "$tmp/home/toolchains/butler-"*"/butler" ] || { echo "butler was installed anyway"; fail=1; }
  echo "$err" | grep -q " push " && { echo "something was pushed: $err"; fail=1; }
fi
[ $fail -eq 0 ] && echo "publish_store: ok"
exit $fail
