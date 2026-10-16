// webrtc-chat: two peers chat and send a file over WebRTC data channels (zinc:webrtc), with the signalling done three ways:
//   - "This window": both peers in this program, the offer, the answer and the candidates passed in memory (no network needed);
//   - "Copy and paste": one peer here, the other in another copy of the app (another machine): copy the offer, paste the answer;
//   - "Room": both join a room of the signalling server (signal-server.ts, `zinc run examples/webrtc-chat/signal-server.ts`) on a LAN.
// The bar at the bottom shows the microphone's level (zinc:microphone; examples/webrtc-call sends the audio and the video).
//   zinc run examples/webrtc-chat
// WEBRTC_MODE=paste|room starts on another tab, WEBRTC_SCHEME=dark in the dark theme, WEBRTC_AUTOCONNECT=0 leaves "This window" idle,
// WEBRTC_DEMO=1 runs the scripted session (connect, chat, a file, then quit), WEBRTC_DEMO=room joins the room, says hello and quits once
// it heard the other peer; WEBRTC_DEMO_LOG=1 prints what happens.
import { render, createSignal, For, Show } from 'zinc:ui/solid';
import { Button, Card, CardHeader, CardContent, Progress, Switch, heading, mutedText, theme, setTheme, LIGHT, DARK } from 'zinc:ui/kit';
import * as ui from 'zinc:ui';
import { setClipboardText, clipboardText, quit } from 'zinc:gfx';
import * as sys from 'zinc:sys';
import { WebSocket, MessageEvent as WsMessage } from 'zinc:socket';
import { requestPermission, Microphone } from 'zinc:microphone';
import { Peer, Line, sample, until } from './peer';

const env = (k: string, d: string): string => sys.env(k) !== '' ? sys.env(k) : d;
const demo = env('WEBRTC_DEMO', '0');
const log = (s: string): void => { if (env('WEBRTC_DEMO_LOG', '0') === '1') console.log(s); };

// ---- state
const [mode, setModeSignal] = createSignal<string>(env('WEBRTC_MODE', 'local'));
const [dark, setDarkSignal] = createSignal<boolean>(env('WEBRTC_SCHEME', 'light') === 'dark');
const [level, setLevel] = createSignal<number>(0);
const [micNote, setMicNote] = createSignal<string>('Microphone off');
const [peers, setPeers] = createSignal<Peer[]>([]);
const [localText, setLocalText] = createSignal<string>('');    // the description to copy (paste mode)
const [remoteText, setRemoteText] = createSignal<string>('');  // the description pasted from the other side
const [step, setStep] = createSignal<string>('');
const [server, setServer] = createSignal<string>(env('WEBRTC_SIGNAL', 'ws://localhost:8787'));
const [room, setRoom] = createSignal<string>('zinc');
if (dark()) setTheme(DARK);
let socket: WebSocket | null = null;
let mic: Microphone | null = null;

function setDark(on: boolean): void { setDarkSignal(on); setTheme(on ? DARK : LIGHT); }
function hangUp(): void {
  for (const p of peers()) p.close();
  setPeers([]);
  const s = socket;
  if (s !== null) { s.close(); socket = null; }
  setLocalText(''); setRemoteText(''); setStep('');
}
function setMode(m: string): void { if (m !== mode()) { hangUp(); setModeSignal(m); if (m === 'local') connectHere(); } }
function newPeer(name: string, trickle: boolean): Peer {
  const p = new Peer(name, []);
  p.onLog = log;
  if (!trickle) p.onSignal = null;
  return p;
}

// ---- "This window": both peers here, trickle ICE in memory
async function connectHere(): Promise<void> {
  hangUp();
  const a = newPeer('A', true), b = newPeer('B', true);
  const pending: string[] = [];   // A's candidates found before B has the offer
  a.onSignal = (json: string) => { if (b.pc.remoteDescription !== null) b.candidate(json); else pending.push(json); };
  b.onSignal = (json: string) => { a.candidate(json); };
  setPeers([a, b]);
  setStep('Connecting the two peers in this window...');
  const answer = await b.answer(await a.offer());
  for (const c of pending) b.candidate(c);
  await a.accept(answer);
  await until(() => a.open && b.open);
  setStep('Connected through ' + (a.candidates().length > 0 ? 'host candidates' : 'the loopback'));
}

// ---- "Copy and paste": one peer, the descriptions carry the candidates (no trickle)
async function createOffer(): Promise<void> {
  hangUp();
  const p = newPeer('You', false);
  setPeers([p]);
  setStep('Gathering candidates...');
  const offer = await p.offer();
  setLocalText(offer); setClipboardText(offer);
  setStep('Offer copied: paste it in the other app, then paste its answer below and press "Accept answer".');
}
async function answerOffer(): Promise<void> {
  const text = remoteText().trim();
  if (text === '') { setStep('Paste the offer of the other app first.'); return; }
  hangUp();
  const p = newPeer('You', false);
  setPeers([p]);
  try {
    const answer = await p.answer(text);
    setLocalText(answer); setClipboardText(answer); setRemoteText('');
    setStep('Answer copied: paste it in the other app ("Accept answer").');
  } catch (e) { setStep('That is not an offer: ' + (e as Error).message); }
}
async function acceptAnswer(): Promise<void> {
  const list = peers();
  if (list.length === 0) { setStep('Create an offer first.'); return; }
  try { await list[0].accept(remoteText()); setStep('Answer accepted: connecting...'); setRemoteText(''); }
  catch (e) { setStep('That is not an answer: ' + (e as Error).message); }
}

// ---- "Room": the signalling server relays the offer, the answer and the candidates
function joinRoom(): void {
  hangUp();
  const ws = new WebSocket(server() + '/' + encodeURIComponent(room()));
  socket = ws;
  const p = newPeer('You', true);
  p.onSignal = (json: string) => { ws.send(json); };
  setPeers([p]);
  setStep(`Joining room "${room()}"...`);
  ws.onerror = () => { setStep('No signalling server at ' + server() + ' (start it with: zinc run examples/webrtc-chat/signal-server.ts)'); };
  ws.onmessage = (e: WsMessage) => {
    const o: any = JSON.parse(e.data);
    const type = o.type as string;
    if (type === 'waiting') setStep(`In room "${room()}": waiting for the other peer.`);
    else if (type === 'full') setStep(`Room "${room()}" already has two peers.`);
    else if (type === 'left') setStep('The other peer left.');
    else if (type === 'joined' && (o.offer as boolean)) { setStep('The other peer is here: calling...'); p.offer().then((offer: string) => ws.send(offer)); }
    else if (type === 'joined') setStep('Joined: waiting for the call...');
    else if (type === 'offer') p.answer(e.data).then((answer: string) => ws.send(answer));
    else if (type === 'answer') p.accept(e.data);
    else if (type === 'candidate') p.candidate(e.data);
  };
}

// ---- microphone level (the meter only)
async function toggleMic(on: boolean): Promise<void> {
  const m = mic;
  if (!on) { if (m !== null) m.close(); mic = null; setLevel(0); setMicNote('Microphone off'); return; }
  const access = await requestPermission();
  if (access !== 'granted') { setMicNote(access === 'denied' ? 'Microphone access denied' : 'Microphone access not given'); return; }
  try { const opened = await Microphone.open(); mic = opened; setMicNote('Microphone: ' + opened.sampleRate + ' Hz'); }
  catch (e) { setMicNote((e as Error).message); }
}

// ---- screen
function Tab(props: { id: string; label: string }): i32 {
  return <Button className={`h-8 px-3 rounded-md ${mode() === props.id ? `bg-${theme().primary} active:bg-${theme().primaryPressed}` : `bg-${theme().secondary} active:bg-${theme().secondaryPressed}`}`}
    onClick={() => setMode(props.id)}>
    <Text className={`text-sm font-medium text-${mode() === props.id ? theme().primaryForeground : theme().secondaryForeground}`}>{props.label}</Text>
  </Button>;
}
function stateColor(s: string): string { return s === 'connected' ? 'emerald-500' : s === 'failed' || s === 'disconnected' ? 'red-500' : s === 'closed' ? 'zinc-400' : 'amber-500'; }
function Bubble(l: Line): i32 {
  return <View className={`flex-row ${l.mine ? 'justify-end' : 'justify-start'}`}>
    <View className={`px-3 py-1.5 rounded-lg max-w-[260] ${l.mine ? `bg-${theme().accent}` : `bg-${theme().muted}`}`}>
      <Text className={`text-sm text-${l.mine ? theme().accentForeground : theme().foreground}`}>{l.text}</Text>
    </View>
  </View>;
}
function PeerCard(p: Peer): i32 {
  const [draft, setDraft] = createSignal<string>('');
  const send = (): void => { p.say(draft()); setDraft(''); };
  return <Card className="grow basis-0">
    <CardHeader title={`Peer ${p.name}`}>
      <View className="flex-row items-center gap-2">
        <View className={`w-[8] h-[8] rounded-full bg-${stateColor(p.state())}`} />
        <Text className={`text-xs text-${theme().mutedForeground}`}>{`${p.state()} · ICE ${p.ice()} · ${p.rtt() < 0 ? 'RTT --' : `RTT ${p.rtt().toFixed(1)} ms`}`}</Text>
      </View>
    </CardHeader>
    <CardContent className="grow flex-col gap-3">
      <Text className={`text-xs text-${theme().mutedForeground}`}>{p.candidates().length === 0 ? 'No candidate yet' : `${p.candidates().length} candidate${p.candidates().length === 1 ? '' : 's'}, first: ${p.candidates()[0]}`}</Text>
      <ScrollView className={`grow min-h-[120] rounded-md border border-${theme().border} p-2`}>
        <View className="flex-col gap-1.5">
          <For each={p.lines()}>{(l: Line, i: i32) => Bubble(l)}</For>
        </View>
      </ScrollView>
      <View className="flex-row gap-2">
        <Input className={`grow h-9 px-2 rounded-md border border-${theme().border} bg-${theme().card} text-sm text-${theme().foreground}`} placeholder="Message" value={draft()}
          onInput={(v: string) => setDraft(v)} onKeyDown={(e: ui.KeyEvent) => { if (e.key === 'Enter') send(); }} />
        <Button label="Send" onClick={send} />
      </View>
      <View className="flex-row items-center gap-2">
        <Button label="Send a file" variant="outline" onClick={() => p.sendFile('sample.bin', sample(256 * 1024))} />
        <Text className={`grow text-xs text-${theme().mutedForeground}`}>{p.transfer() === '' ? '256 KB sample, 16 KB chunks' : p.transfer()}</Text>
      </View>
      <Progress value={() => p.progress() * 100} accent />
    </CardContent>
  </Card>;
}
function PasteCard(): i32 {
  return <Card className="grow basis-0">
    <CardHeader title="Copy and paste" description="No server: the descriptions carry the candidates. Run this app on the other machine too." />
    <CardContent className="grow flex-col gap-2">
      <View className="flex-row gap-2">
        <Button label="Create offer" onClick={() => { createOffer(); }} />
        <Button label="Answer pasted offer" variant="secondary" onClick={() => { answerOffer(); }} />
        <Button label="Accept answer" variant="secondary" onClick={() => { acceptAnswer(); }} />
      </View>
      <Text className={`text-xs text-${theme().mutedForeground}`}>To copy (already in the clipboard):</Text>
      <TextArea className={`grow w-full font-mono text-xs rounded-md border border-${theme().border} bg-${theme().muted} text-${theme().foreground}`} value={localText()} onInput={(v: string) => setLocalText(v)} />
      <View className="flex-row items-center gap-2">
        <Text className={`grow text-xs text-${theme().mutedForeground}`}>Pasted from the other side:</Text>
        <Button label="Paste" size="sm" variant="ghost" onClick={() => setRemoteText(clipboardText())} />
      </View>
      <TextArea className={`grow w-full font-mono text-xs rounded-md border border-${theme().border} bg-${theme().card} text-${theme().foreground}`} value={remoteText()} onInput={(v: string) => setRemoteText(v)} />
    </CardContent>
  </Card>;
}
function RoomCard(): i32 {
  return <Card className="grow basis-0">
    <CardHeader title="Room" description="Both peers join the same room of the signalling server (signal-server.ts), on this machine or the LAN." />
    <CardContent className="flex-col gap-2">
      <Text className={`text-xs text-${theme().mutedForeground}`}>Server</Text>
      <Input className={`h-9 px-2 rounded-md border border-${theme().border} bg-${theme().card} text-sm text-${theme().foreground}`} value={server()} onInput={(v: string) => setServer(v)} />
      <Text className={`text-xs text-${theme().mutedForeground}`}>Room name</Text>
      <Input className={`h-9 px-2 rounded-md border border-${theme().border} bg-${theme().card} text-sm text-${theme().foreground}`} value={room()} onInput={(v: string) => setRoom(v)} />
      <View className="flex-row gap-2">
        <Button label="Join" onClick={joinRoom} />
        <Button label="Leave" variant="outline" onClick={hangUp} />
      </View>
    </CardContent>
  </Card>;
}
function meterWidth(): string { const n = Math.round(Math.min(1, level() * 1.6) * 100); return n === 0 ? 'w-0' : `w-${n}/100`; }
function MicBar(): i32 {
  return <View className={`flex-row items-center gap-3 px-4 py-2 rounded-lg border border-${theme().border} bg-${theme().card}`}>
    <Switch checked={() => mic !== null && micNote() !== 'Microphone off'} onChange={(on: boolean) => { toggleMic(on); }} label="Mic level" />
    <View className={`grow h-2 rounded-full overflow-hidden bg-${theme().muted}`}>
      <View className={`h-2 rounded-full ${meterWidth()} ${level() > 0.6 ? 'bg-red-500' : level() > 0.3 ? 'bg-amber-500' : 'bg-emerald-500'}`} />
    </View>
    <Text className={`text-xs text-${theme().mutedForeground}`}>{micNote()}</Text>
  </View>;
}
function App(): i32 {
  return <View className={`flex-col gap-4 p-6 h-full bg-${theme().background}`}>
    <View className="flex-row items-center justify-between">
      <View className="flex-col gap-1">
        <Text className={heading(3)}>WebRTC chat</Text>
        <Text className={mutedText()}>Data channels peer to peer: text, a file, the round-trip time.</Text>
      </View>
      <Switch checked={dark} onChange={setDark} label="Dark" />
    </View>
    <View className="flex-row items-center gap-2">
      <Tab id="local" label="This window" />
      <Tab id="paste" label="Copy and paste" />
      <Tab id="room" label="Room" />
      <Text className={`grow text-xs text-${theme().mutedForeground} pl-2`}>{step()}</Text>
      <Show when={mode() === 'local'}><Button label="Reconnect" size="sm" variant="outline" onClick={() => { connectHere(); }} /></Show>
    </View>
    <View className="grow flex-row gap-4">
      <For each={peers()}>{(p: Peer, i: i32) => PeerCard(p)}</For>
      <Show when={mode() === 'paste'}><PasteCard /></Show>
      <Show when={mode() === 'room'}><RoomCard /></Show>
      <Show when={peers().length === 0 && mode() === 'local'}>
        <Card className="grow"><CardHeader title="Not connected" description="Press Reconnect to connect two peers in this window." /></Card>
      </Show>
    </View>
    <MicBar />
  </View>;
}

// ---- the scripted session: connect here, a line each way, a file, then quit
async function script(): Promise<void> {
  await toggleMic(true);
  await connectHere();
  const [a, b] = [peers()[0], peers()[1]];
  a.say('hello from A');
  await until(() => b.lines().length === 1);
  b.say('hello from B');
  await until(() => a.lines().length === 2);
  a.sendFile('sample.bin', sample(64 * 1024));
  await until(() => b.transfer().startsWith('received'));
  await until(() => a.rtt() >= 0);
  log(`rtt measured ${a.rtt() >= 0}, mic level ${level() > 0 ? 'moving' : 'still'}`);
  hangUp();
  log('done');
  quit();
}

// the room: join, say hello once connected, quit once the other peer's hello came
async function roomScript(): Promise<void> {
  setModeSignal('room');
  joinRoom();
  const p = peers()[0];
  await until(() => p.open);
  p.say('hello');
  await until(() => p.lines().some((l: Line) => !l.mine));
  log('heard the other peer');
  setTimeout(() => { hangUp(); log('done'); quit(); }, 300);   // a moment for the other side to hear our hello too
}

if (demo === '1') script();
else if (demo === 'room') roomScript();
else if (mode() === 'local' && env('WEBRTC_AUTOCONNECT', '1') !== '0') connectHere();
render(App, 0xfafafa, (dt: number) => {
  const m = mic;
  if (m !== null) setLevel(m.level());
});
