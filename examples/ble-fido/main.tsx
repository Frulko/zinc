// Démo GUI : appairer une clé FIDO1 (U2F) en Bluetooth depuis le Mac, puis enchaîner enregistrements et authentifications.
//   build/zinc run examples/ble-fido     (depuis le checkout zinc, dans un terminal qui a l'accès Bluetooth)
// Le travail BLE est fait par bridge.swift (CoreBluetooth), une session qui reste connectée : l'app lui envoie des commandes
// sur stdin (register / auth / version) et lit ses lignes (STATE / OP / OK / ERR). Les enregistrements vivent en mémoire.
// ponytail: les credentials ne sont pas sauvegardés sur disque ; ajouter un fichier si on veut les garder d'un lancement à l'autre.
import { createSignal, render, For, Show, NodeRef } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import * as proc from 'zinc:process';

class Entry {
  text: string; kind: i32;   // 0 info, 1 succès, 2 erreur
  constructor(text: string, kind: i32) { this.text = text; this.kind = kind; }
}
class Cred {
  n: i32; kh: string; pub: string;
  constructor(n: i32, kh: string, pub: string) { this.n = n; this.kh = kh; this.pub = pub; }
}

const MAX_ENTRIES = 200;
// 0 = arrêté, 1 = recherche, 2 = trouvée/appairage, 3 = connectée, -1 = erreur
const [phase, setPhase] = createSignal<i32>(0);
const [busy, setBusy] = createSignal<boolean>(false);
const [touch, setTouch] = createSignal<boolean>(false);
const [pairing, setPairing] = createSignal<boolean>(false);
const [keyName, setKeyName] = createSignal<string>('');
const [errMsg, setErrMsg] = createSignal<string>('');
const [mode, setMode] = createSignal<string>('');      // mode annoncé par la clé : 'pairing' | 'normal'
const [stepA, setStepA] = createSignal<i32>(0);       // 1. appairage            : 0 à faire, 1 en cours, 2 réussi, -1 échec
const [stepB, setStepB] = createSignal<i32>(0);       // 2. reconnexion (appui court, sans réappairer)
const [usb, setUsb] = createSignal<boolean>(false);   // transport USB (libfido2) au lieu du BLE
const [elapsed, setElapsed] = createSignal<i32>(0);   // secondes depuis la connexion : la clé coupe seule vers 14 s
let connAt = 0;
let autoSeq = false;   // séquence rapide : enregistrement puis 2 authentifications, enchaînés sans attendre
let autoN = 0;
let attempt = 0;       // étape en cours (1 ou 2)
let verify = false;    // « version » envoyée d'office pour valider que le lien chiffré fonctionne
let lastDbg = '';
let t0 = 0;           // début de la connexion en cours, pour horodater l'historique      // dernier diagnostic du pont (motif de coupure)
const [entries, setEntries] = createSignal<Entry[]>([]);
const [creds, setCreds] = createSignal<Cred[]>([]);
let current: proc.Process | null = null;
let buf: Entry[] = [];
let follow = 0;
let seen = 0;        // numérotation des enregistrements
const log = new NodeRef();

function note(text: string, kind: i32): void {
  buf.push(new Entry('[' + Math.round((Date.now() - t0) / 1000) + ' s] ' + text, kind));
  if (buf.length > MAX_ENTRIES) buf = buf.slice(buf.length - MAX_ENTRIES);
  setEntries(buf.slice());
  follow = 2;
}
function done(): void { setBusy(false); setTouch(false); setPairing(false); }
function curStep(): i32 { return attempt === 1 ? stepA() : (attempt === 2 ? stepB() : 0); }
function setStep(v: i32): void { if (attempt === 1) setStepA(v); else if (attempt === 2) setStepB(v); }
function why(): string {
  if (lastDbg.includes('code=14')) return 'La clé a supprimé l\'appairage (« peer removed pairing information »). Refaites l\'étape 1.';
  if (attempt === 2) return 'Impossible sur ce Mac : macOS refuse de mémoriser l\'appairage de cette clé (elle utilise la clé de test Bluetooth « debug LTK »). Il faut réappairer à chaque session. ' + lastDbg;
  return 'Connexion perdue. ' + lastDbg;
}
function fail(msg: string): void { if (curStep() === 1) setStep(-1); verify = false; done(); setPhase(-1); setErrMsg(msg); }
function send(cmd: string): void {
  if (current === null || phase() !== 3 || busy()) return;
  setBusy(true);
  current.write(cmd + '\n');
}

// Lit une ligne du pont et met l'interface à jour.
function parse(l: string): void {
  if (l.startsWith('STATE scan')) { setPhase(1); return; }
  if (l.startsWith('STATE connected')) { connAt = Date.now(); setElapsed(0); note('Connexion établie…', 0); return; }
  if (l.startsWith('STATE waiting')) { setPhase(1); setMode('normal'); note('Clé détectée en mode NORMAL : en attente du mode appairage.', 0); return; }
  if (l.startsWith('STATE known')) { setPhase(1); setKeyName(l.slice(12)); note('Clé déjà appairée (' + l.slice(12) + ') : appuyez sur son bouton pour la réveiller.', 0); return; }
  if (l.startsWith('STATE found')) {
    const t = l.split(' '); setPhase(2); setKeyName(t[2]); setMode(t.length > 3 ? t[3] : '');
    note(t[3] === 'usb' ? 'Clé USB trouvée : ' + t[2] : 'Clé trouvée : ' + t[2] + ' en ' + (t[3] === 'pairing' ? 'mode appairage' : 'mode normal') + ' (' + l.slice(l.indexOf('flags=')) + ')', 0);
    return;
  }
  if (l.startsWith('STATE ready')) { setPhase(3); note('Connectée.', 1); if (autoSeq) { send('register'); } else if (attempt !== 0) { verify = true; send('version'); } return; }
  if (l.startsWith('DBG ')) { lastDbg = l.slice(4); note('Diagnostic : ' + lastDbg, 0); return; }
  if (l.startsWith('STATE lost')) { note('Connexion perdue.', 2); fail(why()); return; }
  if (l.startsWith('OP pairing')) { setPairing(true); return; }
  if (l.startsWith('OP ')) { setPairing(false); setTouch(true); return; }
  if (l.startsWith('OK register ')) {
    const p = l.split(' ');
    seen++;
    setCreds(creds().concat([new Cred(seen, p[3], p[2])]));
    note('Enregistrement #' + seen + ' : clé publique ' + p[2].slice(0, 16) + '…, key handle de ' + (p[3].length / 2) + ' octets', 1);
    done();
    if (autoSeq) { if (curStep() === 1) setStep(2); send('auth ' + p[3] + ' ' + p[2]); }
    return;
  }
  if (l.startsWith('OK auth ')) {
    const valid = l.includes('VALIDE') && !l.includes('INVALIDE');
    const counter = l.split('counter=')[1].split(' ')[0];
    const txt = 'compteur ' + counter + ', signature ' + (valid ? 'valide' : 'INVALIDE');
    note('Authentification : ' + txt, valid ? 1 : 2);
    done();
    if (autoSeq) {
      autoN++;
      const c = creds()[creds().length - 1];
      if (autoN < 2 && valid) send('auth ' + c.kh + ' ' + c.pub);
      else { autoSeq = false; note('SÉQUENCE TERMINÉE en ' + elapsed() + ' s.', 1); }
    }
    return;
  }
  if (l.startsWith('OK version ')) {
    note('Version U2F : ' + l.slice(11), 1); done();
    if (verify) { verify = false; setStep(2); note(attempt === 1 ? 'ÉTAPE 1 RÉUSSIE : clé appairée, lien chiffré OK. Passez à l\'étape 2 (déconnecter, puis appui court).' : 'ÉTAPE 2 RÉUSSIE : reconnexion en mode normal SANS réappairer.', 1); }
    return;
  }
  if (l.startsWith('ERR ')) {
    note(l.slice(4), 2);
    if (verify || phase() !== 3) fail(l.slice(4)); else done();
    return;
  }
  note(l, 0);   // tout le reste (ex. « nouvelle tentative ») apparaît tel quel
}

function connect(n: i32): void {
  if (current !== null) current.kill(9);
  setUsb(n === 3); t0 = Date.now(); attempt = n === 3 ? 0 : (n === 4 ? 1 : n); autoSeq = n === 4; autoN = 0; connAt = 0; setElapsed(0); verify = false; lastDbg = ''; setMode(''); setKeyName(''); setErrMsg(''); done(); setPhase(1);
  if (n === 3) { buf = []; setEntries([]); setCreds([]); seen = 0; setStepA(0); setStepB(0); }
  else if (n === 1 || n === 4) { buf = []; setEntries([]); setCreds([]); seen = 0; setStepA(1); setStepB(0); }
  else { setStepB(1); note('— Étape 2 : reconnexion en mode normal —', 0); }
  // compile si besoin, puis lance le pont (il attend la clé jusqu'à 4 min)
  const script = '[ /tmp/ble-fido-demo -nt examples/ble-fido/bridge.swift ] || swiftc -O -o /tmp/ble-fido-demo examples/ble-fido/bridge.swift; exec /tmp/ble-fido-demo';
  try {
    const p = n === 3 ? proc.spawn('python3', ['examples/ble-fido/usb.py'], {}) : proc.spawn('sh', ['-c', script], {});
    current = p;
    p.onStdout((l: string) => { parse(l); });
    p.onStderr((l: string) => { note(l, 2); });
    p.onExit((code: i32) => {
      if (current === p) current = null;
      done();
      if (phase() > 0 && !(phase() === 3 && curStep() === 2)) fail(errMsg() === '' ? 'Le pont BLE s\'est arrêté (code ' + code + '). ' + lastDbg : errMsg());
    });
  } catch (e) { note(e.message, 2); setPhase(-1); setErrMsg('Impossible de lancer le pont BLE.'); }
}
function disconnect(): void { if (current !== null) { current.write('quit\n'); current.kill(); } setPhase(0); done(); }
function guide(): string {
  if (phase() === 0) return 'Cliquez sur « Séquence rapide », puis MAINTENEZ le bouton de la clé jusqu\'au clignotement. Tout doit tenir en ~14 s : soyez prêt à toucher la clé deux ou trois fois.';
  if (phase() === 1 && usb()) return 'Branchez la clé en USB (directement sur le Mac). Aucun appairage : un toucher valide chaque opération.';
  if (phase() === 1 && mode() === 'normal') return 'Clé détectée en mode NORMAL : maintenez le bouton (3 s) jusqu\'au clignotement rapide pour passer en appairage. Je me connecte dès que c\'est le cas.';
  if (phase() === 1) return attempt === 2 ? 'Étape 2 : appuyez BRIÈVEMENT sur le bouton de la clé (sans maintenir)…' : 'Étape 1 : MAINTENEZ le bouton de la clé jusqu\'au clignotement (mode appairage)…';
  if (phase() === 2) return 'Clé trouvée : acceptez la fenêtre d\'appairage de macOS si elle apparaît.';
  if (phase() === -1) return errMsg();
  if (touch() && autoSeq) return 'TOUCHEZ LA CLÉ maintenant !  (' + (creds().length === 0 ? 'enregistrement' : 'authentification ' + (autoN + 1) + '/2') + ')';
  if (pairing()) return 'Acceptez la fenêtre d\'appairage de macOS (code ou bouton sur la clé)…';
  if (touch()) return 'Touchez la clé quand elle clignote…';
  if (busy()) return 'Opération en cours…';
  return 'Connectée. Enregistrez une clé, puis authentifiez-la autant de fois que vous voulez.';
}

function App(): i32 {
  return <View className="flex-col h-full bg-slate-950 p-4 gap-3">
    <View className="flex-row items-center gap-3">
      <Text className="text-xl text-white">Clé FIDO en Bluetooth</Text>
      <Text className="text-sm text-slate-400">{keyName() === '' ? 'aucune clé' : keyName()}</Text>
      <Show when={phase() >= 2 || elapsed() > 0}><Text className={elapsed() >= 10 ? 'text-sm text-red-400' : 'text-sm text-amber-300'}>{'Session ' + elapsed() + ' s / ~14 s'}</Text></Show>
      <Show when={mode() !== ''}><View className={mode() === 'pairing' ? 'py-1 px-2 rounded bg-amber-600' : (mode() === 'usb' ? 'py-1 px-2 rounded bg-emerald-700' : 'py-1 px-2 rounded bg-sky-700')}><Text className="text-xs text-white">{mode() === 'pairing' ? 'mode appairage' : (mode() === 'usb' ? 'USB' : 'mode normal')}</Text></View></Show>
      <View className="grow"></View>
      <Show when={phase() === 3}>
        <Button className="py-2 px-4 rounded bg-slate-800 active:bg-slate-600" onClick={() => { disconnect(); }}>
          <Text className="text-sm text-white">Déconnecter</Text>
        </Button>
      </Show>
      <Show when={phase() !== 3}>
        <View className="flex-row gap-2">
          <Button className="py-2 px-4 rounded bg-emerald-600 active:bg-emerald-400" onClick={() => { connect(1); }}>
            <Text className="text-sm text-white">1. Appairer</Text>
          </Button>
          <Button className="py-2 px-4 rounded bg-sky-600 active:bg-sky-400" onClick={() => { connect(4); }}>
            <Text className="text-sm text-white">Séquence rapide</Text>
          </Button>
          <Button className="py-2 px-4 rounded bg-violet-600 active:bg-violet-400" onClick={() => { connect(3); }}>
            <Text className="text-sm text-white">USB</Text>
          </Button>
        </View>
      </Show>
    </View>

    <Show when={!usb()}>
    <View className="flex-row gap-2">
      <View className={stepA() === 2 ? 'grow p-3 rounded bg-emerald-800' : (stepA() === -1 ? 'grow p-3 rounded bg-red-900' : (stepA() === 1 ? 'grow p-3 rounded bg-amber-600' : 'grow p-3 rounded bg-slate-800'))}>
        <Text className="text-xs text-slate-200">1 · Appairage (maintien du bouton)</Text>
        <Text className="text-sm text-white">{stepA() === 2 ? 'réussi' : (stepA() === -1 ? 'échec' : (stepA() === 1 ? 'en cours…' : 'à faire'))}</Text>
      </View>
    </View>
    </Show>

    <View className={phase() === -1 ? 'p-3 rounded bg-red-950' : ((touch() || pairing()) ? 'p-3 rounded bg-amber-600' : 'p-3 rounded bg-slate-900')}>
      <Text className={phase() === -1 ? 'text-sm text-red-300' : 'text-sm text-white'}>{guide()}</Text>
    </View>

    <View className="flex-row gap-2">
      <Button className={phase() === 3 && !busy() ? 'py-2 px-4 rounded bg-emerald-600 active:bg-emerald-400' : 'py-2 px-4 rounded bg-slate-800'}
        onClick={() => { send('register'); }}>
        <Text className="text-sm text-white">Enregistrer une clé</Text>
      </Button>
      <Button className={phase() === 3 && !busy() ? 'py-2 px-4 rounded bg-slate-700 active:bg-slate-500' : 'py-2 px-4 rounded bg-slate-800'}
        onClick={() => { send('version'); }}>
        <Text className="text-sm text-white">Version U2F</Text>
      </Button>
    </View>

    <Text className="text-xs text-slate-400">Enregistrements ({creds().length})</Text>
    <View className="flex-col gap-2 p-2 rounded bg-slate-900">
      <Show when={creds().length === 0}><Text className="text-xs text-slate-500">Aucun enregistrement pour le moment.</Text></Show>
      <For each={creds()}>{(c: Cred, _i: i32) =>
        <View className="flex-row items-center gap-3 p-2 rounded bg-slate-800">
          <Text className="text-sm text-white">{'#' + c.n}</Text>
          <Text className="text-xs text-emerald-300 grow">{c.pub.slice(0, 24) + '…'}</Text>
          <Button className={phase() === 3 && !busy() ? 'py-1 px-3 rounded bg-sky-600 active:bg-sky-400' : 'py-1 px-3 rounded bg-slate-700'}
            onClick={() => { send('auth ' + c.kh + ' ' + c.pub); }}>
            <Text className="text-xs text-white">Authentifier</Text>
          </Button>
        </View>}
      </For>
    </View>

    <Text className="text-xs text-slate-400">Historique</Text>
    <ScrollView ref={log} className="grow p-2 rounded bg-slate-900">
      <For each={entries()}>{(e: Entry, _i: i32) =>
        <Text className={e.kind === 2 ? 'text-xs text-red-400' : (e.kind === 1 ? 'text-xs text-emerald-300' : 'text-xs text-slate-300')}>{e.text}</Text>}
      </For>
    </ScrollView>
  </View>;
}

render(App, 0x020617, (_dt: number) => {
  if (phase() >= 2 && connAt > 0) { const e = Math.floor((Date.now() - connAt) / 1000); if (e !== elapsed()) setElapsed(e); }
  if (follow > 0 && log.node >= 0) { ui.scrollTo(log.node, 0, 1000000); follow--; }
});
