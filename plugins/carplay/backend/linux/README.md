# Wireless receiver on Linux / Raspberry Pi OS

The JVM receiver can use the BlueZ RFCOMM bridge in this directory, selected by
`backend/run` on Linux. Wi-Fi carries projection after classic Bluetooth iAP2
handover; BLE does not carry this handshake. No Linux wired USB adapter is
provided by this overlay. Native Zinc media dependencies remain FFmpeg.

Install JDK 21 or newer (the receiver targets JVM 21), BlueZ, Python 3,
PyBluez, python3-dbus and python3-gi. On Debian/Raspberry Pi OS, install
`bluez python3-bluez python3-dbus python3-gi`. Pair and trust
the iPhone with the system Bluetooth settings or `bluetoothctl`; the helper does
not silently pair devices. Supply the Wi-Fi network the phone should join; use
an existing network or an OS-configured access point. The plugin does not change
system hotspot configuration. The Linux helper reads its local adapter address
from `bluetoothctl show`, so the adapter must be powered on.

On Linux, start `plugins/carplay/backend/linux/carplay-advertise --name 'PlayPort'` while the receiver
runs. It registers the accessory CarPlay UUID through BlueZ, so BlueZ includes
the UUID in its Classic Bluetooth Extended Inquiry Response. It also makes the
adapter discoverable and pairable, then restores its previous state on exit.
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
owner-only files; neither is in Git. The Pi stays connected to `Potatoes` on
5 GHz/channel 36. A NetworkManager profile `zinc-carplay-ap` provides a second,
simultaneous 5 GHz AP `Zinc-CarPlay-Pi` on `ap0`/`10.77.0.1`; DHCP and DNS were
observed while it was active. The AP is off after pretesting and the private
launcher recreates `ap0`, activates it, announces the CarPlay Bluetooth UUID,
and restores Bluetooth/AP state when stopped:

```sh
ssh spark@192.168.2.33 'bluetoothctl show | grep -E "Powered:|Pairable:"'
ssh spark@192.168.2.33 '~/zinc-carplay/start-wireless'
```

The Pi Bluetooth adapter is powered, but the iPhone is not paired to it. For
the first real test, open iPhone **Settings > Bluetooth**, then run
`ssh -t spark@192.168.2.33 bluetoothctl` and enter `agent on`, `default-agent`,
`pairable on`, `scan on`. If the phone appears, `pair PHONE_ADDRESS` and
`trust PHONE_ADDRESS`, accepting the matching iPhone prompt. The launcher
targets the phone address previously observed on the Mac. If iOS rotates or
hides that address, override it with `--bt-address NEW_ADDRESS`. Start only one
of the Mac and Pi receivers while testing the same phone. To view the Pi from
the Mac:

```sh
PI_TOKEN=$(ssh spark@192.168.2.33 'cat ~/.config/zinc-carplay/token')
ZINC_CARPLAY_URL="ws://192.168.2.33:18080/ws?token=$PI_TOKEN" \
  ZINC="$PWD/build/zinc" ZINC_BACKGROUND=0 examples/carplay/run --live
```

`python3 linux/tests/bridge.py` passes on the Mac, and the Pi helper reports
its actual Bluetooth address. The Pi advertiser was observed with its CarPlay
UUID, discoverable/pairable state and temporary name in `bluetoothctl show`;
all three reverted after SIGTERM. Mac and Pi receiver smoke runs reached HTTP and
AirPlay startup with software identity; the Pi also answered a WebSocket
`iap2Status` request from the Mac while bound to its AP address. No iPhone
Bluetooth pairing, SDP, Wi-Fi handoff, projected media or MFi challenge was
performed on the Pi. Apple's [wireless CarPlay architecture overview](https://developer.apple.com/videos/play/wwdc2017/717/)
also calls for AP information elements; the generic NetworkManager AP is not
yet known to supply those Apple-specific elements. iPhone discovery/handoff
remains to be tested.
