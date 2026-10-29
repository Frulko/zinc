#!/bin/sh
# Puts build/sidecar-screen.apk on the Android device on the USB cable (adb, USB debugging on) and opens it.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
adb=${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb
command -v "$adb" >/dev/null || adb=adb
"$adb" install -r "$here/build/sidecar-screen.apk"
"$adb" shell am start -n dev.zinc.sidecar.screen/dev.zinc.sidecar.Screen
