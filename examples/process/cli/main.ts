// Headless self-check of zinc:process: run(), streamed lines, stdin, cwd/env, kill, spawn errors.
//   node compiler/bin/zinc.mjs run examples/process/cli            (macos; --target rpi1 / sim too)
import * as proc from 'zinc:process';
import * as sys from 'zinc:sys';

let failed = 0;
function check(name: string, ok: boolean, got: string): void {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' (got ' + got + ')'}`);
  if (!ok) failed++;
}

async function main(): Promise<void> {
  const r = await proc.run('sh', ['-c', 'echo out; echo err >&2; exit 3'], {});
  check('run: stdout, stderr, exit code', r.stdout === 'out\n' && r.stderr === 'err\n' && r.code === 3, JSON.stringify(r));

  const lines: string[] = [];
  const t0 = sys.clock();
  const p = proc.spawn('sh', ['-c', 'for i in 1 2 3; do echo line $i; sleep 0.1; done; printf tail'], {});
  let firstAt = -1;
  p.onStdout((l: string) => { if (firstAt < 0) firstAt = sys.clock() - t0; lines.push(l); });
  const code = await p.exited;
  check('streamed lines + unterminated last line', lines.join('|') === 'line 1|line 2|line 3|tail' && code === 0, lines.join('|'));
  check('first line arrives before exit (streaming)', firstAt >= 0 && firstAt < 150, `${firstAt} ms`);

  const cat = proc.spawn('cat', [], {});
  let echoed = '';
  cat.onData((s: string, _e: boolean) => { echoed += s; });
  cat.write('héllo\nwörld\n');
  cat.closeStdin();
  await cat.exited;
  check('stdin round trip (UTF-8)', echoed === 'héllo\nwörld\n', echoed);

  const e = await proc.run('sh', ['-c', 'pwd; echo $ZINC_TEST'], { cwd: '/tmp', env: ['ZINC_TEST=42'] });
  check('cwd and env', e.stdout.endsWith('tmp\n42\n'), e.stdout);

  const s = proc.spawn('sleep', ['10'], {});
  s.kill(15);
  check('kill -> 128 + SIGTERM', (await s.exited) === 143, `${s.code}`);

  let threw = false;
  try { proc.spawn('no-such-program-zinc', [], {}); } catch (err) { threw = true; }
  check('missing program throws', threw, 'no throw');

  // arguments are passed joined by U+001F: one containing it (or NUL) is refused, never split into two arguments
  let refused = false;
  try { proc.spawn('echo', ['a\u001fb'], {}); } catch (err) { refused = true; }
  check('separator in an argument throws', refused, 'no throw');

  console.log(failed === 0 ? 'process: all checks passed' : `process: ${failed} check(s) failed`);
  sys.exit(failed === 0 ? 0 : 1);
}
main();
