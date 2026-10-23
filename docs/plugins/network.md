# zinc:network — the machine's connections and Wi-Fi

`plugins/network` (module `zinc:network`, pure Zinc, needs the permission `process`) tells a program how the machine is connected (its
interfaces, their state and IPv4 address, the Wi-Fi network joined) and lets it list, join and forget Wi-Fi networks. On Linux it drives
NetworkManager through `nmcli` (Raspberry Pi OS, Debian, Ubuntu, Fedora). Where `nmcli` is missing (macOS, Windows, a Linux without
NetworkManager), the status lists the addresses of `zinc:os` and the Wi-Fi calls answer `NOT_MANAGED`. Every call runs `nmcli` as a child
process: the program's frames go on while it answers. The player of the Pi image (`image/player`) uses it for its Wi-Fi settings.

```json
{ "permissions": ["process"] }
```

```ts
import * as network from 'zinc:network';

async function main(): Promise<void> {
  const status = await network.readStatus();
  console.log(status.wifiNetwork !== '' ? 'Wi-Fi: ' + status.wifiNetwork : status.isConnected() ? 'cable' : 'offline');
  const scan = await network.listWifiNetworks(true);      // true: a fresh scan (a few seconds)
  for (const wifi of scan.networks) console.log(wifi.ssid, wifi.signal, wifi.secured ? 'secured' : 'open');
  const error = await network.joinWifi('Atelier', 'correct horse');
  console.log(error === '' ? 'joined' : error);           // "Connection activation failed: Secrets were required, but not provided."
}
main();
```

| API | |
|---|---|
| `readStatus(): Promise<NetworkStatus>` | `managed` (NetworkManager answers), `interfaces`, `wifiNetwork` ('' when none); `isConnected()` (an interface has an address), `hasConnected(kind)`, `signature()` (changes when any of it changes) |
| `NetworkInterface` | `name` (eth0, wlan0), `kind` ('wifi', 'ethernet', NetworkManager's other types; 'other' without it), `state` ('connected', 'connecting', 'disconnected', 'unavailable', 'unmanaged'), `address` |
| `listWifiNetworks(rescan): Promise<WifiScan>` | `networks` (one per name: the strongest signal, the network joined first, then by signal; hidden networks left out) and `error` ('' when the scan worked) |
| `WifiNetwork` | `ssid`, `signal` (0 to 100), `secured`, `inUse` |
| `joinWifi(ssid, password): Promise<string>` | turns the Wi-Fi radio on and joins (`''` for an open network's password); resolves with '' once connected, else NetworkManager's reason |
| `forgetWifi(ssid): Promise<string>` | deletes its saved connections; '' or why not |
| `parseDeviceShow`, `parseActiveWifi`, `parseWifiList` | the parsers of nmcli's terse output, for tests |

NetworkManager decides who may change the network: as root, or as a user its polkit rules allow. The Pi image allows its user `zinc`
(`image/files/etc/polkit-1/rules.d/50-zinc-network.rules`). The password reaches `nmcli` as an argument, so another local user can read it
while `nmcli` runs. `image/player/dev/bin/nmcli` stands in for NetworkManager on a computer: it holds four networks, and "Atelier" takes
the password "correct horse" (`tests/t0/network_plugin.sh`).
