// zinc:system on a phone (ZN-628): the share sheet, a link opened by the system, a local notification, the document and photo pickers, deep
// links (app.urlSchemes: zincdemo://...). Buttons for a person; SERVICES_DO=share|open|notify|pick|photo does one 1 s after the start, for a
// scripted run (xcrun simctl launch with SIMCTL_CHILD_SERVICES_DO, adb shell am start --es zinc.env "SERVICES_DO=share").
import { createSignal } from 'zinc:ui/solid';
import { render } from 'zinc:ui/solid';
import { env } from 'zinc:sys';
import * as system from 'zinc:system';
import * as share from 'zinc:system/share';
import * as opener from 'zinc:system/opener';
import * as notification from 'zinc:system/notification';
import * as dialog from 'zinc:system/dialog';
import * as deeplink from 'zinc:system/deeplink';

const [status, setStatus] = createSignal<string>('backend ' + system.backend);
function say(s: string): void { console.log(s); setStatus(s); }

async function doShare(): Promise<void> {
  const c = new share.ShareContent();
  c.text = 'Made with Zinc';
  c.url = 'https://zinc.dev';
  c.title = 'Zinc';
  say('share ' + (await share.share(c)));
}
async function doOpen(): Promise<void> { await opener.openUrl('https://example.org'); say('opened https://example.org'); }
let sent: i32 = 0;
async function doNotify(): Promise<void> {
  const perm = await notification.requestPermission();
  const o = new notification.Options('Hello from Zinc');
  o.id = 'phone-' + (++sent);
  o.body = 'A local notification (permission ' + perm + ')';
  const n = await notification.show(o);
  say(n.delivered ? 'notified ' + o.id + ' (permission ' + perm + ')' : 'not delivered: ' + n.reason);
  n.onClick(() => say('notification tapped'));
}
async function doPick(images: boolean): Promise<void> {
  const o = new dialog.OpenOptions();
  if (images) o.filters = [new dialog.Filter('Images', ['png', 'jpg', 'heic'])];
  const paths = await dialog.open(o);
  say(paths === null ? 'picked nothing' : 'picked ' + paths.join(', '));
}

for (const u of deeplink.current()) say('started by ' + u);
deeplink.onOpen((url: string) => say('deep link ' + url));
console.log('backend ' + system.backend);

const job = env('SERVICES_DO');
if (job.length > 0) setTimeout(() => {
  if (job === 'share') doShare(); else if (job === 'open') doOpen(); else if (job === 'notify') doNotify(); else if (job === 'pick') doPick(false); else if (job === 'photo') doPick(true);
}, 1000);

function Action(props: { label: string; run: () => void }): i32 {
  return <Button className="bg-sky-600 rounded-lg px-4 py-3" onClick={props.run}><Text className="text-base text-white">{props.label}</Text></Button>;
}
function App(): i32 {
  return <View className="flex-col gap-3 p-6 pt-16 h-full bg-slate-950">
    <Text className="text-2xl font-bold text-white">Phone services</Text>
    <Text className="text-sm text-slate-300">{status()}</Text>
    <Action label="Share" run={() => { doShare(); }} />
    <Action label="Open a link" run={() => { doOpen(); }} />
    <Action label="Notify" run={() => { doNotify(); }} />
    <Action label="Pick a document" run={() => { doPick(false); }} />
    <Action label="Pick a photo" run={() => { doPick(true); }} />
  </View>;
}
render(App, 0x020617, null);
