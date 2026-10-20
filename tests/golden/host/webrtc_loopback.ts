// zinc:webrtc in one process, no network and no server (tests/t1/webrtc.sh): two peer connections with no ICE server connect through
// their host candidates (127.0.0.1 among them), the SDP and the candidates passed in memory. Trickle ICE, an ordered channel (text and
// bytes both ways, in order), an unordered unreliable one, a channel the answerer opens (ondatachannel), a 200 KB message, getStats,
// close events on both sides, the errors; then the same without trickle (the descriptions carry the candidates). Prints only lines that
// are the same on every run.
import { RTCPeerConnection, RTCDataChannel, RTCDataChannelEvent, RTCPeerConnectionIceEvent, RTCIceCandidate, RTCSessionDescription, RTCStats } from 'zinc:webrtc';
import { MessageEvent, Event, DOMException } from 'zinc:web';

// No timeout here: QuickJS runs the timers of a program that does not draw on a virtual clock (Date.now too), so the test's `timeout`
// bounds the run, and the lines printed so far say where it stopped.
function until(cond: () => boolean): Promise<void> {
  return new Promise<void>((done: () => void) => {
    const t = setInterval(() => { if (cond()) { clearInterval(t); done(); } }, 5);
  });
}
function sum(b: u8[]): number { let s = 0; for (let i = 0; i < b.length; i++) s = (s * 31 + b[i]) % 1000003; return s; }
function bytesOf(data: unknown): u8[] { return data as u8[]; }

// a <-> b with trickle ICE: each candidate goes to the other side once its remote description is there
function link(a: RTCPeerConnection, b: RTCPeerConnection): void {
  const pass = (from: RTCPeerConnection, to: RTCPeerConnection) => {
    const queued: RTCIceCandidate[] = [];
    from.onicecandidate = (e: RTCPeerConnectionIceEvent) => {
      if (e.candidate === null) return;
      const c = e.candidate as RTCIceCandidate;
      if (to.remoteDescription === null) queued.push(c); else to.addIceCandidate(c.toJSON());
    };
    to.onsignalingstatechange = (_e: Event) => {
      if (to.remoteDescription !== null) { for (const c of queued) to.addIceCandidate(c.toJSON()); queued.length = 0; }
    };
  };
  pass(a, b); pass(b, a);
}

async function trickle(): Promise<void> {
  const a = new RTCPeerConnection({ iceServers: [] }), b = new RTCPeerConnection();
  link(a, b);
  const states: string[] = [];
  a.onconnectionstatechange = (_e: Event) => { states.push(a.connectionState); };
  const got = new Map<string, RTCDataChannel>();
  b.ondatachannel = (e: RTCDataChannelEvent) => { got.set(e.channel.label, e.channel); };
  const chat = a.createDataChannel('chat', { protocol: 'zinc-chat' });
  const fast = a.createDataChannel('fast', { ordered: false, maxRetransmits: 0 });
  console.log(`created ${chat.label} ${chat.readyState} ordered ${chat.ordered} | ${fast.label} ordered ${fast.ordered} maxRetransmits ${fast.maxRetransmits}`);
  const offer = await a.createOffer();
  console.log(`offer ${offer.type} ${(offer.sdp ?? '').indexOf('m=application') >= 0 ? 'with' : 'without'} m=application`);
  await a.setLocalDescription(offer);
  console.log('a ' + a.signalingState);
  await b.setRemoteDescription(offer);
  console.log('b ' + b.signalingState);
  const answer = await b.createAnswer();
  await b.setLocalDescription(answer);
  await a.setRemoteDescription(answer);
  console.log(`a ${a.signalingState} b ${b.signalingState}`);
  let opened = 0;
  chat.onopen = (_e: Event) => { opened++; };
  await until(() => opened === 1 && got.size === 2 && a.connectionState === 'connected');
  console.log(`connected: ${states.join(' > ')}; ice ${a.iceConnectionState === 'connected' || a.iceConnectionState === 'completed' ? 'up' : a.iceConnectionState}`);
  const bChat = got.get('chat') as RTCDataChannel, bFast = got.get('fast') as RTCDataChannel;
  console.log(`b got ${bChat.label} ${bChat.readyState} protocol ${bChat.protocol} | ${bFast.label} ordered ${bFast.ordered} maxRetransmits ${bFast.maxRetransmits}`);

  // ordered: text and bytes both ways, in order
  const atB: string[] = [], atA: string[] = [];
  bChat.onmessage = (e: MessageEvent) => {
    atB.push(typeof e.data === 'string' ? 't' + (e.data as string) : 'b' + bytesOf(e.data).join('.'));
    if (typeof e.data === 'string') bChat.send('re:' + (e.data as string));
  };
  chat.onmessage = (e: MessageEvent) => { atA.push(typeof e.data === 'string' ? (e.data as string) : 'b' + bytesOf(e.data).join('.')); };
  for (let i = 0; i < 20; i++) { const b: u8[] = [i, 255, 0]; if (i % 5 === 4) chat.send(b); else chat.send('m' + i + ' é✓'); }
  await until(() => atB.length === 20 && atA.length === 16);
  console.log('b received ' + atB.join(','));
  console.log('a received ' + atA.join(','));
  const three: u8[] = [1, 2, 3];
  bChat.send(three);
  await until(() => atA.length === 17);
  console.log('a received bytes ' + atA[16]);

  // unordered, unreliable: on a loopback nothing is lost
  const fastGot: string[] = [];
  bFast.onmessage = (e: MessageEvent) => { fastGot.push(e.data as string); };
  for (let i = 0; i < 10; i++) fast.send('u' + i);
  await until(() => fastGot.length === 10);
  console.log('unordered ' + fastGot.slice().sort((x: string, y: string) => x < y ? -1 : x > y ? 1 : 0).join(','));

  // a channel the answerer opens
  let back: RTCDataChannel | null = null;
  a.ondatachannel = (e: RTCDataChannelEvent) => { back = e.channel; };
  const bBack = b.createDataChannel('back');
  let backOpen = false, backMsg = '';
  bBack.onopen = (_e: Event) => { backOpen = true; bBack.send('from b'); };
  await until(() => back !== null && backOpen);
  (back as RTCDataChannel).onmessage = (e: MessageEvent) => { backMsg = e.data as string; };
  await until(() => backMsg !== '');
  console.log(`a got ${(back as RTCDataChannel).label} from b: ${backMsg}`);

  // 200 KB in one message
  const big: u8[] = [];
  for (let i = 0; i < 200 * 1024; i++) big.push((i * 7 + (i >> 8)) & 255);
  let bigGot: u8[] = [];
  bChat.onmessage = (e: MessageEvent) => { bigGot = bytesOf(e.data); };
  console.log(`maxMessageSize ${chat.maxMessageSize >= 200 * 1024}`);
  chat.send(big);
  await until(() => bigGot.length > 0);
  console.log(`large ${bigGot.length} bytes, same ${bigGot.length === big.length && sum(bigGot) === sum(big)}`);
  try { chat.send(big.concat(big)); } catch (e) { console.log('too large ' + (e as Error).name); }

  const st = await a.getStats();
  const tr = st.get('T');
  const cp = st.get('CP');
  console.log(`stats sent ${tr !== undefined && tr.messagesSent >= 31} received ${tr !== undefined && tr.messagesReceived >= 17} pair ${cp !== undefined && cp.localAddress !== ''} opened ${(st.get('P') as RTCStats).dataChannelsOpened}`);

  // close: both sides
  const closed: string[] = [];
  chat.onclose = (_e: Event) => { closed.push('a:' + chat.readyState); };
  bChat.onclose = (_e: Event) => { closed.push('b:' + bChat.readyState); };
  chat.close();
  console.log('closing ' + chat.readyState);
  await until(() => closed.length === 2);
  console.log('closed ' + closed.slice().sort((x: string, y: string) => x < y ? -1 : x > y ? 1 : 0).join(' '));
  try { chat.send('late'); } catch (e) { console.log('send after close ' + (e as DOMException).name); }
  a.close(); b.close();
  console.log(`closed pcs ${a.connectionState} ${a.signalingState} fast ${fast.readyState}`);
  await until(() => fast.readyState === 'closed');
  try { a.createDataChannel('x'); } catch (e) { console.log('closed pc ' + (e as DOMException).name); }
}

async function errors(): Promise<void> {
  const p = new RTCPeerConnection();
  try { await p.setRemoteDescription({ type: 'offer', sdp: 'garbage' }); console.log('garbage accepted'); } catch (e) { console.log(`garbage ${(e as DOMException).name} ${e instanceof DOMException}`); }
  try { await p.createAnswer(); } catch (e) { console.log('answer without offer ' + (e as DOMException).name); }
  try { await p.addIceCandidate({ candidate: 'candidate:1 1 UDP 1 127.0.0.1 9 typ host', sdpMid: '0' }); } catch (e) { console.log('candidate first ' + (e as DOMException).name); }
  try { p.createDataChannel('x', { maxRetransmits: 1, maxPacketLifeTime: 10 }); } catch (e) { console.log('both limits ' + (e as Error).name); }
  try { new RTCPeerConnection({ iceServers: [{ urls: 'nonsense://' }] }); console.log('bad url accepted'); } catch (e) { console.log('bad url ' + (e as DOMException).name); }
  const c = new RTCIceCandidate({ candidate: 'candidate:842163049 1 udp 1677729535 192.0.2.7 46154 typ srflx raddr 0.0.0.0 rport 0', sdpMid: '0' });
  console.log(`candidate ${c.protocol} ${c.address} ${c.port} ${c.type} ${c.priority}`);
  p.close();
}

// without trickle: wait for gathering, then pass the whole description
async function whole(): Promise<void> {
  const a = new RTCPeerConnection(), b = new RTCPeerConnection();
  const ch = a.createDataChannel('whole');
  let msg = '';
  b.ondatachannel = (e: RTCDataChannelEvent) => { e.channel.onmessage = (m: MessageEvent) => { msg = m.data as string; }; };
  ch.onopen = (_e: Event) => { ch.send('no trickle'); };
  await a.setLocalDescription(await a.createOffer());
  await until(() => a.iceGatheringState === 'complete');
  const offer = a.localDescription;
  console.log(`offer has candidates ${offer !== null && offer.sdp.indexOf('a=candidate:') >= 0}`);
  await b.setRemoteDescription((offer as RTCSessionDescription).toJSON());
  await b.setLocalDescription(await b.createAnswer());
  await until(() => b.iceGatheringState === 'complete');
  await a.setRemoteDescription((b.localDescription as RTCSessionDescription).toJSON());
  await until(() => msg !== '');
  console.log('whole ' + msg);
  a.close(); b.close();
}

async function main(): Promise<void> {
  await trickle();
  await errors();
  await whole();
  console.log('done');
}
main();
