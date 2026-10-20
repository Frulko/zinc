import * as system from 'zinc:system';
system.call('notification.notify', { title: 'Build done', body: 'ok' });
console.log(system.backend, system.supports('tray'));
system.on('menu-click', (args: string[]) => { console.log('menu', args[0]); });
system.on('tray-click', (args: string[]) => { console.log('tray', args[0]); system.quit(0); });
