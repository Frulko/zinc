import * as system from 'zinc:system';
import * as notification from 'zinc:system/notification';
// a permission the user denied: show() resolves, delivered is false and says why, nothing throws
async function main(): Promise<void> {
  console.log('permission', await notification.requestPermission());
  const o = new notification.Options('Hello');
  const n = await notification.show(o);
  console.log('delivered', n.delivered, n.reason);
  system.quit(0);
}
main();
