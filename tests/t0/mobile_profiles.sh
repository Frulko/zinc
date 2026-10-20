#!/bin/sh
# Phones and tablets (ZN-618): the android, ios and ios-sim profiles refuse a program whose zinc.json requires process or tray, with the capability
# message, and take one that does not; zinc toolchain targets names them with what builds them; zinc.json app.versionCode and app.orientation are read.
cd "$(dirname "$0")/../.." || exit 2
Z=${ZINC:-build/zinc}
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
printf 'console.log("hi");\n' > "$tmp/main.ts"
for need in process tray; do
  printf '{"name": "needs", "entry": "main.ts", "requires": ["%s"]}\n' "$need" > "$tmp/zinc.json"
  for p in android ios ios-sim; do
    msg=$("$Z" check --profile $p "$tmp" 2>&1) && { echo "check --profile $p took a program that requires $need"; fail=1; }
    echo "$msg" | grep -q "requires $need ($p has $need false)" || { echo "check --profile $p, requires $need: $msg"; fail=1; }
  done
  "$Z" check "$tmp" >/dev/null 2>&1 || { echo "the desktop refused a program that requires $need"; fail=1; }
done
printf '{"name": "plain", "entry": "main.ts", "app": {"id": "dev.zinc.plain", "version": "1.2.0", "versionCode": 12, "orientation": "portrait"}}\n' > "$tmp/zinc.json"
for p in android ios; do "$Z" check --profile $p "$tmp" >/dev/null 2>&1 || { echo "check --profile $p refused a plain program: $("$Z" check --profile $p "$tmp" 2>&1 | head -2)"; fail=1; }; done
printf '{"name": "bad", "entry": "main.ts", "app": {"id": "dev.zinc.bad", "orientation": "sideways"}}\n' > "$tmp/zinc.json"
"$Z" check "$tmp" 2>&1 | grep -q "app.orientation 'sideways' is not one of portrait, landscape, any" || { echo "a bad app.orientation is not refused"; fail=1; }
printf '{"name": "bad", "entry": "main.ts", "app": {"id": "dev.zinc.bad", "versionCode": 0}}\n' > "$tmp/zinc.json"
"$Z" check "$tmp" 2>&1 | grep -q "app.versionCode must be a whole number" || { echo "app.versionCode 0 is not refused"; fail=1; }
t=$("$Z" toolchain targets)
echo "$t" | grep -q '^android .*armeabi-v7a.*needs the Android NDK' || { echo "toolchain targets: no android line"; fail=1; }
echo "$t" | grep -q '^ios .*needs Xcode' || { echo "toolchain targets: no ios line"; fail=1; }
echo "$t" | grep -q '^ios-sim .*needs Xcode' || { echo "toolchain targets: no ios-sim line"; fail=1; }
"$Z" build --target android "$tmp/main.ts" -o "$tmp/x" 2>&1 | grep -q "zinc export --target android" || { echo "zinc build --target android does not point to zinc export"; fail=1; }
[ $fail -eq 0 ] && echo "mobile profiles: ok"
exit $fail
