import { fetch, serve, Headers, Request, Reply } from 'zinc:net';
import { env } from 'zinc:sys';
// zinc:net fetch sends the program's User-Agent alone when it gives one (it went out after zinc's own: MusicBrainz asks each app to name
// itself), and zinc/0.1 otherwise. NET_UA_SERVE=1: the server, which answers each request with the User-Agent values it got; else the client.
if (env('NET_UA_SERVE') === '1') {
  serve(18845, (req: Request): Reply => ({ status: 200, body: req.headers.get('user-agent'), contentType: 'text/plain' }));
} else {
  ask();
}
async function ask(): Promise<void> {
  const h = new Headers();
  h.set('User-Agent', 'MyApp/1.0 ( https://example.org )');
  const own = await (await fetch('http://127.0.0.1:18845/', { headers: h })).text();
  const none = await (await fetch('http://127.0.0.1:18845/')).text();
  console.log(`${own} | ${none}`);
}
