#!/bin/sh
# Builds "Zinc Atelier.app" (icon, name, identity from zinc.json) in build/, for this machine:
#   sh app/atelier/package-macos.sh        then open "app/atelier/build/Zinc Atelier.app", or drag it to the Dock
# ponytail: the bundle holds Atelier only. It finds the engine (zinc, the standard library, the plugins, its examples) in this checkout through
# ZINC_BIN, written with this shell's PATH in the bundle's LSEnvironment, so it does not run on another machine; its texts too (i18n/ of the
# checkout, which zinc:i18n finds next to lib/std). A bundle that carries the engine comes with the
# prebuilt engine (ZN-718).
set -e
here=$(cd "$(dirname "$0")" && pwd)
zinc=${ZINC:-$here/../../build/zinc}
app="$here/build/Zinc Atelier.app"
"$zinc" build --bundle "$here" -o "$app"
# an app started from the Finder gets the system's bare PATH: without the PATH of this shell, zinc finds neither cmake nor the compilers its builds call
plutil -replace LSEnvironment -json "{\"ZINC_BIN\":\"$(cd "$(dirname "$zinc")" && pwd)/zinc\",\"PATH\":\"$PATH\"}" "$app/Contents/Info.plist"
codesign --force --sign - --identifier dev.zinc.atelier "$app"   # the plist changed: sign again
echo "wrote $app"
