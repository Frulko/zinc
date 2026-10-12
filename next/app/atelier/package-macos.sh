#!/bin/sh
# Builds "Zinc Atelier.app" (icon, name, identity from zinc.json) in build/, for this machine:
#   sh next/app/atelier/package-macos.sh        then open "next/app/atelier/build/Zinc Atelier.app", or drag it to the Dock
# ponytail: the bundle holds Atelier only. It finds the engine (zinc, the standard library, the plugins, its examples) in this checkout through
# ZINC_BIN, written in the bundle's LSEnvironment, so it does not run on another machine. A bundle that carries the engine comes with the
# prebuilt engine (ZN-718).
set -e
here=$(cd "$(dirname "$0")" && pwd)
zinc=${ZINC:-$here/../../build/zinc}
app="$here/build/Zinc Atelier.app"
"$zinc" build --bundle "$here" -o "$app"
plutil -replace LSEnvironment -json "{\"ZINC_BIN\":\"$(cd "$(dirname "$zinc")" && pwd)/zinc\"}" "$app/Contents/Info.plist"
codesign --force --sign - --identifier dev.zinc.atelier "$app"   # the plist changed: sign again
echo "wrote $app"
