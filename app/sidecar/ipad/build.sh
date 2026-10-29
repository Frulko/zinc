#!/bin/sh
# The iPad's Sidecar screen: app/sidecar/ipad/build.sh [team] builds build/SidecarScreen.app for a device (Xcode, xcodegen), signed with
# the Apple Development team given (default: SIDECAR_TEAM, else the first Apple Development certificate's); install.sh puts it on the iPad.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
team=${1:-${SIDECAR_TEAM:-$(security find-certificate -c "Apple Development" -p 2>/dev/null | openssl x509 -noout -subject 2>/dev/null | sed -n 's/.*OU *= *\([A-Z0-9]\{10\}\).*/\1/p')}}
[ -n "$team" ] || { echo "ipad/build.sh: no Apple Development team: sign in to Xcode once, or pass the team ID" >&2; exit 1; }
cd "$here" && xcodegen generate --quiet
# the team's development profile covers the devices registered on it (Xcode 26 lists no iOS 16 device as a destination, so a new
# device is registered once from Xcode's Devices window or the developer site)
xcodebuild -project SidecarScreen.xcodeproj -scheme SidecarScreen -configuration Release -destination 'generic/platform=iOS' \
  -derivedDataPath build/dd -allowProvisioningUpdates DEVELOPMENT_TEAM="$team" -quiet build
rm -rf build/SidecarScreen.app && cp -R build/dd/Build/Products/Release-iphoneos/SidecarScreen.app build/
echo "built $here/build/SidecarScreen.app (team $team)"
