import * as ble from 'zinc:ble';
function check(ok: boolean, why: string): void { if (!ok) throw new Error(why); }
check(ble.has(), 'simulated adapter missing');
check(!ble.powered(false), 'simulator must not change hardware power');
let count = 0;
const deadline = setTimeout(() => { ble.stop(); throw new Error('BLE simulator did not finish'); }, 1500);
ble.scanAll((d: ble.Advertisement): void => {
  check(d.name === 'Zinc sim' && d.rssi === -42 && d.uuids[0] === ble.UART_SERVICE, 'raw simulator data');
  ble.stop();
  ble.scan((peer: ble.Device): void => {
    ble.stopScan();
    ble.connect(peer.id, (l: ble.Link): void => l.send('echo'), (l: ble.Link, text: string): void => {
      check(text === 'echo', 'UART simulator bytes'); count++; l.close();
    }, (l: ble.Link): void => { ble.stop(); clearTimeout(deadline); check(count === 1, 'one simulated message'); console.log('ble native simulator and UART ok'); });
  }, 0);
}, 0);
