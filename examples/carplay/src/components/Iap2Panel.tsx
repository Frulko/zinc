import * as dialog from 'zinc:system/dialog';
import { writeText, appendText } from 'zinc:fs';
import { toHex } from 'zinc:web';
import { createSignal } from 'zinc:ui/solid';
import { Session, Iap2Capability } from 'zinc:carplay';
const [catalog, setCatalog] = createSignal<Iap2Capability[]>([]);
const [query, setQuery] = createSignal<string>('');
const [selected, setSelected] = createSignal<i32>(0x5000);
const [payload, setPayload] = createSignal<string>('');
const [status, setStatus] = createSignal<string>('Récepteur non connecté');
const [events, setEvents] = createSignal<string[]>([]);
const [tracing, setTracing] = createSignal<boolean>(false);
const [page, setPage] = createSignal<i32>(0);
const [recording, setRecording] = createSignal<boolean>(false);
let recordPath = '';
let traceHooked = false;
const [paused, setPaused] = createSignal<boolean>(false);
const [direction, setDirection] = createSignal<string>('');
let live: Session | null = null;
let elapsed = 1;
export function tickIap2(session: Session, dt: number, visible: boolean): void {
  live = session;
  if (!traceHooked) {
    traceHooked = true;
    session.onIap2Trace = (line: string) => {
      if (recordPath === '') return;
      try { appendText(recordPath, line + '\n\n'); }
      catch (e) { recordPath = ''; setRecording(false); setStatus('Échec de l’enregistrement'); }
    };
  }
  if (!visible) return;
  elapsed += dt;
  if (elapsed >= 1) { elapsed = 0; session.pollIap2(); }
  const state = session.iap2;
  if (state !== null) {
    setCatalog(state.catalog); setTracing(state.tracing);
    setStatus(`${state.connected ? 'Lien iAP2 authentifié' : 'Pas de lien iAP2 actif'} · ${state.catalog.length} messages catalogués · ${state.subscriptions.length} abonnements envoyés` + (session.iap2Error !== '' ? ' · ' + session.iap2Error : ''));
  }
  if (!paused()) setEvents(session.iap2Log.slice(-20).reverse());
}
function hex(id: i32): string { return '0x' + toHex([(id >> 8) & 255, id & 255]); }
function matches(): Iap2Capability[] {
  const q = query().toLowerCase(); const d = direction();
  return catalog().filter((c: Iap2Capability) => (d === '' || c.direction.includes(d)) && (hex(c.id) + ' ' + c.name + ' ' + c.feature).toLowerCase().includes(q));
}
function rows(): Iap2Capability[] { return matches().slice(page() * 30, page() * 30 + 30); }
function current(): Iap2Capability | null {
  for (const c of catalog()) if (c.id === selected()) return c;
  return null;
}
function description(): string {
  const c = current(); return c === null ? 'Sélectionner un message.' : `${hex(c.id)} ${c.name} · ${c.feature}\n${c.direction} · ${c.declared ? 'annoncé au téléphone' : 'catalogue seulement : non annoncé'} · TX ${c.tx} / RX ${c.rx}\n${c.schema || 'Schéma opaque : paramètres bruts dans la trace.'}`;
}
function choose(c: Iap2Capability): void {
  setSelected(c.id);
  setPayload(c.samplePayload);
}
function send(): void {
  const s = live, c = current();
  if (s === null || c === null || !c.declared || !c.direction.includes('TX') || c.sensitive) { setStatus('Message non annoncé pour TX, ou géré par le protocole.'); return; }
  if (!s.sendIap2(c.id, payload())) setStatus('Récepteur déconnecté');
}
async function record(): Promise<void> {
  if (recordPath !== '') { recordPath = ''; setRecording(false); return; }
  try {
    const options = new dialog.SaveOptions(); options.title = 'Enregistrer tous les échanges iAP2'; options.defaultPath = 'carplay-iap2-live.log';
    const path = await dialog.save(options); if (path === null) return;
    writeText(path, 'Zinc iAP2 live trace · secrets omitted\n\n');
    recordPath = path; setRecording(true);
    const s = live; if (s !== null) s.traceIap2(true);
  } catch (e) { setStatus('Impossible d’ouvrir le fichier'); }
}
async function exportLog(): Promise<void> {
  const s = live; if (s === null) return;
  const text = JSON.stringify(s.iap2) + '\n\n' + s.iap2Log.join('\n\n');
  try {
    const options = new dialog.SaveOptions(); options.title = 'Exporter la session iAP2'; options.defaultPath = 'carplay-iap2.txt';
    const path = await dialog.save(options); if (path === null) return;
    writeText(path, text);
    setStatus('Journal exporté');
  } catch (e) { setStatus('Échec de l’export du journal'); }
}
export function Iap2Panel(): i32 {
  return <View className="grow h-0 flex-col bg-slate-950 p-4 gap-3">
    <View className="flex-row items-center gap-3">
      <Text className="text-lg text-cyan-300">iAP2 / RX ↔ TX</Text>
      <Text className="grow text-xs text-slate-400">{status()}</Text>
      <Button className="bg-cyan-900 p-2 rounded" onClick={() => { const s = live; if (s === null || !s.traceIap2(!tracing())) setStatus('Récepteur déconnecté'); }}><Text className="text-white">{tracing() ? 'Trace ON' : 'Activer la trace'}</Text></Button>
      <Button className="bg-slate-800 p-2 rounded" onClick={() => { record(); }}><Text className="text-amber-200">{recording() ? 'Arrêter REC' : 'Enregistrer'}</Text></Button>
      <Button className="bg-slate-800 p-2 rounded" onClick={() => { exportLog(); }}><Text className="text-white">Exporter</Text></Button>
      <Button className="bg-slate-800 p-2 rounded" onClick={() => setPaused(!paused())}><Text className="text-white">{paused() ? 'Reprendre' : 'Pause lecture'}</Text></Button>
    </View>
    <Text className="text-xs text-slate-400">RX = iPhone → Zinc · TX = Zinc → iPhone. Catalogue connu ≠ fonction implémentée. Secrets masqués. F6 libère le clavier.</Text>
    <View className="grow h-0 flex-row gap-4">
      <View className="w-80 flex-col gap-2">
        <Input className="h-9 bg-slate-800 text-white px-2 rounded" value={query()} onInput={(v: string) => { setQuery(v); setPage(0); }} placeholder="ID, nom ou famille" />
        <View className="flex-row gap-2"><Button className="bg-slate-700 p-2 rounded" onClick={() => { setDirection(direction() === '' ? 'RX' : direction() === 'RX' ? 'TX' : ''); setPage(0); }}><Text className="text-white">{direction() || 'RX + TX'}</Text></Button>
          <Button className="bg-slate-800 p-2 rounded" onClick={() => setPage(Math.max(0, page() - 1))}><Text className="text-white">←</Text></Button>
          <Text className="text-slate-400">{page() + 1}</Text>
          <Button className="bg-slate-800 p-2 rounded" onClick={() => { if ((page() + 1) * 30 < matches().length) setPage(page() + 1); }}><Text className="text-white">→</Text></Button></View>
        <ScrollView className="grow h-0"><View className="flex-col gap-1"><For each={rows()}>{(c: Iap2Capability) => <Button className="bg-slate-900 p-2 rounded" onClick={() => choose(c)}><View className="flex-col gap-1"><Text className="text-xs text-cyan-200">{hex(c.id)} · {c.direction} · TX {c.tx} / RX {c.rx}</Text><Text className="text-xs text-white">{c.name}</Text><Text className="text-xs text-slate-400">{c.declared ? 'Annoncé' : 'Catalogue'} · {c.feature}</Text></View></Button>}</For></View></ScrollView>
      </View>
      <View className="grow w-0 flex-col gap-2">
        <ScrollView className="h-28 bg-slate-900 p-2 rounded"><View className="flex-col gap-1"><For each={description().split('\n')}>{(line: string) => <Text className="text-xs text-white">{line}</Text>}</For></View></ScrollView>
        <Text className="text-xs text-amber-200">Composer TX · corps TLV hexadécimal · l’envoi agit sur le téléphone</Text>
        <View className="flex-row gap-2"><Input className="grow h-9 bg-slate-800 text-white px-2 rounded" value={payload()} onInput={setPayload} placeholder="Payload TLV ; vide pour un message sans paramètre" /><Button className="bg-amber-200 p-2 rounded" onClick={send}><Text className="text-slate-950">Envoyer</Text></Button></View>
        <Text className="text-sm text-cyan-300">Journal détaillé · 20 derniers échanges / mémoire 128</Text>
        <ScrollView className="grow h-0 bg-slate-900 p-3"><View className="flex-col gap-3"><For each={events()}>{(event: string) => <View className="flex-col gap-1 border-b border-slate-700 pb-3"><For each={event.split('\n')}>{(line: string) => <Text className="text-xs text-slate-200">{line}</Text>}</For></View>}</For></View></ScrollView>
      </View>
    </View>
  </View>;
}
