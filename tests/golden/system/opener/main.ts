import * as system from 'zinc:system';
import * as opener from 'zinc:system/opener';
import * as deeplink from 'zinc:system/deeplink';
async function main(): Promise<void> {
  await opener.openUrl('https://example.com/docs');
  await opener.openUrl('mailto:dev@example.com');
  try { await opener.openUrl('file:///etc/passwd'); console.log('file url: allowed'); } catch (e) { console.log('file url:', e.message); }
  try { await opener.openUrl('http://example.com'); console.log('http url: allowed'); } catch (e) { console.log('http url:', e.message); }
  await opener.reveal('/tmp');
  console.log('last', JSON.stringify(system.call('opener.last', {})));
  console.log('current', JSON.stringify(deeplink.current()));
  deeplink.onOpen((url: string) => { console.log('open-url', url); });
  deeplink.onOpenFile((p: string) => { console.log('open-file', p); system.quit(0); });
}
main();
