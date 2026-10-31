// The UI speaks JSONL to the same local backend the standalone CLI uses. No shell, no HTTP server.
import * as proc from 'zinc:process';
import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';

let child: proc.Process | null = null;
export function backendFile(): string {
  const configured = sys.env('IPOD_RESCUE_BACKEND');
  if (configured !== '' && fs.exists(configured)) return fs.realpath(configured);
  let at = sys.cwd();
  if (!at.startsWith('/')) at = sys.launchDir() + '/' + at;
  for (let i = 0; i < 12; i++) {
    for (const suffix of ['/backend/rescue.py', '/examples/ipod-rescue/backend/rescue.py']) {
      if (fs.exists(at + suffix)) return fs.realpath(at + suffix);
    }
    const cut = at.lastIndexOf('/');
    if (cut <= 0) break;
    at = at.slice(0, cut);
  }
  throw new Error('Backend introuvable : lancer depuis le projet ou définir IPOD_RESCUE_BACKEND.');
}
export function start(receive: (line: string) => void, failed: (message: string) => void): void {
  stop();
  try {
    const file = backendFile();
    const p = proc.spawn('python3', ['-u', file], { cwd: file.slice(0, file.lastIndexOf('/')) });
    child = p;
    p.onStdout((line: string) => { if (child === p) receive(line); });
    let error = '';
    p.onStderr((line: string) => { error = (error + line + '\n').slice(-2000); });
    p.onExit((code: i32) => { if (child === p) { child = null; failed('Backend arrêté (' + code + '). ' + error); } });
  } catch (e) { failed('' + e); }
}
export function send(request: string): void {
  if (child === null || !(child as proc.Process).write(request + '\n')) throw new Error('Backend indisponible.');
}
export function stop(): void {
  const p = child; child = null;
  if (p !== null) { (p as proc.Process).closeStdin(); (p as proc.Process).kill(); }
}
