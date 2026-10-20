# webrtc-chat

Two peers chat and send a file over WebRTC data channels ([zinc:webrtc](../../docs/plugins/webrtc.md)), with the connection state, the ICE
candidates, the round-trip time and the transfer rate on screen, and a microphone level meter ([zinc:microphone](../../docs/plugins/microphone.md)).

```sh
zinc run examples/webrtc-chat
```

Three ways to bring the peers together (the signalling: who sends the offer, the answer and the candidates to whom):

- **This window**: both peers in this program; it connects at once, with no network and no server.
- **Copy and paste**: run the app on two machines. "Create offer" on one copies the offer to the clipboard; paste it on the other and
  press "Answer pasted offer", which copies the answer; paste that back on the first and press "Accept answer". The descriptions carry the
  candidates, so nothing else is exchanged. Works on a LAN with no server; across the Internet add a STUN server to `src/peer.ts`.
- **Room**: start the signalling server on one machine, `zinc run examples/webrtc-chat/signal-server.ts` (port 8787), then on both
  machines type its address (`ws://192.168.1.20:8787`) and the same room name, and press "Join". The server only passes the offer, the
  answer and the candidates; the chat goes peer to peer.

The "Mic level" switch asks for the microphone (macOS asks once) and shows its level; the audio itself is not sent (audio tracks come
later). `zinc.json` declares the permissions the app uses: `net` and `microphone`.

`WEBRTC_DEMO=1 WEBRTC_DEMO_LOG=1` runs the scripted session the test uses (`tests/t1/webrtc_chat.sh`).
