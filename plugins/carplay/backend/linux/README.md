# Wireless receiver on Linux / Raspberry Pi OS

The JVM receiver can use the BlueZ RFCOMM bridge in this directory, selected by
`backend/run` on Linux. Wi-Fi carries projection after classic Bluetooth iAP2
handover; BLE does not carry this handshake. No Linux wired USB adapter is
provided by this overlay. Native Zinc media dependencies remain FFmpeg.

Install JDK 21 or newer (the receiver targets JVM 21), BlueZ, Python 3,
PyBluez, python3-dbus and python3-gi. On Debian/Raspberry Pi OS, install
`bluez python3-bluez python3-dbus python3-gi`. Pair and trust
the iPhone with the system Bluetooth settings or `bluetoothctl`; the optional
address-restricted agent confirms the phone's pairing request. Supply the Wi-Fi network the phone should join; use
an existing network or an OS-configured access point. The plugin does not change
system hotspot configuration. The Linux helper reads its local adapter address
from `bluetoothctl show`, so the adapter must be powered on.

On Linux, start `plugins/carplay/backend/linux/carplay-advertise --name 'PlayPort'` while the receiver
runs. It registers the accessory CarPlay UUID through BlueZ, so BlueZ includes
that UUID and the distinct iAP2 accessory UUID in its Classic Bluetooth
Extended Inquiry Response and SDP. The bridge opens an outgoing RFCOMM channel
to the iPhone's iAP2 service; the phone's service UUID ends in `cafe`, while
the accessory's ends in `caff`. The advertiser also makes the
adapter discoverable and pairable, then restores its previous state on exit.
For a headless receiver, add `--pairing-address AA:BB:CC:DD:EE:FF` to register
a temporary BlueZ `NoInputNoOutput` agent that accepts pairing only from that
phone. Without it, use an existing system pairing agent. The Pi launcher below
sets this address; it removes the agent on exit.
The Pi launcher below starts and stops this helper automatically.

From the Zinc checkout, after installing dependencies and provisioning your own
runtime identity outside the checkout:

```sh
plugins/carplay/backend/build
plugins/carplay/backend/linux/bt-bridge --list
ZINC_CARPLAY_WIFI_PASSPHRASE='NETWORK_SECRET' \
ZINC_CARPLAY_IDENTITY=/path/to/identity plugins/carplay/backend/run --wireless \
  --bt-address AA:BB:CC:DD:EE:FF \
  --wifi-ssid 'NETWORK' --wifi-channel 36 \
  --bind 192.168.1.50 --airplay-port 17000 --http-port 18080 --token LOCAL_TOKEN
```

Replace bind with the receiver's Wi-Fi address. Allow the receiver's AirPlay and
negotiated media ports on the local network. The viewer connects to
`ws://RECEIVER_IP:18080/ws?token=LOCAL_TOKEN`. The environment variable supplies
the passphrase without placing it in the process command line; an explicit
`--wifi-passphrase` still overrides it. Wireless state defaults to
`~/.local/share/zinc/carplay-experiment/wireless-state`, separate from the
root-owned wired USB state. On macOS, the same wireless options
select the existing IOBluetooth bridge; grant Bluetooth access to the launching
terminal if requested. No `sudo` is needed for the macOS wireless path.

For the prepared Mac on `Potatoes` (channel 36), the iPhone is already paired
with the Mac Bluetooth adapter. Run from this worktree, with the Pi receiver
stopped. Its Wi-Fi password can be read from the Pi's existing NetworkManager
profile into an environment variable without printing it:

```sh
ZINC_CARPLAY_WIFI_PASSPHRASE=$(ssh spark@192.168.2.33 \
  'sudo -n nmcli --show-secrets -g 802-11-wireless-security.psk connection show Potatoes') \
ZINC_CARPLAY_IDENTITY="$HOME/.local/share/zinc/carplay-experiment/identity" \
plugins/carplay/backend/run --wireless --device-name 'PlayPort Mac' \
  --bt-address B8:01:1F:5F:98:10 --wifi-ssid Potatoes --wifi-channel 36 \
  --bind "$(ipconfig getifaddr en0)" --airplay-port 17000 --http-port 18080 \
  --token zinc-usb-test
```

The Mac's separate wireless state is writable without `sudo`. This command
will attempt the real Bluetooth/iAP2 connection, so use it when the iPhone is
available for the physical test.

### Prepared Pi 3B+ at 192.168.2.33

The owner-authorized Pi has Debian 13, Java 21, BlueZ/PyBluez/D-Bus and the separately
built receiver under `~/zinc-carplay`. Its local identity and AP password are in
owner-only files; neither is in Git. A NetworkManager profile `zinc-carplay-ap`
provides the 5 GHz AP `Zinc-CarPlay-Pi` on `ap0`/`10.77.0.1`; DHCP and DNS were
observed while it was active. The private launcher recreates `ap0`, activates
it, announces the CarPlay and iAP2 Bluetooth UUIDs,
and restores Bluetooth/AP state when stopped:

```sh
ssh spark@192.168.2.33 'bluetoothctl show | grep -E "Powered:|Pairable:"'
ssh spark@192.168.2.33 '~/zinc-carplay/start-wireless'
```

On 29 October the phone re-paired and was trusted on the Pi; the RFCOMM bridge,
iAP2 authentication, Wi-Fi handoff and AirPlay video/audio projection succeeded.
If the launcher is already running,
do not start a second copy. To keep a private log while restarting it, stop the
existing launcher, then start it with `ZINC_CARPLAY_IAP2_TRACE=1` and redirect
its output to an owner-only file. A second Mac terminal can follow that file
with `ssh spark@192.168.2.33 'tail -F ~/zinc-carplay/logs/wireless.log'`.
Start only one of the Mac and Pi receivers while testing the same phone. To
view the Pi from the Mac:

```sh
PI_TOKEN=$(ssh spark@192.168.2.33 'cat ~/.config/zinc-carplay/token')
ZINC_CARPLAY_URL="ws://192.168.2.33:18080/ws?token=$PI_TOKEN" \
  ZINC="$PWD/build/zinc" ZINC_BACKGROUND=0 examples/carplay/run --live
```

For the current direct Ethernet test, the Mac's `en12` has `169.254.133.75`
and the Pi's `eth0` has `169.254.23.158`; the Pi has a temporary host route
back to the Mac. The same SSH key works on both addresses. `wlan0` is
disconnected from `Potatoes`, while `ap0` remains the 5 GHz CarPlay AP. The
receiver is already running with private iAP2 traces in
`~/zinc-carplay/logs/wireless.log`. Use two Mac terminals:

```sh
# Terminal 1: live Pi log
ssh -t -b 169.254.133.75 spark@169.254.23.158 \
  'tail -F ~/zinc-carplay/logs/wireless.log'

# Terminal 2, from this Zinc worktree: native viewer over Ethernet
PI_TOKEN=$(ssh -b 169.254.133.75 spark@169.254.23.158 \
  'cat ~/.config/zinc-carplay/token')
ZINC="$PWD/build/zinc" ZINC_BACKGROUND=0 ZINC_CARPLAY_DEBUG=1 \
  ZINC_CARPLAY_URL="ws://169.254.23.158:18080/ws?token=$PI_TOKEN" \
  examples/carplay/run --live
```

After changing the Zinc viewer's audio buffer, restart only this Terminal 2
command. Leave the Pi receiver running; its wireless session can reconnect.

Select **PlayPort Pi** under iPhone Settings > General > CarPlay. The current
Ethernet address/route is session-local and may change after a reboot. Do not
start a second Pi receiver while the logged one is running.
The profile now announces both the CarPlay and iAP2 accessory UUIDs. A failed
outgoing RFCOMM connect is logged as `Connection refused`; that is before iAP2
authentication or Wi-Fi handoff. The Pi keeps the live log and private Bluetooth
capture separate from the Ethernet viewer link.
If the phone reports connection impossible while the Pi still says `Paired: yes`,
capture the HCI authentication status. `PIN or Key Missing` means the two sides
have different saved Bluetooth link keys: forget PlayPort Pi in iPhone CarPlay
and Bluetooth settings, remove only that iPhone from the Pi with
`bluetoothctl remove <iPhone Bluetooth address>`, then pair again. The current
Pi pairing was cleared once after this status was observed; the subsequent
fresh pairing completed and wireless CarPlay connected.

`python3 linux/tests/bridge.py` passes on the Mac, and the Pi helper reports
its actual Bluetooth address. The Pi advertiser was observed with its CarPlay
UUID, discoverable/pairable state and temporary name in `bluetoothctl show`;
all three reverted after SIGTERM. Mac and Pi receiver smoke runs reached HTTP and
AirPlay startup with software identity; the Pi also answered a WebSocket
`iap2Status` request from the Mac while bound to its AP address. The live phone
completed Bluetooth iAP2 authentication, requested Wi-Fi configuration and
associated with the AP; RTSP projection has not started. Apple's [wireless CarPlay architecture overview](https://developer.apple.com/videos/play/wwdc2017/717/)
also calls for AP information elements; the generic NetworkManager AP is not
yet known to supply those Apple-specific elements. iPhone discovery/handoff
remains to be tested.
