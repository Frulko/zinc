#!/bin/sh
# Isolated wired backend checks. Cold dependency/build setup belongs to backend/build.
set -eu
if [ "$(uname -s)" != Darwin ]; then
  echo 'SKIP: the USB host adapter is currently macOS-only'
  exit 77
fi
root=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
backend="$root/build/carplay/playport"
export ZINC_CARPLAY_USB_LIBRARY="$root/build/carplay/usb/libcarplay_usb.dylib"
if [ ! -f "$ZINC_CARPLAY_USB_LIBRARY" ] || [ ! -x "$backend/server/build/install/server/bin/server" ]; then
  echo 'SKIP: build the separate receiver with plugins/carplay/backend/build first'
  exit 77
fi
python3 "$root/plugins/carplay/backend/usb/tests/checkout_state.py"
python3 "$root/plugins/carplay/backend/usb/tests/prepare.py" "$backend"
"$root/build/carplay/usb/carplay_usb_descriptors"
"$root/plugins/carplay/backend/usb/checkout-state" "$backend" verify
(cd "$backend" && ./gradlew --no-daemon --max-workers=2 :protocol:test \
  --tests '*Usb*' --tests '*Ncm*' --tests '*Ntb16*' --tests '*EthernetIpv6*' \
  --tests '*Iap2FileTransfer*' --tests '*Iap2LinkEngineFileTransfer*' --tests '*Iap2Wired*' --tests '*Iap2ControlDeadline*' --tests '*AirPlayAppearanceTest*' --tests '*Iap2Location*' \
  :server:test --tests '*TlsCertificateUsbTest*' --tests '*CarPlayAudioCapabilitiesTest*' --tests '*MicUplinkWireTest*' --tests '*DebugGpsProviderTest*' --tests '*DebugTelemetryTest*' --tests '*DebugGpsRoutingTest*' --tests '*ClusterWireDimensionsTest*' --tests '*ArtworkFrameTest*' --tests '*Iap2LiveTraceTest*')
"$root/plugins/carplay/backend/run" --usb-list
