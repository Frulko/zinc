// zinc-test: requires process
// zinc:sys process additions: environment, cwd, stdout without newline, UTF-8 bytes, signals delivered on the event
// loop (SIGTERM handled instead of terminating), stdin to EOF (the test runner gives an empty stdin).
import * as sys from 'zinc:sys';

sys.setEnv('ZINC_TEST_VAR', 'value');
console.log(sys.env('ZINC_TEST_VAR'), sys.envKeys().includes('ZINC_TEST_VAR'));
sys.unsetEnv('ZINC_TEST_VAR');
console.log(sys.env('ZINC_TEST_VAR') === '', sys.envKeys().includes('ZINC_TEST_VAR'));
console.log(sys.pid() > 0, sys.cwd().length > 0, sys.isatty(0));
const here = sys.cwd();
console.log(sys.chdir('/'), sys.cwd(), sys.chdir('/definitely/not/here'));
sys.chdir(here);
sys.write('partial ');
sys.write('line\n');
console.log(sys.utf8Decode(sys.utf8Encode('ok €')), sys.utf8Encode('é'), sys.randomBytes(4).length);
try { sys.onSignal('SIGNOPE', () => {}); } catch (e) { console.log(e.message); }
try { sys.kill(sys.pid(), 'SIGNOPE'); } catch (e) { console.log(e.message); }

let terms = 0;
sys.onSignal('SIGUSR1', () => {
  console.log('SIGUSR1');
  sys.kill(sys.pid(), 'SIGTERM');
});
sys.onSignal('SIGTERM', () => {
  terms++;
  console.log('SIGTERM', terms, '(handled: the program drains and exits by itself)');
  if (terms < 2) sys.kill(sys.pid(), 'SIGTERM');
});
let input = '';
sys.onStdin((chunk: string) => {
  if (chunk.length > 0) { input += chunk; return; }
  console.log('stdin eof', input.length);
  sys.kill(sys.pid(), 'SIGUSR1');
});
// keeps the loop alive while the signals travel (signal handlers alone do not)
const t = setInterval(() => { if (terms === 2) { clearInterval(t); console.log('done'); } }, 5);
