// tests/t0/threads_two.sh (tests/unit/threads_test.cpp): one program run by two Machines on two threads at once must print what it prints
// alone. It touches what a worker uses: objects, strings, Maps, JSON, closures, timers and promises on the thread's own event loop.
interface Row { id: number; name: string; tags: string[] }

function build(n: number): Row[] {
  const rows: Row[] = [];
  for (let i = 0; i < n; i++) rows.push({ id: i, name: `row ${i}`, tags: [i % 2 === 0 ? 'even' : 'odd', `t${i % 7}`] });
  return rows;
}

function count(rows: Row[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) for (const t of r.tags) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
}

const sleep = (ms: number): Promise<void> => new Promise<void>((done) => { setTimeout(() => done(), ms); });

async function main(): Promise<void> {
  let total = 0;
  for (let round = 0; round < 20; round++) {
    const rows = build(2000);
    const m = count(rows);
    const back = JSON.parse(JSON.stringify(rows.slice(0, 50)));
    total += m.get('even') ?? 0;
    total += back.length as number;
    if (round % 5 === 0) await sleep(2);
  }
  const keys = Array.from(count(build(70)).keys()).sort();
  console.log(`total ${total} keys ${keys.join(',')}`);
}
main();
