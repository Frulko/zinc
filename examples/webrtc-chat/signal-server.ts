// The signalling server of webrtc-chat: a WebSocket server on zinc:socket that pairs two peers by room name and relays their messages
// (offer, answer, candidates) from one to the other. It carries no chat: once the peers are connected, the data goes peer to peer.
//   zinc run examples/webrtc-chat/signal-server.ts            (port 8787; SIGNAL_PORT=9000 for another, 0 for any free one)
// A peer connects to ws://<this machine>:8787/<room>. The first one in a room hears {"type":"waiting"}, then {"type":"joined"} when the
// second arrives (the first one then makes the offer); a third is refused with {"type":"full"}; {"type":"left"} when the other goes.
import { serveWebSocket, WebSocket, WebSocketServer, UpgradeRequest, MessageEvent as WsMessage } from 'zinc:socket';
import * as sys from 'zinc:sys';

const rooms = new Map<string, WebSocket[]>();
const port = sys.env('SIGNAL_PORT') !== '' ? parseInt(sys.env('SIGNAL_PORT')) : 8787;

function roomOf(path: string): string {
  let name = decodeURIComponent(path.split('?')[0]);
  while (name.startsWith('/')) name = name.substring(1);
  return name === '' ? 'lobby' : name;
}

serveWebSocket(port, (ws: WebSocket, req: UpgradeRequest) => {
  const room = roomOf(req.path);
  const peers = rooms.get(room) ?? [];
  if (peers.length >= 2) { ws.send('{"type":"full"}'); ws.close(); return; }
  peers.push(ws);
  rooms.set(room, peers);
  console.log(`room ${room}: ${peers.length} peer${peers.length === 1 ? '' : 's'}`);
  if (peers.length === 1) ws.send('{"type":"waiting"}');
  else { peers[0].send('{"type":"joined","offer":true}'); ws.send('{"type":"joined","offer":false}'); }
  ws.onmessage = (e: WsMessage) => {
    for (const other of rooms.get(room) ?? []) if (other !== ws) other.send(e.data);
  };
  ws.onclose = () => {
    const left = (rooms.get(room) ?? []).filter((p: WebSocket) => p !== ws);
    if (left.length === 0) rooms.delete(room); else rooms.set(room, left);
    for (const other of left) other.send('{"type":"left"}');
    console.log(`room ${room}: ${left.length} peer${left.length === 1 ? '' : 's'}`);
  };
}).then((srv: WebSocketServer) => console.log(`signalling on ws://0.0.0.0:${srv.port}/<room>`))
  .catch((e: Error) => { console.log('cannot listen on ' + port + ': ' + e.message); sys.exit(1); });
