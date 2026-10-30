// The dev bridge fixture (tests/t1/web_bridge.sh): zinc:process has no browser backend, so under zinc dev --target web its native side runs on
// this machine. A child's output comes back through a callback, its result through a promise.
import { spawn, run } from 'zinc:process';

const p = spawn('echo', ['bridge-line'], {});
p.onStdout((line: string) => { console.log('stdout: ' + line); });
run('echo', ['bridge-run'], {}).then((r) => { console.log('run: ' + r.code + ' ' + r.stdout.trim()); });
