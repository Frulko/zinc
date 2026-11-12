import * as wifi from './wifi';
import { step } from './fake';
let oldResults: i32 = 0;
let newResults: i32 = 0;
let changes: i32 = 0;
wifi.start((info: wifi.WifiInfo): void => {
  changes++;
  if (info.state === 'stop') wifi.stop();
});
wifi.scan((networks: wifi.Network[]): void => { oldResults++; });
step('stop', '61\t80\t0');
if (oldResults !== 0) throw new Error('stopped observer delivered scan');
wifi.start((info: wifi.WifiInfo): void => {
  if (info.state === 'restart') {
    wifi.stop();
    wifi.start((next: wifi.WifiInfo): void => {});
    wifi.scan((networks: wifi.Network[]): void => {
      if (networks.length !== 1 || networks[0].ssid !== 'b') throw new Error('old poll delivered new scan');
      newResults++;
    });
  }
});
wifi.scan((networks: wifi.Network[]): void => { oldResults++; });
step('restart', '61\t80\t0');
if (oldResults !== 0 || newResults !== 0) throw new Error('old poll crossed restart');
step('ready', '62\t90\t0');
if (newResults !== 1) throw new Error('restarted scan missing');
wifi.start((info: wifi.WifiInfo): void => {
  if (info.state === 'replace') wifi.scan((networks: wifi.Network[]): void => {
    if (networks.length !== 1 || networks[0].ssid !== 'c') throw new Error('replacement got old result');
    newResults++;
  });
});
wifi.scan((networks: wifi.Network[]): void => { oldResults++; });
step('replace', '61\t80\t0');
if (newResults !== 1 || oldResults !== 0) throw new Error('old poll crossed scan replacement');
step('done', '63\t70\t1');
if (newResults !== 2) throw new Error('replacement scan missing');
wifi.scan((networks: wifi.Network[]): void => { oldResults++; });
wifi.connect('x', ''); step('connected', '61\t80\t0');
if (oldResults !== 0) throw new Error('connection delivered cancelled scan');
wifi.stop(); wifi.stop();
let rejected = false;
try { wifi.scan((networks: wifi.Network[]): void => {}); } catch (e) { rejected = true; }
if (!rejected || changes !== 2) throw new Error('closed observer accepted scan');
console.log('wifi public reentrancy ok');
