#!/bin/sh
# zinc:network (plugins/network) against the pretend NetworkManager of image/player/dev/bin/nmcli: the status (eth0
# connected, wlan0 not, loopback left out), the scan (one entry per name, strongest signal, open and secured), a wrong
# password's sentence, a join that shows in the status, forgetting it twice; then with no nmcli on the PATH, a status
# from zinc:os and Wi-Fi calls answering NOT_MANAGED.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
root=$(pwd)
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/app/plugins"
ln -s "$root/plugins/network" "$tmp/app/plugins/network"
cat >"$tmp/app/zinc.json" <<'EOF'
{ "name": "network-test", "entry": "main.ts", "permissions": ["process"] }
EOF
cat >"$tmp/app/main.ts" <<'EOF'
import * as network from 'zinc:network';

function show(status: network.NetworkStatus): string {
  const parts: string[] = [];
  for (const nic of status.interfaces) parts.push(nic.name + '/' + nic.kind + '/' + nic.state + '/' + nic.address);
  return (status.managed ? 'managed' : 'unmanaged') + ' wifi=' + status.wifiNetwork + ' ' + parts.join(' ');
}

async function main(): Promise<void> {
  console.log('status ' + show(await network.readStatus()));
  const scan = await network.listWifiNetworks(true);
  const names: string[] = [];
  for (const wifi of scan.networks) names.push(wifi.ssid + ':' + wifi.signal + ':' + (wifi.secured ? 'secured' : 'open') + (wifi.inUse ? ':in-use' : ''));
  console.log('scan ' + names.join(',') + ' error=' + scan.error);
  console.log('wrong ' + (await network.joinWifi('Atelier', 'not it')));
  console.log('join [' + (await network.joinWifi('Atelier', 'correct horse')) + ']');
  console.log('joined ' + show(await network.readStatus()));
  console.log('forget [' + (await network.forgetWifi('Atelier')) + ']');
  console.log('again ' + (await network.forgetWifi('Atelier')));
}
main();
EOF
out=$(cd "$tmp/app" && PATH="$root/image/player/dev/bin:$PATH" ZINC_FAKE_PI="$tmp/pi" timeout 60 "$Z" run main.ts 2>&1)
expect() { # expect <line>
  echo "$out" | grep -qxF "$1" || { echo "network_plugin: no line \"$1\" in:"; echo "$out" | tail -12; exit 1; }
}
expect "status managed wifi= eth0/ethernet/connected/192.168.2.40 wlan0/wifi/disconnected/"
expect "scan Atelier:82:secured,Maison:64:secured,Cafe libre:40:open,Voisin 5G:30:secured error="
expect "wrong Connection activation failed: Secrets were required, but not provided."
expect "join []"
expect "joined managed wifi=Atelier eth0/ethernet/connected/192.168.2.40 wlan0/wifi/connected/192.168.2.41"
expect "forget []"
expect "again No saved connection to \"Atelier\"."
grep -q -- '--wait 45 device wifi connect Atelier password correct horse' "$tmp/pi/calls.log" || { echo "network_plugin: the join did not reach nmcli"; exit 1; }

cat >"$tmp/app/main.ts" <<'EOF'
import * as network from 'zinc:network';
async function main(): Promise<void> {
  const status = await network.readStatus();
  console.log('managed ' + status.managed + ' ' + (status.interfaces.length > 0 ? 'addresses' : 'none'));
  console.log('join ' + (await network.joinWifi('Atelier', 'correct horse')));
}
main();
EOF
out=$(cd "$tmp/app" && timeout 60 env PATH=/usr/bin:/bin "$Z" run main.ts 2>&1)
echo "$out" | grep -qE '^managed false (addresses|none)$' || { echo "network_plugin: without nmcli: $(echo "$out" | tail -5)"; exit 1; }
expect "join Wi-Fi is not managed by Zinc on this system (it needs NetworkManager)."
echo "network_plugin: ok"
