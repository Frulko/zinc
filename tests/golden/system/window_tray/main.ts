import * as system from 'zinc:system';
import * as tray from 'zinc:system/tray';
import * as window from 'zinc:system/window';
// close-to-tray: closing the window hides it (the close is kept open), a left click on the tray icon shows it again
async function main(): Promise<void> {
  const o = new tray.Options('main'); o.tooltip = 'Window tray';
  const t = await tray.create(o);
  window.onCloseRequested(() => { console.log('close requested: hiding instead'); window.keepOpen(); window.hide(); });
  t.onClick((button: string, double: boolean) => { console.log('tray click', button); window.show(); });
  window.setTitle('Demo');
  console.log('state', JSON.stringify(window.state()));
  system.on('shortcut', (a: string[]) => system.quit(0));
}
main();
