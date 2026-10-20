import * as proc from 'zinc:process';
function use(s: string): void { console.log(s); }
async function runCheck(): Promise<void> {
  const r = await proc.runAll('node', ['x'], {});
  use(r.stdout);
}
runCheck();
