# Wireless receiver on Linux / Raspberry Pi OS

The JVM receiver can use the BlueZ RFCOMM bridge in this directory, selected by
`backend/run` on Linux. Wi-Fi carries projection after classic Bluetooth iAP2
handover; BLE does not carry this handshake. No Linux wired USB adapter is
provided by this overlay. Native Zinc media dependencies remain FFmpeg.

Install JDK 21 or newer (the receiver targets JVM 21), BlueZ, Python 3 and
PyBluez (`bluez` and `python3-bluez` packages on Raspberry Pi OS). Pair and trust
the iPhone with the system Bluetooth settings or `bluetoothctl`; the helper does
not silently pair devices. Supply the Wi-Fi network the phone should join; use
an existing network or an OS-configured access point. The plugin does not change
system hotspot configuration.

From the Zinc checkout, after installing dependencies and provisioning your own
runtime identity outside the checkout:

```sh
plugins/carplay/backend/build
plugins/carplay/backend/linux/bt-bridge --list
ZINC_CARPLAY_IDENTITY=/path/to/identity plugins/carplay/backend/run --wireless \
  --bt-address AA:BB:CC:DD:EE:FF \
  --wifi-ssid 'NETWORK' --wifi-passphrase 'PASSWORD' \
  --bind 192.168.1.50 --airplay-port 17000 --http-port 18080 --token LOCAL_TOKEN
```

Replace bind with the receiver's Wi-Fi address. Allow the receiver's AirPlay and
negotiated media ports on the local network. The viewer connects to
`ws://127.0.0.1:18080/ws?token=LOCAL_TOKEN`. On macOS, the same wireless options
select the existing IOBluetooth bridge; grant Bluetooth access to the launching
terminal if requested. No `sudo` is needed for the macOS wireless path.

Validation: `python3 linux/tests/bridge.py` checks address validation and binary
stdio in both directions using a socket pair on the development Mac. It does
not verify BlueZ SDP, pairing, radio connectivity, Wi-Fi handover, performance,
or Raspberry Pi video/audio. Physical macOS wireless and Pi acceptance remain
pending. No ARM/Linux build was run during this Mac session.
