// zinc:webrtc through the Web globals (tests/t1/webrtc.sh): no import, the compiler adds it; a description passed whole, after gathering.
const a = new RTCPeerConnection(), b = new RTCPeerConnection();
const ch = a.createDataChannel('g');
b.ondatachannel = (e: RTCDataChannelEvent) => {
  e.channel.onmessage = (m: MessageEvent) => { console.log('got ' + (m.data as string)); a.close(); b.close(); };
};
ch.onopen = () => { ch.send('global hello'); };
function gathered(p: RTCPeerConnection): Promise<void> {
  return new Promise<void>((done: () => void) => { const t = setInterval(() => { if (p.iceGatheringState === 'complete') { clearInterval(t); done(); } }, 5); });
}
async function go(): Promise<void> {
  await a.setLocalDescription(await a.createOffer());
  await gathered(a);
  await b.setRemoteDescription((a.localDescription as RTCSessionDescription).toJSON());
  await b.setLocalDescription(await b.createAnswer());
  await gathered(b);
  await a.setRemoteDescription((b.localDescription as RTCSessionDescription).toJSON());
}
go();
