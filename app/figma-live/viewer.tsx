import { createSignal, createNodeRef, render } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import * as gfx from 'zinc:gfx';
import * as sys from 'zinc:sys';
import { fetch, Headers } from 'zinc:net';
import { Document, Layer, Action, str, num } from './model';
import { Scene } from './scene';

import { BindingEvent } from './native';

class Connector { key: string = ''; kind: string = ''; name: string = ''; code: string = ''; }
function connectors(document: Document): Connector[] {
  const result: Connector[] = [];
  const add = (key: string, kind: string, name: string, code: string): void => {
    for (const item of result) if (item.key === key && item.kind === kind) return;
    const c = new Connector(); c.key = key; c.kind = kind; c.name = name; c.code = code; result.push(c);
  };
  const visit = (n: Layer): void => {
    const c = n.native;
    if (c.kind !== '') {
      const key = c.outlet !== '' ? c.outlet : c.items;
      let code = c.kind === 'VirtualList' ? 'scene.controls.registerList(' + JSON.stringify(c.items) + ',\n  () => devices.length,\n  (i: i32) => DeviceRow(devices[i]));' : c.kind === 'ScrollView' ? '<ScrollView stickToBottom>\n  {/* Votre contenu dynamique */}\n</ScrollView>' : 'scene.controls.setValue(' + JSON.stringify(key) + ', ' + c.value + ');\n\nscene.onBinding = (e: BindingEvent): boolean => {\n  if (e.key === ' + JSON.stringify(c.event) + ') {\n    // e.value : valeur native du contrôle\n    return true;\n  }\n  return false;\n};';
      add(key,c.kind,n.name,code);
    }
    if (n.name.startsWith('outlet:') && c.kind === '') { const key = n.name.slice(7); add(key,'Outlet',n.name,'scene.setText(' + JSON.stringify(key) + ', value);'); }
    if (n.name.startsWith('action:')) { const key = n.name.slice(7); add(key,'Action',n.name,'scene.onBinding = (e: BindingEvent): boolean => {\n  if (e.key === ' + JSON.stringify(key) + ') {\n    // Votre logique métier\n    return true;\n  }\n  return false;\n};'); }
    for (const child of n.children) visit(child);
  };
  for (const screen of document.screens) visit(screen.tree);
  return result;
}

export function startLive(setup: ((scene: Scene) => void) | null = null): void {
  const scene = new Scene();
  if (setup !== null) (setup as (scene: Scene) => void)(scene);
  const appChanged = scene.changed, appBinding = scene.onBinding, appAction = scene.onAction;
  const token = sys.env('ZINC_LIVE_TOKEN');
  const origin = sys.env('ZINC_LIVE_ORIGIN') || 'http://127.0.0.1:7331';
  const requestHeaders = new Headers();
  requestHeaders.set('Authorization', 'Bearer ' + token);
  requestHeaders.set('Content-Type', 'application/json');
  const previewRef = createNodeRef();
  const [document, setDocument] = createSignal<Document>(scene.document);
  const [connection, setConnection] = createSignal<string>('En attente de Figma');
  const [detail, setDetail] = createSignal<string>('Ouvrez Zinc Live dans Figma, puis collez ce lien.');
  const [link, setLink] = createSignal<string>('http://localhost:7331/#' + token);
  const [project, setProject] = createSignal<string>(sys.env('ZINC_LIVE_PROJECT'));
  const [width, setWidth] = createSignal<number>(360);
  const [height, setHeight] = createSignal<number>(480);
  const [zoom, setZoom] = createSignal<number>(1);
  const [screenName, setScreenName] = createSignal<string>('Votre prochain écran');
  const [playing, setPlaying] = createSignal<boolean>(true);
  const [prototyping, setPrototyping] = createSignal<boolean>(true);
  const [looping, setLooping] = createSignal<boolean>(false);
  const [time, setTime] = createSignal<number>(0);
  const [copied, setCopied] = createSignal<boolean>(false);
  const [exporting, setExporting] = createSignal<boolean>(false);
  const [exportMessage, setExportMessage] = createSignal<string>('Un projet autonome avec TSX, connecteurs et assets.');
  const [exportPath, setExportPath] = createSignal<string>('');
  const [showConnectors, setShowConnectors] = createSignal<boolean>(false);
  const [selectedConnector, setSelectedConnector] = createSignal<string>('');
  const [events, setEvents] = createSignal<string[]>([]);
  const logEvent = (key: string, value: string): void => { setEvents([key + value, ...events()].slice(0,20)); };
  scene.onBinding = (e: BindingEvent): boolean => { logEvent(e.key, e.kind === 'Action' ? '' : ' → ' + e.value); return appBinding !== null ? (appBinding as (event: BindingEvent) => boolean)(e) : false; };
  scene.onAction = (key: string, action: Action): boolean => { logEvent(key,''); return appAction !== null ? (appAction as (key: string, action: Action) => boolean)(key,action) : false; };
  let revision = -1, polling = false, nextPoll = 0, nextClock = 0, exportFailed = false;
  let holder = -1;
  const fit = (): void => {
    const availableW = Math.max(200, gfx.width() - 392 - (showConnectors() ? 340 : 0)), availableH = Math.max(200, gfx.height() - 162);
    const factor = Math.min(1, availableW / scene.viewportWidth, availableH / scene.viewportHeight);
    setZoom(Math.round(factor * 100) / 100);
    ui.setNumber(scene.root, 'scale', factor);
    if (holder >= 0) { ui.setNumber(holder, 'width', scene.viewportWidth * factor); ui.setNumber(holder, 'height', scene.viewportHeight * factor); }
  };
  scene.changed = (): void => {
    if (appChanged !== null) (appChanged as () => void)();
    setScreenName(scene.screen().name);
    setWidth(scene.viewportWidth); setHeight(scene.viewportHeight);
    fit();
  };
  const viewport = (w: number, h: number): void => {
    if (!Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1 || w > 4096 || h > 4096) return;
    scene.customViewport = true; scene.resize(w, h); setWidth(w); setHeight(h); fit();
  };
  const acknowledge = async (): Promise<void> => {
    await fetch(origin + '/applied', {method: 'POST', headers: requestHeaders, body: JSON.stringify({revision: revision})});
  };
  const exportProject = async (): Promise<void> => {
    if (exporting() || revision < 1) return;
    exportFailed = false;
    setExporting(true); setExportMessage('Choisissez le dossier de destination…');
    try {
      const response = await fetch(origin + '/export', {method: 'POST', headers: requestHeaders, body: JSON.stringify({revision: revision}), timeoutMs: 10000});
      const result = JSON.parse(await response.text());
      if (!response.ok) throw new Error(str(result.error, 'Export impossible.'));
    } catch (e) { exportFailed = true; setExporting(false); setExportMessage(str(e.message, 'Export impossible.')); }
  };
  const poll = async (): Promise<void> => {
    if (polling) return;
    polling = true;
    let received = false;
    try {
      const response = await fetch(origin + '/state?after=' + revision, {headers: requestHeaders, timeoutMs: 2000});
      if (!response.ok) throw new Error('Le pont local ne répond pas.');
      const state = JSON.parse(await response.text());
      received = true;
      if (!exportFailed && typeof state.export === 'object' && state.export !== null) {
        const status = str(state.export.status);
        if (status !== 'idle') setExporting(status === 'choosing');
        if (status === 'done') { setExportPath(str(state.export.path)); setExportMessage('Projet exporté · révision ' + num(state.export.revision)); }
        if (status === 'cancelled') setExportMessage('Export annulé.');
        if (status === 'error') setExportMessage(str(state.export.error, 'Export impossible.'));
      }
      setLink(str(state.link)); setProject(str(state.project));
      setConnection(state.connected === true ? state.live === true ? 'Connecté · en direct' : 'Connecté · en pause' : 'Figma déconnecté');
      if (typeof state.document === 'object' && state.document !== null) {
        scene.load(state.document);
        setDocument(scene.document);
        revision = num(state.revision) as i32;
        setDetail('Affiché · révision ' + revision);
        await acknowledge();
        console.log('zinc live: displayed revision', revision, scene.screen().name);
      }
      if (str(state.error) !== '') setDetail(str(state.error));
    } catch (e) { if (!received) setConnection('Connexion interrompue'); setDetail(received ? 'Design non appliqué : ' + str(e.message, 'ressource illisible') : 'Le dernier écran reste affiché. Vérifiez le pont local.'); }
    finally { polling = false; }
  };
  const Clock = (): string => { return (time() / 1000).toFixed(1) + ' s'; };
  const App = (): i32 => {
    const app = <View className="w-full h-full flex-row bg-[#edece6] text-[#20271f]">
      <ScrollView className="w-[300] h-full bg-[#fafaf7] p-6 gap-5 border-r border-[#dedfd5]">
        <View className="gap-1"><Text className="text-[30px] font-bold">Zinc.</Text><Text className="text-xs text-[#747b6d]">LE DESIGN PREND VIE</Text></View>
        <View className="gap-2"><Text className="text-sm font-bold">{connection()}</Text><Text className="text-xs text-[#747b6d] whitespace-pre-wrap">{detail()}</Text></View>
        <View className="gap-2"><Text className="text-sm font-bold">Connexion à Figma</Text>
          <Input className="h-10 text-xs bg-white border border-[#dedfd5] rounded-lg px-3" value={link()} readOnly />
          <Button className="h-10 rounded-lg bg-[#d4eda1] text-[#26351d]" onClick={() => { gfx.setClipboardText(link()); setCopied(true); }}>{copied() ? 'Lien copié' : 'Copier le lien'}</Button>
          <Text className="text-xs text-[#747b6d] whitespace-pre-wrap">Collez ce lien dans le plugin Zinc Live. Le viewer reste ouvert quand le design change.</Text>
        </View>
        <View className="gap-2"><Text className="text-sm font-bold">Votre projet</Text>
          <Button className="h-10 rounded-lg bg-[#d4eda1] text-[#26351d]" disabled={exporting() || document().screens.length === 0} onClick={() => { exportProject(); }}>{exporting() ? 'Export en cours…' : 'Exporter le projet…'}</Button>
          <Text className="text-xs text-[#747b6d] whitespace-pre-wrap">{exportMessage()}</Text>
          <Show when={exportPath() !== ''}><View className="w-full gap-2"><Text className="w-full text-xs text-[#747b6d] whitespace-pre-wrap">{exportPath()}</Text><Button className="h-10 rounded-lg border border-[#dedfd5]" onClick={() => { gfx.setClipboardText(exportPath()); }}>Copier le chemin</Button></View></Show>
        </View>
        <View className="gap-2"><Text className="text-sm font-bold">Viewport</Text>
          <View className="flex-row gap-2">
            <Input className="w-[110] h-10 bg-white border border-[#dedfd5] rounded-lg px-3" value={'' + width()} onChange={(s: string) => viewport(parseInt(s), height())} />
            <Input className="w-[110] h-10 bg-white border border-[#dedfd5] rounded-lg px-3" value={'' + height()} onChange={(s: string) => viewport(width(), parseInt(s))} />
          </View>
          <View className="flex-row gap-2"><Button className="h-10 flex-1 rounded-lg bg-[#eeefe8]" onClick={() => viewport(390, 844)}>Mobile</Button><Button className="h-10 flex-1 rounded-lg bg-[#eeefe8]" onClick={() => viewport(800, 600)}>Tablette</Button><Button className="h-10 flex-1 rounded-lg bg-[#eeefe8]" onClick={() => viewport(1280, 800)}>Bureau</Button></View>
          <Button className="h-10 rounded-lg border border-[#dedfd5]" onClick={() => { scene.customViewport = false; scene.resize(scene.screen().width, scene.screen().height); setWidth(scene.viewportWidth); setHeight(scene.viewportHeight); fit(); }}>Taille du design</Button>
        </View>
        <View className="gap-2"><Text className="text-sm font-bold">Prototype & mouvement</Text>
          <View className="flex-row gap-2"><Button className="h-10 flex-1 rounded-lg bg-[#eeefe8]" onClick={() => { setPlaying(!playing()); scene.setPlaying(playing()); }}>{playing() ? 'Pause' : 'Lecture'}</Button><Button className="h-10 flex-1 rounded-lg bg-[#eeefe8]" onClick={() => { scene.restart(); }}>Rejouer</Button></View>
          <Button className="h-10 rounded-lg border border-[#dedfd5]" onClick={() => { setPrototyping(!prototyping()); scene.prototype = prototyping(); }}>{prototyping() ? 'Interactions activées' : 'Interactions désactivées'}</Button>
          <Button className="h-10 rounded-lg border border-[#dedfd5]" onClick={() => { setLooping(!looping()); scene.loop = looping(); }}>{looping() ? 'Lecture en boucle' : 'Lecture une fois'}</Button>
          <Input className="h-10 bg-white border border-[#dedfd5] rounded-lg px-3" value={Clock()} onChange={(s: string) => { const at = parseFloat(s); if (Number.isFinite(at)) { scene.setPlaying(false); setPlaying(false); scene.seek(at * 1000); } }} />
        </View>
        <Text className="text-xs text-[#747b6d] whitespace-pre-wrap">{project()}</Text>
      </ScrollView>
      <View className="flex-1 h-full">
        <View className="h-[64] flex-row items-center justify-between px-6 bg-[#fafaf7] border-b border-[#dedfd5]"><Text className="text-sm font-bold">{screenName()}</Text><Button className="h-9 px-3 rounded-lg bg-[#eeefe8]" onClick={() => { setShowConnectors(!showConnectors()); fit(); }}>{showConnectors() ? 'Fermer les connecteurs' : 'Connecteurs · TypeScript'}</Button><Text className="text-xs text-[#747b6d]">{'' + width() + ' × ' + height() + ' · ' + Math.round(zoom() * 100) + '%'}</Text></View>
        <ScrollView className="flex-1 p-6">
          <View className="flex-row gap-2 pb-5"><For each={document().screens}>{(screen) => <Button className="h-10 px-4 rounded-lg bg-[#fafaf7]" onClick={() => scene.navigate(screen.id)}>{screen.name}</Button>}</For><Button className="h-10 px-4 rounded-lg bg-[#fafaf7]" onClick={() => scene.back()}>Retour</Button></View>
          <View className="items-center"><View ref={previewRef} className="relative bg-white shadow-lg" /></View>
          <View className="pt-6 gap-2"><For each={document().warnings}>{(warning) => <Text className="text-xs text-[#8c6532] whitespace-pre-wrap">{warning}</Text>}</For>
            <For each={document().fonts}>{(font) => <Text className="text-xs text-[#747b6d]">{font.family + ' · ' + font.style + ' · ' + font.extraction}</Text>}</For>
          </View>
        </ScrollView>
      </View>
      <Show when={showConnectors()}><ScrollView className="w-[340] h-full p-5 bg-[#fafaf7] border-l border-[#dedfd5] gap-4">
        <Text className="text-lg font-bold">Design → code</Text>
        <Text className="text-xs text-[#747b6d] whitespace-pre-wrap">Contrôles natifs, états et actions du storyboard. Le journal montre les événements réellement émis.</Text>
        <For each={connectors(document())}>{(c) => <View className="gap-2"><Button className="h-10 px-3 rounded-lg bg-[#eeefe8] text-xs" onClick={() => setSelectedConnector(c.key)}>{c.kind + ' · ' + c.key}</Button><Show when={selectedConnector() === c.key}><Text className="w-full text-xs font-mono whitespace-pre-wrap text-[#385131]">{c.code}</Text></Show></View>}</For>
        <Text className="text-sm font-bold">Événements</Text>
        <For each={events()}>{(e) => <Text className="w-full text-xs font-mono whitespace-pre-wrap">{e}</Text>}</For>
      </ScrollView></Show>
    </View>;
    holder = previewRef.node; ui.insert(holder, scene.root, -1); fit();
    return app;
  };
  const resizeHandler = (w: number, h: number): void => fit();
  gfx.onResize(resizeHandler);
  render(App, 0xedece6, (dt: number): void => {
    const now = ui.now();
    if (now >= nextPoll) { nextPoll = now + 300; poll(); }
    if (now >= nextClock) { nextClock = now + 100; setTime(scene.playhead); }
  });
}
