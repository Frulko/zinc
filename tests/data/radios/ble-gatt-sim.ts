import * as ble from 'zinc:ble';
import { exit } from 'zinc:sys';
function check(ok: boolean, why: string): void { if (!ok) throw new Error(why); }
let notifications: i32 = 0, closed: i32 = 0;
const timeout = setTimeout(() => { throw new Error('GATT simulator timed out'); }, 3000);
ble.connectGatt('zinc-sim', (c: ble.GattConnection): void => {
  const services = c.services(); check(services.length === 1, 'service count');
  const characteristic = services[0].characteristics[0];
  c.read(characteristic, (value: u8[], error: string): void => {
    check(error === '' && value[0] === 100, 'initial binary read');
    const cancelled = c.write(characteristic, [7], (error: string): void => { throw new Error('cancelled simulator callback'); });
    c.cancel(cancelled);
    c.notify(characteristic, (value: u8[]): void => {
      check(value.length === 3 && value[0] === 255 && value[1] === 0 && value[2] === 10, 'binary notification'); notifications++;
      c.stopNotify(characteristic, (error: string): void => {
        check(error === '', 'stop notify');
        c.read(characteristic, (value: u8[], error: string): void => {
          check(error === '' && value[0] === 255, 'stored value'); c.close();
        });
      });
    }, (error: string): void => {
      check(error === '', 'start notify'); c.write(characteristic, [255, 0, 10], (error: string): void => check(error === '', 'write ack'));
    });
  });
}, (c: ble.GattConnection, error: string): void => {
  check(error === '' && notifications === 1 && closed === 0, 'close once'); closed++; clearTimeout(timeout); ble.stop(); console.log('ble generic GATT simulator ok'); exit(0);
});
