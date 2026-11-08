// The fetch proxy of an exported page (tests/t1/web_proxy.sh): data/target.txt (written by the test) names a server of a listed host that sends no CORS headers,
// then one of a host that is not listed. The first answers through the proxy; the second is the browser's own request, which CORS refuses.
import * as fs from 'zinc:fs';

const urls = fs.readText('data/target.txt').trim().split('\n');
async function main(): Promise<void> {
  try {
    const r = await fetch(urls[0]);
    console.log(`listed: ${r.status} ${(await r.text()).trim()}`);
  } catch (e) { console.log(`listed: failed ${e}`); }
  try {
    const r = await fetch(urls[1]);
    console.log(`unlisted: ${r.status}`);
  } catch (e) { console.log('unlisted: refused'); }
}
main();
