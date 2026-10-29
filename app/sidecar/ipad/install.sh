#!/bin/sh
# Puts build/SidecarScreen.app on the iPad or iPhone on the USB cable (ios-deploy: devicectl reaches only iOS 17 and later); then tap
# Sidecar on it (an app launched by the debugger here is closed with it).
# The first time: build.sh with the device plugged in (Xcode registers it in the team's profile), then Settings › Privacy & Security ›
# Developer Mode on the iPad (iPadOS 16), and trust the developer under Settings › General › VPN & Device Management.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
command -v ios-deploy >/dev/null || { echo "ipad/install.sh: needs ios-deploy (brew install ios-deploy)" >&2; exit 1; }
ios-deploy --bundle "$here/build/SidecarScreen.app" --no-wifi | grep -v "^\[ *[0-9]*%\] [A-Za-z]*$"
