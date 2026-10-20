// close-to-tray: the handler vetoes the close, so no confirmClose op is sent and the drop at tick 4 still arrives
import * as system from 'zinc:system';
system.on('window', (args: string[]) => { console.log('window', args[0]); if (args[0] === 'close-requested') system.preventClose(); });
system.on('drop', (args: string[]) => { console.log('dropped', args.length, args[0], args[1]); system.quit(0); });
