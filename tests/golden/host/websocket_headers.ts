import { serveWebSocket, WebSocket, UpgradeRequest } from 'zinc:socket';
// Extra handshake headers of a client WebSocket (Origin for Discord's remote-auth gateway): the server sees them, a header that would
// split the request is refused before anything is sent.
async function main(): Promise<void> {
  const wss = await serveWebSocket(0, (ws: WebSocket, req: UpgradeRequest) => {
    console.log('origin', req.header('origin'), 'agent', req.header('user-agent'));
    ws.close();
  }, '127.0.0.1');
  await new Promise<void>((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${wss.port}/g`, { headers: [['Origin', 'https://discord.com'], ['User-Agent', 'zinc-test/1']] });
    ws.onclose = () => { resolve(); };
  });
  const bad = new WebSocket(`ws://127.0.0.1:${wss.port}/g`, { headers: [['X-A', 'a\r\nX-B: b']] });
  console.log('bad state', bad.readyState);
  wss.close();
}
main();
