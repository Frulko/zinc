// zinc:location on the fake provider (tests/t1/location.sh sets ZINC_FAKE_LOCATION): the permission, a current position, a watch over the
// path with the distance walked, then stop.
import { permissionStatus, requestPermission, getCurrentPosition, watchPosition, distance, Position, PositionResult } from 'zinc:location';

const fmt = (v: number): string => v.toFixed(4);
async function main(): Promise<void> {
  console.log(`status ${permissionStatus()}`);
  const s = await requestPermission();
  console.log(`requested ${s}`);
  const r = await getCurrentPosition({ timeout: 3000 });
  if (r.error !== null) { console.log(`error ${r.error.code}: ${r.error.message}`); return; }
  const p = r.position as Position;
  console.log(`current ${fmt(p.latitude)} ${fmt(p.longitude)} ±${p.accuracy} m altitude ${p.altitude === null ? 'unknown' : 'known'}`);
  let prev: Position | null = null, walked = 0, n = 0;
  const w = watchPosition((x: PositionResult) => {
    if (x.error !== null) { console.log(`watch error ${x.error.code}`); return; }
    const q = x.position as Position;
    if (prev !== null) walked += distance(prev, q);
    prev = q;
    n++;
    console.log(`fix ${n} ${fmt(q.latitude)} ${fmt(q.longitude)} walked ${Math.round(walked)} m`);
    if (n === 3) { w.stop(); console.log('stopped'); }
  });
}
main();
