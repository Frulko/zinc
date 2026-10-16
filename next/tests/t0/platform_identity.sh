#!/bin/sh
# Platform identity (docs/reports/mobile-native-feel.md item 1): platform(), Platform.OS, Version, select, zinc:platform TARGET, the
# behaviour profile and the `x.android.ts` / `x.ios.ts` files under ZINC_PLATFORM=android|ios, and the desktop's own answers without it.
cd "$(dirname "$0")/../golden/platform-identity" || exit 2
fail=0
check() {   # $1 the platform forced ('' none), $2 the line expected (a pattern)
  got=$(ZINC_PLATFORM=$1 ZINC_PLATFORM_VERSION= "$ZINC" run main.tsx 2>/dev/null | tail -1)
  case "$got" in $2) ;; *) echo "platform_identity: ZINC_PLATFORM=$1 printed '$got', want '$2'"; fail=1 ;; esac
}
check android 'platform=android OS=android Version=35 TARGET=android select=android default=default style=android coarse=true file=which.android.ts'
check ios 'platform=ios OS=ios Version=18.0 TARGET=ios select=ios default=default style=ios coarse=true file=which.ios.ts'
host=$(uname -s | sed 's/Darwin/macos/;s/Linux/linux/')
check '' "platform=$host OS=$host Version=* TARGET=$host select=native default=default style=desktop coarse=false file=which.ts"
got=$(ZINC_PLATFORM=android "$ZINC" run --interp main.tsx 2>/dev/null | tail -1)
case "$got" in *"OS=android"*"file=which.android.ts") ;; *) echo "platform_identity: the interpreter printed '$got'"; fail=1 ;; esac
[ $fail -eq 0 ] && echo "platform identity: ok"
exit $fail
