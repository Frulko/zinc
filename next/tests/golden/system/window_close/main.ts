// no veto: after the handlers the close goes ahead (window.confirmClose), the simulator only logs it and keeps running to the drop
import * as system from 'zinc:system';
system.on('window', (args: string[]) => { console.log('window', args[0]); });
system.on('drop', (args: string[]) => { console.log('dropped', args.length, args[0], args[1]); system.quit(0); });
