// Desktop integration demo (zinc:system): a native application menu, a dock badge and progress, a dock menu, bounce, notifications and a context menu.
//   zinc run examples/system/desktop        (macOS: runs from a dev bundle, so the menu bar and the dock show "Desktop Demo")
// Headless: ZINC_DETERMINISTIC=1 uses the recording simulator (every call prints a [system] line).
import { createSignal } from 'zinc:ui/solid';
import { render } from 'zinc:ui/solid';
import * as system from 'zinc:system';
import * as menu from 'zinc:system/menu';
import * as dock from 'zinc:system/dock';
import * as notification from 'zinc:system/notification';

const [status, setStatus] = createSignal<string>('Choose something in the menu bar, the dock menu or the buttons.');
const [count, setCount] = createSignal<number>(0);
let notified: i32 = 0;

function bump(): void { setCount(count() + 1); dock.setBadge(String(count())); setStatus('Badge ' + count()); }
async function notify(): Promise<void> {
  const perm = await notification.requestPermission();
  const o = new notification.Options('Hello from Zinc');
  o.id = 'demo-' + (++notified); o.body = 'Sent by the desktop demo (' + notification.backend() + ' backend)';
  o.actions = [new notification.Action('open', 'Open')];
  const n = await notification.show(o);
  setStatus(n.delivered ? 'Notification sent (permission ' + perm + ')' : 'Not delivered: ' + n.reason);
  n.onClick(() => setStatus('Notification clicked'));
  n.onAction((a: string) => setStatus('Notification action: ' + a));
}
async function context(): Promise<void> {
  const picked = await menu.popup([menu.item('ctx-badge', 'Add to the badge'), menu.item('ctx-clear', 'Clear the badge'), menu.separator(), menu.role('copy')], 100, 100);
  setStatus('Context menu: ' + (picked.length > 0 ? picked : 'dismissed'));
}

menu.setApp([
  menu.role('appMenu'),
  menu.submenu('Demo', [
    menu.item('notify', 'Send a notification', 'CmdOrCtrl+N'),
    menu.item('badge', 'Add to the dock badge', 'CmdOrCtrl+B'),
    menu.item('clear', 'Clear the badge', 'CmdOrCtrl+Shift+B'),
    menu.separator(),
    menu.item('bounce', 'Bounce the dock icon', 'CmdOrCtrl+J'),
    menu.item('progress', 'Dock progress 0 / 50 / 100%', 'CmdOrCtrl+P'),
  ]),
  menu.role('editMenu'), menu.role('viewMenu'), menu.role('windowMenu'),
]);
let step: i32 = 0;
menu.onClick('notify', () => { notify(); });
menu.onClick('badge', () => bump());
menu.onClick('clear', () => { setCount(0); dock.setBadge(''); setStatus('Badge cleared'); });
menu.onClick('bounce', () => { dock.bounce('informational'); setStatus('Bounced'); });
menu.onClick('progress', () => { step = (step + 1) % 3; dock.setProgress(step === 0 ? -1 : step === 1 ? 0.5 : 1); setStatus('Dock progress ' + (step === 0 ? 'off' : step === 1 ? '50%' : '100%')); });
menu.onClick('ctx-badge', () => bump());
menu.onClick('ctx-clear', () => { setCount(0); dock.setBadge(''); });
menu.onClick('role:quit', () => system.quit(0));
dock.setMenu([menu.item('notify', 'Send a notification'), menu.item('badge', 'Add to the badge')]);
dock.onClick('notify', () => { notify(); });

function App(): i32 {
  return <view class="flex-col gap-3 p-6 h-full bg-slate-950">
    <text class="text-xl font-bold text-white">Desktop integration</text>
    <text class="text-sm text-slate-300">{status()}</text>
    <view class="flex-row gap-2">
      <button class="bg-sky-600 hover:bg-sky-500 rounded-md px-3 py-1 cursor-pointer" onClick={() => { notify(); }}><text class="text-sm text-white">Notify</text></button>
      <button class="bg-slate-700 hover:bg-slate-600 rounded-md px-3 py-1 cursor-pointer" onClick={() => bump()}><text class="text-sm text-white">Badge +1</text></button>
      <button class="bg-slate-700 hover:bg-slate-600 rounded-md px-3 py-1 cursor-pointer" onClick={() => { dock.bounce('informational'); setStatus('Bounced'); }}><text class="text-sm text-white">Bounce</text></button>
      <button class="bg-slate-700 hover:bg-slate-600 rounded-md px-3 py-1 cursor-pointer" onClick={() => { context(); }}><text class="text-sm text-white">Context menu</text></button>
    </view>
    <text class="text-xs text-slate-500">Cmd+N notify, Cmd+B badge, Cmd+J bounce, Cmd+P progress. Right-click the dock icon for its menu.</text>
  </view>;
}
render(App, 0x020617, null);
