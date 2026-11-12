import * as wifi from 'zinc:wifi';
// This fixture never starts observation, scans, activates a connection, or accesses a host device.
if (wifi.has()) throw new Error('an idle Wi-Fi module must not claim an observed adapter');
if (wifi.info().state !== 'discovering') throw new Error('idle Wi-Fi state');
wifi.stop(); wifi.stop();
if (wifi.has()) throw new Error('closed Wi-Fi module');
console.log('wifi public idle ok');
