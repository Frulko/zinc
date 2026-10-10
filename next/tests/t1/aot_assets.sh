#!/bin/sh
# A program built ahead of time finds its assets (ZN-314): assets/ beside the executable (zinc export), one level above it (zinc build writes
# <project>/build/<name>), else the one of the directory it is started in; ZINC_ASSETS decides when set. A program that enforces its permissions
# reads its own assets without one, does not take the working directory's, and a ".." out of its assets is checked as any path.
cd "$(dirname "$0")/../.." || exit 2
[ -n "$CXX" ] || command -v c++ >/dev/null || { echo "skipped: no C++ compiler"; exit 77; }
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HEADLESS=1
unset ZINC_ASSETS
fail=0
# is <what> <expected output> <directory to start in> <executable>
is() {
  got=$(cd "$3" && "$4" 2>&1 | tr '\n' '|')
  [ "$got" = "$2" ] || { echo "aot_assets: $1: expected '$2', got '$got'"; fail=1; }
}
asset() { mkdir -p "$1/assets" && printf '%s' "$2" > "$1/assets/msg.txt"; }

printf "import { exists, readText } from 'zinc:assets';\nconsole.log(exists('msg.txt') ? readText('msg.txt') : 'none');\n" > "$tmp/app.ts"
"$Z" build "$tmp/app.ts" -o "$tmp/app" 2>"$tmp/err" || { echo "aot_assets: build failed: $(head -c 300 "$tmp/err")"; exit 1; }
mkdir -p "$tmp/bare" "$tmp/dist" "$tmp/proj/build" "$tmp/cwd" "$tmp/env"
for d in bare dist proj/build; do cp "$tmp/app" "$tmp/$d/app"; done
asset "$tmp/dist" beside; asset "$tmp/proj" above; asset "$tmp/cwd" started; asset "$tmp/env" env
is "no assets" "none|" "$tmp/bare" "$tmp/bare/app"
is "beside the executable" "beside|" / "$tmp/dist/app"
is "above the executable" "above|" / "$tmp/proj/build/app"
is "the directory it is started in" "started|" "$tmp/cwd" "$tmp/bare/app"
is "the executable's before the directory's" "beside|" "$tmp/cwd" "$tmp/dist/app"
export ZINC_ASSETS="$tmp/env/assets"
is "ZINC_ASSETS first" "env|" "$tmp/cwd" "$tmp/dist/app"
unset ZINC_ASSETS   # (an assignment in front of a shell function would outlive the call)

# permissions enforced (declared in zinc.json: the built program enforces them)
mkdir -p "$tmp/p" "$tmp/ship" "$tmp/lone"
printf '{ "name": "p", "entry": "main.ts", "permissions": [] }\n' > "$tmp/p/zinc.json"
printf "import { exists, readText } from 'zinc:assets';\nconsole.log(exists('msg.txt') ? readText('msg.txt') : 'none');\ntry { console.log(readText('../secret.txt')); } catch (e) { console.log((e as Error).message.substring(0, 6)); }\n" > "$tmp/p/main.ts"
"$Z" build "$tmp/p/main.ts" -o "$tmp/ship/p" 2>"$tmp/err" || { echo "aot_assets: build with permissions failed: $(head -c 300 "$tmp/err")"; exit 1; }
cp "$tmp/ship/p" "$tmp/lone/p"
asset "$tmp/ship" mine; printf 'secret' > "$tmp/ship/secret.txt"
is "enforced: its own assets, no way out with .." "mine|EACCES|" / "$tmp/ship/p"
is "enforced: not the assets of the directory it is started in" "none|ENOENT|" "$tmp/cwd" "$tmp/lone/p"
[ $fail -eq 0 ] && echo "aot assets: ok"
exit $fail
