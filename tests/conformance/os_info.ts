// zinc-test: requires process
// zinc:os: machine information, cross-checked against the system's own commands (zinc:process), so the output is
// the same on every machine.
import * as os from 'zinc:os';
import * as sys from 'zinc:sys';
import { run } from 'zinc:process';

async function sh(cmd: string, args: string[]): Promise<string> {
  const r = await run(cmd, args, {});
  return r.stdout.trim();
}
async function main(): Promise<void> {
  console.log('hostname', os.hostname() === await sh('hostname', []));
  console.log('type', os.type() === await sh('uname', ['-s']), 'release', os.release() === await sh('uname', ['-r']));
  const m = await sh('uname', ['-m']);
  const a = os.arch();
  console.log('arch', (a === 'arm64' && (m === 'arm64' || m === 'aarch64')) || (a === 'x64' && m === 'x86_64') || (a === 'arm' && m.startsWith('arm')));
  console.log('homedir', os.homedir() === sys.env('HOME'), 'tmpdir', os.tmpdir().length > 0 && !os.tmpdir().endsWith('/'));
  const u = os.userInfo();
  console.log('user', u.username === await sh('id', ['-un']), `${u.uid}` === await sh('id', ['-u']), `${u.gid}` === await sh('id', ['-g']), u.homedir.length > 0);
  const c = os.cpus();
  console.log('cpus', c.length === os.availableParallelism(), c.length > 0, c[0].model.length > 0);
  const l = os.loadavg();
  console.log('load', l.length, l[0] >= 0, 'uptime', os.uptime() > 0);
  console.log('mem', os.totalmem() > os.freemem(), os.freemem() > 0);
  const nis = os.networkInterfaces();
  console.log('loopback', nis.some((n: os.NetworkInterface) => n.address === '127.0.0.1' && n.internal && n.family === 'IPv4'),
    nis.every((n: os.NetworkInterface) => n.mac.length === 17 && (n.family === 'IPv4' || n.family === 'IPv6')));
}
main();
