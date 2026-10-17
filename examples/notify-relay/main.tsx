// Zinc Relay: the Mac's notifications on the tablet (examples/music). A menu bar app without a Dock icon (app.dock false: LSUIElement)
// that reads Notification Center's records as they arrive (Full Disk Access), filters them by app, by site and by Focus, and sends them
// with the app's icon and the sender's picture to the paired tablet over zinc:link. A click on the menu bar icon opens the menu; the
// window (the setup assistant and the settings) stays hidden until asked for. src/app.ts holds the state and the actions; README.md.
//   zinc --background run examples/notify-relay
import { createSignal, render } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import * as system from 'zinc:system';
import * as menu from 'zinc:system/menu';
import * as tray from 'zinc:system/tray';
import * as win from 'zinc:system/window';
import * as dialog from 'zinc:system/dialog';
import * as opener from 'zinc:system/opener';
import * as link from 'zinc:link';
import * as mac from 'zinc:notifymac';
import { onSignal, env, exit } from 'zinc:sys';
import { imageFromBytes, drawImage } from 'zinc:gfx';
import { base64Decode } from 'zinc:web';
import { settings, capture, focus, focusNow, relay, counts, test, start, onChange, setPaused, setApp, setDomain, setFocusPolicy, setFocusMode, blockApp, welcomed,
  skip, setLogin, loginOn, pairWith, parseAddress, startedHidden, inspectAsked, testDirect, testEndToEnd, PANE_FDA, PANE_CONTACTS, PANE_NETWORK, PANE_NOTIFY } from './src/app';
import { AppEntry, DomainEntry, hostIn, FOCUS_RELAY, FOCUS_HOLD, FOCUS_FOLLOW, FOCUS_DEFAULT } from './src/model';
import { FocusMode } from './src/focus';

// ---------------------------------------------------------------- the window

const PAGES: string[] = ['Assistant', 'Applications', 'Sites', 'Concentration', 'Tablette'];
const [page, setPage] = createSignal<number>(0);
const [version, setVersion] = createSignal<number>(0);   // bumped on every change of the state: the views read it
const [code, setCode] = createSignal<string>('');
const [address, setAddress] = createSignal<string>('');
const [note, setNote] = createSignal<string>('');
const [site, setSite] = createSignal<string>('');
const [login, setLoginShown] = createSignal<boolean>(false);
let windowOpen = false;
let target: link.Peer | null = null;   // the tablet found by discovery the code is for

function openWindow(p: number): void {
  setPage(p);
  console.log('window ' + PAGES[p]);
  if (!windowOpen) {
    windowOpen = true;
    render(App, 0xf8fafc, null);
    win.onCloseRequested(() => { win.keepOpen(); win.hide(); windowOpen = false; shown = false; });   // the relay keeps running in the menu bar
    shown = true;
  } else { win.show(); shown = true; }
  if (env('ZINC_BACKGROUND') !== '1') win.focus();
}
let shown = false;

function ago(t: number): string {
  if (t <= 0) return 'jamais';
  const s = Math.max(0, Math.floor(Date.now() / 1000 - t));
  if (s < 60) return 'à l\'instant';
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return `il y a ${Math.floor(s / 86400)} j`;
}
function plural(n: number, word: string): string { return `${n} ${word}${n > 1 ? 's' : ''}`; }

const images: Map<string, i32> = new Map<string, i32>();
function iconImage(app: string): i32 {
  const hash = relay.icon(app);
  if (hash === '') return -1;
  const known = images.get(hash);
  if (known !== undefined) return known;
  const im = imageFromBytes(base64Decode(relay.png(hash)));
  images.set(hash, im);
  return im;
}

const BTN = 'rounded-md px-3 py-1 cursor-pointer';
const CARD = 'flex-col gap-1 rounded-lg border border-slate-200 bg-white p-3';
function Toggle(props: { on: boolean; onToggle: () => void; yes: string; no: string }): i32 {
  return <Button className={`${BTN} ${props.on ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-rose-600 hover:bg-rose-500'}`} onClick={() => props.onToggle()}>
    <Text className="text-xs text-white font-semibold">{props.on ? props.yes : props.no}</Text>
  </Button>;
}
function Act(props: { label: string; onPress: () => void; main?: boolean }): i32 {
  return <Button className={`${BTN} ${props.main === true ? 'bg-sky-600 hover:bg-sky-500' : 'bg-slate-200 hover:bg-slate-300'}`} onClick={() => props.onPress()}>
    <Text className={`text-xs ${props.main === true ? 'text-white' : 'text-slate-900'}`}>{props.label}</Text>
  </Button>;
}

// ---- the assistant: one step per permission, checked live (a second's poll while the window is open)

let network = '';            // mac.localNetwork(): probed when the step asks, then every few seconds while the assistant shows
let networkAt = 0;
let notify = '';
let notifyAt = 0;
function networkState(): string { if (Date.now() - networkAt > 5000) { network = mac.localNetwork(); networkAt = Date.now(); } return network; }
function notifyState(): string { if (Date.now() - notifyAt > 2000) { notify = mac.notifyStatus(); notifyAt = Date.now(); } return notify; }
function contactsOk(): boolean { const c = mac.contactsStatus(); return c === 'granted' || c === 'limited'; }
/** A permission the relay needs is missing: Full Disk Access, or an optional step neither granted nor passed. */
function missing(): boolean {
  if (!capture.allowed()) return true;
  if (!contactsOk() && settings.skipped.indexOf('contacts') < 0) return true;
  const n = notifyState();
  return n !== 'granted' && n !== 'provisional' && n !== 'unavailable' && settings.skipped.indexOf('notify') < 0;
}

/** A step's buttons (the JSX lowering appends what a render* call returns). */
function renderSlot(c: (() => i32) | undefined): i32 { return c !== undefined ? c() : <View />; }
function Step(props: { n: number; title: string; why: string; done: boolean; state: string; children?: () => i32 }): i32 {
  return <View className={CARD}>
    <View className="flex-row items-center gap-2">
      <Text className={`text-sm font-bold ${props.done ? 'text-emerald-600' : 'text-slate-400'}`}>{props.done ? '✓' : `${props.n}`}</Text>
      <Text className="text-sm font-semibold text-slate-900 grow">{props.title}</Text>
      <Text className={`text-xs ${props.done ? 'text-emerald-700' : 'text-slate-500'}`}>{props.state}</Text>
    </View>
    <Text className="text-xs text-slate-600">{props.why}</Text>
    {renderSlot(props.children)}
  </View>;
}

function Assistant(): i32 {
  version();
  const fda = capture.allowed();
  const bundle = mac.bundlePath();
  const contacts = mac.contactsStatus();
  const net = networkState();
  const nst = notifyState();
  const p = relay.peer;
  const t = test.state;
  return <ScrollView className="grow">
    <View className="flex-col gap-2 pb-2">
      <Text className="text-sm text-slate-600">Zinc Relay vit dans la barre des menus. Il lit chaque notification que le Mac reçoit et l'envoie à la tablette appairée, sauf les apps et les sites que vous bloquez.</Text>
      <Step n={1} title="Accès complet au disque" done={fda} state={fda ? 'accordé' : 'requis'}
        why="Les notifications sont dans une base que seules les apps avec l'accès complet au disque peuvent lire (comme Messages et les modes Concentration). Zinc Relay n'y lit que les notifications et ne la copie jamais.">
        {fda ? <View /> : <View className="flex-col gap-1">
          <Text className="text-xs text-slate-600">{`Activez Zinc Relay dans la liste, ou glissez-y l'app : ${bundle !== '' ? bundle : 'Zinc Relay.app'}`}</Text>
          <View className="flex-row gap-2">
            <Act main={true} label="Ouvrir les Réglages" onPress={() => { opener.openUrl(PANE_FDA); }} />
            {bundle !== '' ? <Act label="Montrer dans le Finder" onPress={() => { opener.reveal(bundle); }} /> : <View />}
          </View>
        </View>}
      </Step>
      <Step n={2} title="Contacts" done={contactsOk()} state={contactsOk() ? 'accordé' : settings.skipped.indexOf('contacts') >= 0 ? 'passé' : 'facultatif'}
        why="Pour montrer la photo de l'expéditeur d'un message sur la tablette (sinon ses initiales).">
        {contactsOk() ? <View /> : <View className="flex-row gap-2">
          <Act main={true} label={contacts === 'denied' ? 'Ouvrir les Réglages' : 'Autoriser'} onPress={() => { if (contacts === 'undetermined') mac.requestContacts(); else opener.openUrl(PANE_CONTACTS); }} />
          <Act label="Passer" onPress={() => skip('contacts')} />
        </View>}
      </Step>
      <Step n={3} title="Réseau local" done={net === 'ok'} state={net === 'ok' ? 'accordé' : net === 'blocked' ? 'refusé' : 'hors ligne'}
        why="macOS demande avant qu'une app parle aux appareils du réseau : il le faut pour trouver la tablette et lui parler.">
        {net === 'blocked' ? <Act main={true} label="Ouvrir les Réglages" onPress={() => { opener.openUrl(PANE_NETWORK); }} /> : <View />}
      </Step>
      <Step n={4} title="Notifications" done={nst === 'granted' || nst === 'provisional'} state={nst === 'granted' ? 'accordé' : settings.skipped.indexOf('notify') >= 0 ? 'passé' : 'facultatif'}
        why="Pour envoyer la notification du test de bout en bout (sans elle, le test passe par AppleScript).">
        {nst === 'granted' || nst === 'provisional' || nst === 'unavailable' ? <View /> : <View className="flex-row gap-2">
          <Act main={true} label={nst === 'denied' ? 'Ouvrir les Réglages' : 'Autoriser'} onPress={() => { if (nst === 'denied') opener.openUrl(PANE_NOTIFY); else mac.requestNotify(); notifyAt = 0; }} />
          <Act label="Passer" onPress={() => skip('notify')} />
        </View>}
      </Step>
      <Step n={5} title="Appairer la tablette" done={p !== null} state={p !== null ? (p as link.Peer).name : 'à faire'}
        why="Sur la tablette, ouvrez la page des notifications de Musique : son assistant affiche un code à 6 chiffres.">
        {p === null ? <Act main={true} label="Appairer…" onPress={() => setPage(4)} /> : <View />}
      </Step>
      <Step n={6} title="Lancer à l'ouverture de session" done={login()} state={login() ? 'oui' : 'non'}
        why="Zinc Relay démarre avec le Mac, dans la barre des menus seulement.">
        <Toggle on={login()} yes="Oui" no="Non" onToggle={() => { const v = !login(); setLoginShown(v); setLogin(v); }} />
      </Step>
      <Step n={7} title="Test de bout en bout" done={t === 'acked'}
        state={t === '' ? 'à faire' : t === 'posted' ? 'envoyée, en attente…' : t === 'caught' ? 'lue, envoyée à la tablette…' : t === 'acked' ? 'reçue par la tablette' : t}
        why="Une vraie notification macOS, relue dans la base, relayée, et la tablette confirme l'avoir affichée.">
        <Act main={true} label="Envoyer la notification de test" onPress={() => { testEndToEnd(); }} />
      </Step>
      <View className="flex-row justify-end"><Act main={true} label="Terminé" onPress={() => { welcomed(); win.hide(); shown = false; }} /></View>
    </View>
  </ScrollView>;
}

// ---- the settings

function AppRow(props: { a: AppEntry }): i32 {
  const a = props.a;
  return <View className="flex-row items-center gap-3 px-3 py-2 border-b border-slate-200">
    <Canvas className="w-8 h-8" onDraw={(x: i32, y: i32, w: i32, h: i32) => { const im = iconImage(a.id); if (im >= 0) drawImage(im, x, y, w, h, 255, 0); }} />
    <View className="flex-col grow gap-0.5">
      <Text className="text-sm font-semibold text-slate-900">{a.name}</Text>
      <Text className="text-xs text-slate-500">{a.count === 0 ? `${a.id} · ajoutée à la main` : `${a.id} · ${plural(a.count, 'notification')} · ${ago(a.last)}`}</Text>
    </View>
    <Toggle on={a.allowed} yes="Relayée" no="Bloquée" onToggle={() => setApp(a, !a.allowed)} />
  </View>;
}
function SiteRow(props: { d: DomainEntry }): i32 {
  const d = props.d;
  return <View className="flex-row items-center gap-3 px-3 py-2 border-b border-slate-200">
    <View className="flex-col grow gap-0.5">
      <Text className="text-sm font-semibold text-slate-900">{d.domain}</Text>
      <Text className="text-xs text-slate-500">{d.count === 0 ? 'ajouté à la main' : `${plural(d.count, 'notification')} · ${ago(d.last)}`}</Text>
    </View>
    <Toggle on={d.allowed} yes="Relayé" no="Bloqué" onToggle={() => setDomain(d.domain, !d.allowed)} />
  </View>;
}

async function addApp(): Promise<void> {
  const o = new dialog.OpenOptions();
  o.title = 'Choisir une app à bloquer';
  o.defaultPath = '/Applications';
  o.filters = [new dialog.Filter('Applications', ['app'])];
  const picked = await dialog.open(o);
  if (picked === null || picked.length === 0) return;
  setNote(blockApp(picked[0]) ? '' : 'Ce n\'est pas une app.');
}

function Apps(): i32 {
  version();
  const list = settings.apps.slice().sort((x: AppEntry, y: AppEntry) => y.last - x.last);
  return <View className="flex-col grow gap-2">
    <Text className="text-sm text-slate-600">Chaque app qui a envoyé une notification. Celles d'une app bloquée restent sur le Mac.</Text>
    <View className="flex-row"><Act label="Bloquer une app…" onPress={() => { addApp(); }} /></View>
    {note() !== '' ? <Text className="text-xs text-rose-600">{note()}</Text> : <View />}
    <ScrollView className="grow rounded-lg border border-slate-200 bg-white">
      {list.length === 0 ? <Text className="text-sm text-slate-500 p-4">Aucune notification pour l'instant.</Text> : <View />}
      {list.map((a: AppEntry) => <AppRow a={a} />)}
    </ScrollView>
  </View>;
}

function Sites(): i32 {
  version();
  const list = settings.domains.slice().sort((x: DomainEntry, y: DomainEntry) => y.last - x.last);
  const add = (): void => { const h = hostIn(site()); if (h === '') { setNote('Tapez un site comme exemple.fr.'); return; } setNote(''); setDomain(h, false); setSite(''); };
  return <View className="flex-col grow gap-2">
    <Text className="text-sm text-slate-600">Les sites des notifications web (Chrome, Safari, Firefox, Edge…). Bloquer un site bloque aussi ses sous-domaines.</Text>
    <View className="flex-row items-center gap-2">
      <Input className="grow h-8 rounded-md border border-slate-300 bg-white text-sm px-2" placeholder="exemple.fr" value={site()} onInput={(v: string) => setSite(v)} />
      <Act label="Bloquer ce site" onPress={add} />
    </View>
    {note() !== '' ? <Text className="text-xs text-rose-600">{note()}</Text> : <View />}
    <ScrollView className="grow rounded-lg border border-slate-200 bg-white">
      {list.length === 0 ? <Text className="text-sm text-slate-500 p-4">Aucune notification web pour l'instant.</Text> : <View />}
      {list.map((d: DomainEntry) => <SiteRow d={d} />)}
    </ScrollView>
  </View>;
}

const POLICIES: string[] = [FOCUS_RELAY, FOCUS_HOLD, FOCUS_FOLLOW];
const POLICY_NAMES: string[] = ['Relayer quand même', 'Ne pas relayer', 'Suivre le mode'];
const MODE_POLICIES: string[] = [FOCUS_DEFAULT, FOCUS_RELAY, FOCUS_HOLD, FOCUS_FOLLOW];
const MODE_NAMES: string[] = ['Comme ci-dessus', 'Relayer', 'Ne pas relayer', 'Suivre'];
function modePolicy(id: string): string { const p = settings.focusModes.get(id); return p === undefined ? FOCUS_DEFAULT : p; }
function Pick(props: { on: boolean; label: string; value: string; onPick: (v: string) => void }): i32 {
  return <Button className={`${BTN} ${props.on ? 'bg-slate-900' : 'bg-slate-200 hover:bg-slate-300'}`} onClick={() => props.onPick(props.value)}>
    <Text className={`text-xs ${props.on ? 'text-white' : 'text-slate-900'}`}>{props.label}</Text>
  </Button>;
}
class ChoiceProps { value: string = ''; options: string[] = []; names: string[] = []; onPick: (v: string) => void = (v: string) => {}; }
function pickAt(c: ChoiceProps, i: number): i32 { return <Pick on={c.value === c.options[i]} label={c.names[i]} value={c.options[i]} onPick={c.onPick} />; }
// ponytail: a loop that inserts the items; a map whose callback makes them from the captured props trips the IR verifier (later.md)
function renderChoices(c: ChoiceProps): i32 {
  const row = <View className="flex-row gap-1" />;
  for (let i = 0; i < c.options.length; i++) ui.insert(row, pickAt(c, i), -1);
  return row;
}
function Choice(props: { value: string; options: string[]; names: string[]; onPick: (v: string) => void }): i32 {
  const c = new ChoiceProps();
  c.value = props.value; c.options = props.options; c.names = props.names; c.onPick = props.onPick;
  return <View>{renderChoices(c)}</View>;
}
function FocusPage(): i32 {
  version();
  return <ScrollView className="grow">
    <View className="flex-col gap-3">
      <Text className="text-sm text-slate-600">{focusNow.id !== '' ? `Concentration en cours : ${focusNow.name}.` : 'Aucun mode Concentration en cours.'}</Text>
      <View className={CARD}>
        <Text className="text-sm font-semibold text-slate-900">Pendant un mode Concentration</Text>
        <Choice value={settings.focus} options={POLICIES} names={POLICY_NAMES} onPick={(v: string) => setFocusPolicy(v)} />
        <Text className="text-xs text-slate-500">« Suivre le mode » relaie ce que le Mac a affiché malgré le mode : les apps et les personnes autorisées, les notifications urgentes.</Text>
      </View>
      {focus.modes.length === 0 ? <Text className="text-xs text-slate-500">Les modes apparaissent ici quand Zinc Relay a l'accès complet au disque.</Text> : <View />}
      {focus.modes.map((m: FocusMode) => <View className={CARD}>
        <Text className="text-sm font-semibold text-slate-900">{m.name}</Text>
        <Choice value={modePolicy(m.id)} options={MODE_POLICIES} names={MODE_NAMES} onPick={(v: string) => setFocusMode(m.id, v)} />
      </View>)}
    </View>
  </ScrollView>;
}

async function pairNow(): Promise<void> {
  let to: link.Address | null = parseAddress(address());
  if (to === null && target !== null) { const t = target as link.Peer; to = { host: t.host, port: t.port }; }
  if (to === null) { setNote('Choisissez une tablette ci-dessus, ou tapez son adresse.'); return; }
  if (code().trim().length !== 6) { setNote('Le code a 6 chiffres : la tablette l\'affiche.'); return; }
  setNote('Appairage…');
  const why = await pairWith(to as link.Address, code());
  setNote(why === '' ? 'Appairée.' : why);
  if (why === '') setCode('');
}

function Tablet(): i32 {
  version();
  const p = relay.peer;
  const others = relay.found.filter((q: link.Peer) => p === null || q.id !== p.id);
  const sel = (q: link.Peer): boolean => target !== null && (target as link.Peer).id === q.id;
  return <View className="flex-col grow gap-3">
    <View className={CARD}>
      <Text className="text-sm font-semibold text-slate-900">{p === null ? 'Aucune tablette appairée' : `${p.name} : ${stateWord()}`}</Text>
      <Text className="text-xs text-slate-500">{`${counts.relayed} relayées, ${counts.blocked} bloquées, ${counts.paused} en pause, ${counts.focus} par la concentration, ${relay.queue.length} en attente de la tablette`}</Text>
      {p !== null ? <View className="flex-row"><Act label="Oublier cette tablette" onPress={() => relay.forget()} /></View> : <View />}
    </View>
    <Text className="text-sm text-slate-600">Sur la tablette, lancez l'appairage depuis la page des notifications de Musique : elle affiche un code. Tablettes sur ce réseau :</Text>
    {others.length === 0 ? <Text className="text-sm text-slate-500">Recherche de tablettes…</Text> : <View />}
    {others.map((q: link.Peer) => <Button className={`${BTN} ${sel(q) ? 'bg-sky-600' : 'bg-slate-200 hover:bg-slate-300'}`} onClick={() => { target = q; setAddress(''); setVersion(version() + 1); }}>
      <Text className={`text-sm ${sel(q) ? 'text-white' : 'text-slate-900'}`}>{q.name + (q.pairing ? ' · affiche un code' : '')}</Text>
    </Button>)}
    <Text className="text-xs text-slate-500">Pas de tablette dans la liste (un réseau qui bloque la découverte) ? Tapez l'adresse que la tablette affiche :</Text>
    <Input className="h-8 rounded-md border border-slate-300 bg-white text-sm px-2" placeholder="192.168.1.20:7744" value={address()} onInput={(v: string) => setAddress(v)} />
    <View className="flex-row items-center gap-2">
      <Input className="w-32 h-8 rounded-md border border-slate-300 bg-white text-lg px-2 font-mono" placeholder="000000" value={code()} onInput={(v: string) => setCode(v)} onChange={(v: string) => { pairNow(); }} />
      <Act main={true} label="Appairer" onPress={() => { pairNow(); }} />
    </View>
    {note() !== '' ? <Text className="text-xs text-slate-700">{note()}</Text> : <View />}
  </View>;
}

function App(): i32 {
  return <View className="flex-col h-full gap-3 p-4 bg-slate-50">
    <View className="flex-row gap-1">
      {PAGES.map((name: string, i: number) => <Button className={`${BTN} ${page() === i ? 'bg-slate-900' : 'bg-slate-200 hover:bg-slate-300'}`} onClick={() => { setNote(''); setPage(i); }}>
        <Text className={`text-sm ${page() === i ? 'text-white' : 'text-slate-900'}`}>{name}</Text>
      </Button>)}
    </View>
    {page() === 0 ? <Assistant /> : page() === 1 ? <Apps /> : page() === 2 ? <Sites /> : page() === 3 ? <FocusPage /> : <Tablet />}
  </View>;
}

// ---------------------------------------------------------------- the menu bar

function stateWord(): string {
  const s = relay.state;
  return s === 'connected' ? 'connectée' : s === 'connecting' ? 'connexion…' : s === 'pairing' ? 'appairage…' : s === 'the tablet left' ? 'absente' : s;
}
function info(id: string, label: string): menu.Item { const i = menu.item(id, label); i.enabled = false; return i; }
function trayMenu(): menu.Item[] {
  const items: menu.Item[] = [];
  const p = relay.peer;
  items.push(info('status', p === null ? 'Non appairé' : `Tablette : ${p.name} (${stateWord()})`));
  if (focusNow.id !== '') items.push(info('focus', `Concentration : ${focusNow.name}`));
  if (counts.paused + counts.focus > 0) items.push(info('held', `Retenues : ${counts.paused} en pause, ${counts.focus} par la concentration`));
  if (capture.problem === 'permission') items.push(menu.item('permission', 'Accès complet au disque requis…'));
  for (const q of relay.found) if (q.pairing && (p === null || q.id !== p.id)) items.push(menu.item('pair:' + q.id, `Appairer ${q.name}…`));
  if (p === null) items.push(menu.item('address', 'Entrer l\'adresse de la tablette…'));
  items.push(menu.separator());
  items.push(menu.item('open', 'Ouvrir Zinc Relay…'));
  items.push(menu.item('settings', 'Réglages…'));
  items.push(menu.item('assistant', 'Assistant de configuration…'));
  items.push(menu.submenu('Envoyer une notification de test', [menu.item('test-direct', 'Directement à la tablette'), menu.item('test-macos', 'Via macOS (de bout en bout)')]));
  const pause = menu.item('pause', 'Mettre en pause');
  pause.type = 'checkbox';
  pause.checked = settings.paused;
  items.push(pause);
  items.push(menu.separator());
  items.push(menu.item('quit', 'Quitter'));
  return items;
}

let icon: tray.Tray | null = null;
let shownMenu = '';
function refresh(): void {
  setVersion(version() + 1);
  const t = icon;
  if (t === null) return;
  const items = trayMenu();
  const key = menu.encodeItems(items);
  if (key !== shownMenu) { shownMenu = key; (t as tray.Tray).setMenu(items); }
}

async function main(): Promise<void> {
  const inspect = inspectAsked();
  if (inspect > 0) { for (const l of capture.shapes(inspect)) console.log(l); exit(0); }
  start();
  setLoginShown(await loginOn());
  console.log(`permissions: full disk ${capture.allowed() ? 'granted' : 'missing'}, contacts ${mac.contactsStatus()}, local network ${networkState()}, notifications ${notifyState()}, login item ${mac.loginStatus()}`);
  if (tray.isSupported()) {
    const o = new tray.Options('relay');
    o.tooltip = 'Zinc Relay';
    o.title = '';
    o.menu = trayMenu();
    o.hasMenu = true;
    o.menuOnLeftClick = true;   // a click opens the menu, as macOS menu bar apps do
    icon = await tray.create(o);
  }
  onChange(() => refresh());
  setInterval(() => { if (shown) setVersion(version() + 1); }, 1000);   // the assistant's live checks
  menu.onClick('permission', () => openWindow(0));
  menu.onClick('assistant', () => openWindow(0));
  menu.onClick('address', () => openWindow(4));
  menu.onClick('open', () => openWindow(4));
  menu.onClick('settings', () => openWindow(1));
  menu.onClick('test-direct', () => testDirect());
  menu.onClick('test-macos', () => { testEndToEnd(); });
  menu.onClick('pause', () => setPaused(!settings.paused));
  menu.onClick('quit', () => system.quit(0));
  system.on('tray-menu-click', (a: string[]) => {   // the tablets come and go: their items are matched here, not registered one by one
    if (!a[0].startsWith('pair:')) return;
    for (const p of relay.found) if ('pair:' + p.id === a[0]) target = p;
    openWindow(4);
  });
  onSignal('SIGUSR1', () => setPaused(!settings.paused));   // the menu's "Mettre en pause" for scripts: kill -USR1 <pid>
  onSignal('SIGUSR2', () => testDirect());                   // and "Directement à la tablette": kill -USR2 <pid>
  onSignal('SIGTERM', () => exit(0));                        // a launchd stop or a script's kill ends the menu bar app at once
  // the assistant: on the first run, and whenever a permission is missing (never for --hidden without need: a login start fills the menu bar)
  if (env('RELAY_OPEN') !== '') openWindow(PAGES.indexOf(env('RELAY_OPEN')) < 0 ? 0 : PAGES.indexOf(env('RELAY_OPEN')));
  else if (!settings.welcomed || !capture.allowed() || (missing() && !startedHidden)) openWindow(0);
}
main();
