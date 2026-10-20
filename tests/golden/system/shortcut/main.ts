import * as system from 'zinc:system';
import * as shortcut from 'zinc:system/shortcut';
async function main(): Promise<void> {
  console.log('register', await shortcut.register('CmdOrCtrl+Shift+Space', () => console.log('toggle fired')));
  console.log('same again', await shortcut.register('Cmd+Shift+Space', () => {}));
  console.log('invalid', await shortcut.register('Cmd+Shift', () => {}));
  console.log('unregister', shortcut.unregister('CmdOrCtrl+Shift+Space'), shortcut.unregister('CmdOrCtrl+Shift+Space'));
  console.log('register after unregister', await shortcut.register('Cmd+Shift+Space', () => console.log('second fired')));
  system.on('power', (a: string[]) => system.quit(0));
}
main();
