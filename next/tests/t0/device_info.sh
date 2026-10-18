#!/bin/sh
# Device information (ZN-761): zinc:sys device('device') is one JSON record with expo-device's fields, zinc:device-info exposes it, Platform.isPad,
# isTV and constants come from it. The development machine answers its own (on a Mac: hw.model, sw_vers, hw.memsize), and ZINC_PLATFORM=ios|android
# a simulated phone: ZINC_DEVICE_MODEL=iPad6,7 is an iPad Pro (isPad), an unknown identifier gets no name, ZINC_DEVICE_TYPE=tablet|tv on Android.
cd "$(dirname "$0")/../golden/device-info" || exit 2
fail=0
run() { env ZINC_PLATFORM_VERSION= "$@" "$ZINC" run main.tsx 2>/dev/null | tail -3; }
expect() {   # $1 what ran, $2 the output, $3 a pattern of the whole output
  case "$2" in $3) ;; *) echo "device_info: $1 printed '$2', want '$3'"; fail=1 ;; esac
}
keys='type brand manufacturer modelName modelId designName osName osVersion osBuildId totalMemory cpuArchitectures isDevice model os'

out=$(run ZINC_PLATFORM=)
echo "$out" | head -1 | python3 -c "
import json, sys
r = json.loads(sys.stdin.read())
missing = [k for k in '$keys'.split() if k not in r]
assert not missing, 'missing keys %s' % missing
assert isinstance(r['cpuArchitectures'], list) and r['cpuArchitectures'], r
assert r['isDevice'] is True and r['totalMemory'] > 0, r
" || { echo "device_info: the desktop's record is not complete: $(echo "$out" | head -1)"; fail=1; }
if [ "$(uname -s)" = Darwin ]; then
  expect macos "$out" "*\"modelId\":\"$(sysctl -n hw.model)\"*\"osVersion\":\"$(sw_vers -productVersion)\",\"osBuildId\":\"$(sw_vers -buildVersion)\",\"totalMemory\":$(sysctl -n hw.memsize),*
type=DESKTOP brand=Apple manufacturer=Apple *osName=macOS * isDevice=true memory=true cpus=*
isPad=false isTV=false idiom=mac uiMode=desk systemName=macOS *Brand=Apple"
else
  expect linux "$out" "*isDevice=true memory=true cpus=$(uname -m)
isPad=false isTV=false *"
fi
expect ios "$(run ZINC_PLATFORM=ios)" '*
type=PHONE brand=Apple manufacturer=Apple modelName= modelId= osName=iOS osVersion=18.0 isDevice=false *
isPad=false isTV=false idiom=phone uiMode=normal systemName=iOS *'
expect ipad "$(run ZINC_PLATFORM=ios ZINC_DEVICE_MODEL=iPad6,7)" '*
type=TABLET brand=Apple manufacturer=Apple modelName=iPad Pro (12.9-inch) (1st generation) modelId=iPad6,7 osName=iPadOS *
isPad=true isTV=false idiom=pad uiMode=normal systemName=iPadOS Model=iPad Pro (12.9-inch) (1st generation) Brand=Apple'
expect ipad-quickjs "$(ZINC_PLATFORM=ios ZINC_DEVICE_MODEL=iPad6,7 "$ZINC" run main.tsx --engine quickjs 2>/dev/null | grep '^isPad=')" 'isPad=true isTV=false idiom=pad *'
expect iphone "$(run ZINC_PLATFORM=ios ZINC_DEVICE_MODEL=iPhone18,3)" '*type=PHONE * modelName=iPhone 17 modelId=iPhone18,3 *isPad=false*'
expect unknown "$(run ZINC_PLATFORM=ios ZINC_DEVICE_MODEL=iPad99,1)" '*type=TABLET * modelName= modelId=iPad99,1 *isPad=true*'
expect android "$(run ZINC_PLATFORM=android)" '*
type=PHONE brand= manufacturer= modelName= modelId= osName=Android osVersion=15 isDevice=false *
isPad=false isTV=false idiom=phone uiMode=normal systemName=Android *'
expect android-tablet "$(run ZINC_PLATFORM=android ZINC_DEVICE_TYPE=tablet ZINC_DEVICE_MODEL='Pixel Tablet')" '*type=TABLET * modelName=Pixel Tablet *
isPad=false isTV=false idiom=pad *'
expect android-tv "$(run ZINC_PLATFORM=android ZINC_DEVICE_TYPE=tv)" '*type=TV *
isPad=false isTV=true idiom=tv uiMode=tv *'
[ $fail -eq 0 ] && echo "device info: ok"
exit $fail
