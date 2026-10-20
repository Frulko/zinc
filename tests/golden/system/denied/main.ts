import * as system from 'zinc:system';
import { isSupported } from 'zinc:system/tray';
// the tray permission is listed, the menu one is not: the native gate refuses the op even though the program compiled
try { system.call('tray.create', { id: 'main', tooltip: 'hi' }); console.log('tray created'); } catch (e) { console.log('tray', e.message); }
try { system.call('menu.setApp', { template: [] }); console.log('menu set'); } catch (e) { console.log('menu', e.message); }
console.log(isSupported());
