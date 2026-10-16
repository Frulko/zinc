#!/bin/sh
# Platform-specific files (docs/react-native.md, Metro's order): next to which.ts, which.esp32.ts replaces it under --profile esp32, and imports keep
# writing './which'. metro/: './Screen' is Screen.<platform>, else Screen.native on every platform but the web, else Screen (.ts before .tsx at each
# step), the same file for run, the interpreter and zinc export; '../which' has no file for these platforms and falls back without a word.
# zinc tsconfig writes the host's moduleSuffixes for tsc and editors.
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
cd "$(dirname "$0")/../golden/platform-files" || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
got=$("$Z" run main.ts 2>/dev/null); [ "$got" = "which.ts" ] || { echo "platform_files: host run printed '$got', want which.ts"; fail=1; }
got=$("$Z" run --profile esp32 main.ts 2>/dev/null); [ "$got" = "which.esp32.ts" ] || { echo "platform_files: --profile esp32 printed '$got', want which.esp32.ts"; fail=1; }
metro() {   # $1 the platform ('--profile p', 'ZINC_PLATFORM=p', '--interp --profile p' or ''), $2 the Screen file expected
  case "$1" in ZINC_PLATFORM=*) got=$(env "$1" "$Z" -q run metro/main.tsx 2>&1) ;; *) got=$("$Z" -q run $1 metro/main.tsx 2>&1) ;; esac
  [ "$got" = "$2 which.ts" ] || { echo "platform_files: ${1:-the host} printed '$got', want '$2 which.ts'"; fail=1; }
}
metro '--profile android' Screen.android.tsx
metro '--interp --profile android' Screen.android.tsx
metro '--profile ios' Screen.native.tsx
metro '--profile ios-sim' Screen.native.tsx
metro ZINC_PLATFORM=webos Screen.webos.ts
metro ZINC_PLATFORM=linux Screen.native.tsx
metro '' Screen.native.tsx
metro '--profile wasm' Screen.tsx
# zinc export compiles with the phone's profile: its program holds that file's string and no other platform's
for t in android:Screen.android.tsx ios:Screen.native.tsx; do
  "$Z" export metro --target "${t%%:*}" -o "$tmp/${t%%:*}" >/dev/null 2>&1 || { echo "platform_files: export --target ${t%%:*} failed"; fail=1; continue; }
  hits=$(find "$tmp/${t%%:*}" -name 'program*.cpp' -exec grep -ho "Screen[.a-z]*\.tsx*" {} + | sort -u | tr '\n' ' ')
  [ "$hits" = "${t#*:} " ] || { echo "platform_files: export --target ${t%%:*} holds '$hits', want '${t#*:}'"; fail=1; }
done
"$Z" tsconfig "$tmp" >/dev/null && host=$(uname -s | sed 's/Darwin/macos/;s/Linux/linux/') &&
  grep -q "\"moduleSuffixes\": \[\".$host\", \".native\", \"\"\]" "$tmp/tsconfig.json" || { echo "platform_files: zinc tsconfig wrote no moduleSuffixes for $host"; fail=1; }
[ $fail -eq 0 ] && echo "platform files: ok"
exit $fail
