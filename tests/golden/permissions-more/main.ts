// The other host families (ZN-322.02): with only net:127.0.0.1 granted, a child process, sockets, osc and mqtt to another host, and listening are
// refused when enforced, the error naming the permission; the granted host is reached (tests/t0/permissions.sh).
import * as proc from 'zinc:process';
import * as socket from 'zinc:socket';
import * as osc from 'zinc:osc';
import { MqttClient } from 'zinc:mqtt';

function said(e: Error): string { const m = e.message; const at = m.indexOf('needs the permission'); return at >= 0 ? 'refused: ' + m.slice(at) : 'allowed (' + m.slice(0, 40) + ')'; }
function attempt(what: string, f: () => void): void { try { f(); console.log(`${what}: done`); } catch (e) { console.log(`${what}: ${said(e as Error)}`); } }

attempt('osc send blocked.invalid', () => osc.send('blocked.invalid', 9000, '/x', [1]));
attempt('osc send 127.0.0.1', () => osc.send('127.0.0.1', 9, '/x', [1]));
attempt('osc listen', () => osc.listen(0, (m: osc.OscMessage): void => {}));

async function main(): Promise<void> {
  try { await proc.run('echo', ['hi'], {}); console.log('process: done'); } catch (e) { console.log(`process: ${said(e as Error)}`); }
  try { await socket.connect('blocked.invalid', 80); console.log('socket blocked.invalid: done'); } catch (e) { console.log(`socket blocked.invalid: ${said(e as Error)}`); }
  try { await socket.connect('127.0.0.1', 9); console.log('socket 127.0.0.1: done'); } catch (e) { console.log(`socket 127.0.0.1: ${said(e as Error)}`); }
  try { await new MqttClient('blocked.invalid', 1883, 'zn').connect(); console.log('mqtt blocked.invalid: done'); } catch (e) { console.log(`mqtt blocked.invalid: ${said(e as Error)}`); }
}
main().then(() => osc.close());
