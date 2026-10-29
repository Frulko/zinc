import { createSignal } from 'zinc:ui/solid';
import { Session, PairedDevice, PairingsSnapshot, ServerLiveSnapshot } from 'zinc:carplay';

const [server, setServer] = createSignal<ServerLiveSnapshot>({ deviceName: '', wireless: false, sessionActive: false, iap2Connected: false, gpsSubscribed: false, ultraTheme: false, clusterEnabled: false, autoInvite: false, uptimeSeconds: 0 });
const [serverReady, setServerReady] = createSignal<boolean>(false);
const [pairings, setPairings] = createSignal<PairingsSnapshot>({ devices: [], bluetoothAvailable: false });
const [pairingsReady, setPairingsReady] = createSignal<boolean>(false);
const [error, setError] = createSignal<string>('');
const [pending, setPending] = createSignal<string>('');
let live: Session | null = null;
let elapsed = 1;
let pairingsElapsed = 5;

export function tickDevices(session: Session, dt: number, visible: boolean): void {
  live = session;
  if (!visible) return;
  elapsed += dt;
  if (elapsed >= 1) {
    elapsed = 0;
    session.pollServer();
  }
  pairingsElapsed += dt;
  if (pairingsElapsed >= 5) {
    pairingsElapsed = 0;
    session.pollPairings();
  }
  setServerReady(session.serverInfo !== null);
  if (session.serverInfo !== null) setServer(session.serverInfo);
  setPairingsReady(session.pairings !== null);
  if (session.pairings !== null) setPairings(session.pairings);
  setError(session.pairingError);
}

function forget(id: string): void {
  if (pending() !== id) { setPending(id); return; }
  setPending('');
  const session = live;
  if (session === null || !session.forgetPairing(id)) setError('Récepteur déconnecté');
}

function batteryText(): string {
  const percent = server().batteryPercent;
  return percent == null ? 'non reçue' : `${percent}%`;
}

function modelText(): string {
  const code = server().phoneModel;
  if (code == null) return 'non reçu';
  const name = code === 'iPhone18,1' ? 'iPhone 17 Pro'
    : code === 'iPhone18,2' ? 'iPhone 17 Pro Max'
    : code === 'iPhone18,3' ? 'iPhone 17'
    : code === 'iPhone18,4' ? 'iPhone Air'
    : code === 'iPhone18,5' ? 'iPhone 17e' : '';
  return name === '' ? code : `${name} (${code})`;
}

function pairedName(device: PairedDevice): string {
  const current = server();
  if (current.sessionActive && (device.id === current.phoneDeviceId || device.id === current.phoneAirPlayPairingId))
    return `${current.phoneName ?? 'iPhone connecté'} · session active`;
  return device.name ?? 'Nom non enregistré';
}

function flag(value: boolean | null | undefined): string {
  return value == null ? 'inconnu' : value ? 'oui' : 'non';
}

export function DevicesPanel(): i32 {
  return <ScrollView className="grow bg-slate-950 p-6">
    <View className="flex-col gap-4">
      <Text className="text-2xl text-amber-200">Récepteur et appareils</Text>
      {!serverReady() ? <Text className="text-amber-200">Serveur indisponible ou statut en attente</Text> :
        <View className="flex-col gap-2 bg-slate-900 rounded p-4">
          <Text className="text-xl text-white">{server().deviceName} · {server().sessionActive ? 'CarPlay actif' : 'En attente d’iPhone'}</Text>
          <Text className="text-slate-300">{`Téléphone : ${server().phoneName ?? 'aucun'} · transport ${server().wireless ? 'sans fil' : 'filaire'} · en service depuis ${server().uptimeSeconds} s`}</Text>
          <Text className="text-slate-300">{`Modèle : ${modelText()} · batterie : ${batteryText()}`}</Text>
          <Text className="text-slate-300">{`Adresse Bluetooth / deviceID : ${server().phoneDeviceId ?? 'non reçue'} · Wi-Fi / macAddress : ${server().phoneWifiMac ?? 'non reçue'}`}</Text>
          <Text className="text-slate-300">{`Appairage AirPlay vérifié : ${server().phoneAirPlayPairingId ?? 'non reçu'}`}</Text>
          <Text className="text-slate-300">{`iAP2 ${server().iap2Connected ? 'connecté' : 'inactif'} · GPS externe ${server().gpsSubscribed ? 'demandé' : 'non demandé'} · cluster ${server().clusterEnabled ? 'annoncé' : 'désactivé'} · catalogue Ultra ${server().ultraTheme ? 'annoncé' : 'désactivé'}`}</Text>
          <Text className="text-slate-300">{`Invitation Bluetooth : ${server().autoInvite ? 'active' : 'en pause après suppression'}`}</Text>
          {!server().autoInvite ? <Button className="bg-cyan-900 rounded p-3" onClick={() => { const s = live; if (s !== null) s.resumePairing(); }}><Text className="text-cyan-100">Relancer la connexion</Text></Button> : null}
        </View>}
      <Text className="text-xl text-amber-200">Appareils appairés</Text>
      <Text className="text-slate-400">Chaque ligne est un identifiant exact. Bluetooth et AirPlay peuvent employer deux identifiants pour le même iPhone.</Text>
      {!pairingsReady() ? <Text className="text-slate-300">Liste en attente du serveur</Text> :
        <Text className="text-slate-400">{pairings().bluetoothAvailable ? 'Bluetooth inspecté sur le serveur' : 'Bluetooth indisponible sur ce serveur ; AirPlay seulement'}</Text>}
      {pairingsReady() && pairings().devices.length === 0 ? <Text className="text-slate-300">Aucun appareil enregistré</Text> : null}
      {pairingsReady() ? <For each={pairings().devices}>{(device: PairedDevice) =>
        <View className="flex-row items-center gap-3 bg-slate-900 rounded p-3">
          <View className="grow flex-col gap-1">
            <Text className="text-white">{`${pairedName(device)} · ${device.id}`}</Text>
            <Text className="text-slate-400">{`Bluetooth ${device.bluetooth ? 'oui' : 'non ou inconnu'} · AirPlay ${device.airPlay ? 'oui' : 'non'}`}</Text>
            {device.bluetooth ? <Text className="text-slate-400">{`Connecté ${flag(device.connected)} · confiance ${flag(device.trusted)} · lié ${flag(device.bonded)} · bloqué ${flag(device.blocked)}`}</Text> : null}
            {device.airPlay ? <Text className="text-slate-400">{`Clé AirPlay · empreinte SHA-256 ${device.airPlayKeyFingerprint ?? 'indisponible'}`}</Text> : null}
          </View>
          <Button className={pending() === device.id ? 'bg-red-700 rounded p-3' : 'bg-slate-700 rounded p-3'} onClick={() => forget(device.id)}><Text className="text-white">{pending() === device.id ? 'Confirmer' : 'Désappairer'}</Text></Button>
        </View>}</For> : null}
      {pending() !== '' ? <Button className="bg-slate-700 rounded p-3" onClick={() => setPending('')}><Text className="text-white">Annuler</Text></Button> : null}
      {error() !== '' ? <Text className="text-red-300">{error()}</Text> : null}
    </View>
  </ScrollView>;
}
