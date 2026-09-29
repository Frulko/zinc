import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';
const dir = fs.mkdtemp(fs.tmpdir() + '/zinc-events-');
const file = dir + '/watched';
fs.writeText(file, 'before');
const watch = fs.watch(dir, (event: string, name: string): void => {
  console.log('watch', event, name, fs.readText(file));
  fs.unwatch(watch);
  console.log('cleanup', fs.remove(dir, true));
});
sys.onSignal('SIGUSR1', (): void => {
  console.log('signal one');
  queueMicrotask((): void => console.log('signal microtask'));
});
sys.onSignal('SIGUSR1', (): void => console.log('signal two'));
sys.onStdin((chunk: string): void => console.log('stdin', chunk === '' ? 'eof' : chunk));
sys.kill(sys.pid(), 'SIGUSR1');
setTimeout((): void => { fs.writeText(file, 'after change'); fs.writeText(dir + '/a', 'a'); fs.writeText(dir + '/b', 'b'); }, 10);
