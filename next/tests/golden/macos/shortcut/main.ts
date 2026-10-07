import * as system from 'zinc:system';
import * as shortcut from 'zinc:system/shortcut';
async function main(): Promise<void> {
  console.log('register', await shortcut.register('Ctrl+Alt+Cmd+F13', () => console.log('hotkey callback')));
  console.log('conflict', await shortcut.register('Ctrl+Alt+Cmd+F13', () => {}));
  console.log('fire', JSON.stringify(system.call('shortcut.fire', { accelerator: 'Ctrl+Alt+Cmd+F13' })));
  setTimeout(() => {
    console.log('unregister', shortcut.unregister('Ctrl+Alt+Cmd+F13'));
    console.log('fire after unregister', JSON.stringify(system.call('shortcut.fire', { accelerator: 'Ctrl+Alt+Cmd+F13' })));
    system.quit(0);
  }, 300);
}
main();
