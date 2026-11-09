// A union of a primitive and an object type (getUserMedia's `video?: boolean | MediaTrackConstraints`) holds either: tested against
// undefined and false in an async function, taken out with `as`, passed on as `unknown` (ZN-798; the compiler crashed in writeVar)
interface Cam { width?: number; facing?: string }
interface Opts { video?: boolean | Cam; audio?: boolean }
function describe(v: boolean | Cam | undefined): string {
  if (v === undefined) return 'none';
  if (v === false) return 'off';
  if (v === true) return 'on';
  const c = v as Cam;
  return 'cam ' + (c.width ?? 0) + ' ' + (c.facing ?? '-');
}
function width(v: unknown): string {
  if (v === undefined) return 'undefined';
  if (v === true || v === false) return 'flag';
  const o: any = v;
  return typeof o.width === 'number' ? 'width ' + (o.width as number) : 'no width';
}
async function open(o: Opts): Promise<string> {
  const v = o.video;
  if (v === undefined || v === false) throw new Error('no video');
  return describe(v);
}
async function main(): Promise<void> {
  const all: Opts[] = [{ video: true }, { video: { width: 640, facing: 'user' } }, { audio: true }, { video: false }];
  for (const o of all) {
    try { console.log(await open(o)); } catch (e) { console.log((e as Error).message); }
    console.log(width(o.video));
  }
  let w: string | number = 'a';
  console.log(describe(undefined), w === 'a' ? 'str' : 'num');
  w = 3;
  console.log(w === 3 ? 'three' : 'other');
}
main();
