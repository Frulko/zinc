import * as system from 'zinc:system';
import * as notification from 'zinc:system/notification';

async function main(): Promise<void> {
  console.log('permission', await notification.requestPermission(), 'backend', notification.backend());
  const o = new notification.Options('Build finished');
  o.id = 'build-42'; o.subtitle = 'zinc'; o.body = '3 warnings'; o.group = 'builds';
  o.actions = [new notification.Action('open', 'Open'), new notification.Action('dismiss', 'Dismiss')];
  o.replyPlaceholder = 'Reply...';
  const n = await notification.show(o);
  console.log('delivered', n.delivered, JSON.stringify(n.reason));
  const again = new notification.Options('Build finished again');
  again.id = 'build-42'; again.body = 'replaces the first';
  const n2 = await notification.show(again);   // the same id replaces the first, and the events of that id go to the newest
  n2.onClick(() => console.log('clicked'));
  n2.onAction((a: string) => console.log('action', a));
  n2.onReply((t: string) => console.log('reply', t));
  n2.onClose((r: string) => console.log('closed', r));
  const second = new notification.Options('Other');
  second.id = 'other';
  await notification.show(second);
  console.log('delivered list', JSON.stringify(await notification.delivered()));
  notification.cancel('other');
  console.log('after cancel', JSON.stringify(await notification.delivered()));
  system.on('shortcut', (a: string[]) => { console.log('done', a[0]); system.quit(0); });
}
main();
