// zinc:sys for sim
import { randomFillSync } from 'node:crypto';
import { StringDecoder } from 'node:string_decoder';
export const args = () => process.argv.slice(2);
export const env = name => process.env[name] ?? '';
export const exit = code => process.exit(code);
export const platform = () => 'sim';
export const clock = () => $z.perfNow();  // virtual in deterministic runs (sim/zinc.mjs)
export const liveObjects = () => 0;
export const allocations = () => 0;
export const randomBytes = n => Array.from(randomFillSync(new Uint8Array(Math.max(0, n))));
export const utf8Encode = s => Array.from(Buffer.from(s, 'utf8'));
export const utf8Decode = b => new TextDecoder('utf-8', { ignoreBOM: true }).decode(Uint8Array.from(b));
const SIGS = ['SIGHUP', 'SIGINT', 'SIGQUIT', 'SIGUSR1', 'SIGUSR2', 'SIGTERM', 'SIGWINCH', 'SIGCHLD', 'SIGALRM', 'SIGPIPE', 'SIGCONT', 'SIGTSTP'];
const sig = (name, kill) => { const n = name.startsWith('SIG') ? name : 'SIG' + name; return SIGS.includes(n) || (kill && n === 'SIGKILL') ? n : ''; };
export const onSignal = (name, cb) => {
  const n = sig(name, false);
  if (!n) throw new Error('sys.onSignal: unknown or uncatchable signal ' + name);
  process.on(n, () => cb());
};
export const kill = (pid, name) => {
  const n = sig(name, true);
  if (!n) throw new Error('sys.kill: unknown signal ' + name);
  try { process.kill(pid, n); return true; } catch { return false; }
};
export const pid = () => process.pid;
export const cwd = () => process.cwd();
export const chdir = d => { try { process.chdir(d); return true; } catch { return false; } };
export const setEnv = (n, v) => { process.env[n] = v; };
export const unsetEnv = n => { delete process.env[n]; };
export const envKeys = () => Object.keys(process.env).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
export const isatty = fd => !!(fd === 0 ? process.stdin : fd === 1 ? process.stdout : process.stderr).isTTY;
export const write = s => { process.stdout.write(s); };
export const writeErr = s => { process.stderr.write(s); };
export const onStdin = cb => {
  const d = new StringDecoder('utf8');
  process.stdin.on('data', b => { const s = d.write(b); if (s) cb(s); });
  process.stdin.on('end', () => { const s = d.end(); if (s) cb(s); cb(''); });
};
