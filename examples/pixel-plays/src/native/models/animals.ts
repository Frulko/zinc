import { Color, Vec3, sphere, capsule, plot, rgb, castShadow } from '../renderer';
const CAT_FUR = [144, 118, 88];
const CAT_LIGHT = [174, 150, 115];
const CAT_STRIPE = [102, 85, 69];
const CAT_CHEST = [214, 200, 168];
const GULL_WHITE = [224, 224, 205];
const GULL_WING = [137, 152, 146];
const GULL_TIP = [70, 84, 85];
const GULL_BEAK = [182, 144, 80];
const FISH_BACK = [104, 143, 128];
const FISH_BELLY = [151, 173, 148];
const FISH_FIN = [91, 123, 113];
const catFur = () => CAT_FUR;
const catStripe = () => CAT_STRIPE;
const gullWhite = () => GULL_WHITE;
const gullWing = () => GULL_WING;
const gullTip = () => GULL_TIP;
const gullBeak = () => GULL_BEAK;
const fishBack = () => FISH_BACK;
const fishFin = () => FISH_FIN;

export function cat(x: number, y: number, floor: number, time: number, awake: boolean) {
  const stretch = awake ? Math.sin(time * 3) * .08 : 0;
  const head = .65 + stretch;
  for (const side of [-.18, .18]) {
    capsule([x - .42, y + side, floor + .06], [x - .31, y + side, floor + .37], .085, .15, catFur, 'solid');
    capsule([x + .31, y + side, floor + .06], [x + .27, y + side, floor + .46], .075, .12, catFur, 'solid');
  }
  capsule([x - .4, y, floor + .36], [x + .17, y, floor + .43], .28, .32, catFur, 'solid');
  sphere(x + .27, y, floor + .42, .22, CAT_CHEST, 'solid');
  sphere(x + .48, y, floor + head, .25, CAT_LIGHT, 'solid');
  sphere(x + .65, y, floor + head - .07, .11, CAT_CHEST, 'solid');
  for (const side of [-.16, .16]) {
    capsule([x + .46, y + side, floor + head + .15], [x + .48, y + side, floor + head + .36], .105, .02, catFur, 'solid');
  }
  // Broad tabby bands follow the body volume, without outlined facial features.
  for (const stripe of [-.3, -.06, .15]) {
    capsule([x + stripe, y + .22, floor + .39], [x + stripe - .03, y + .15, floor + .62], .052, .055, catStripe, 'solid');
  }
  const tail = Math.sin(time * (awake ? 4 : .9)) * (awake ? .23 : .09);
  capsule([x - .57, y, floor + .38], [x - .9, y + tail, floor + .57], .095, .065, catFur, 'solid');
  capsule([x - .9, y + tail, floor + .57], [x - 1, y + tail + .13, floor + .85], .065, .025, catFur, 'solid');
  if (Math.floor(time * 4) % 23 !== 0) plot(x + .62, y + .18, floor + head + .03, rgb(57, 62, 48));
  castShadow(x, y, floor + .35, .48);
}
export function gull(x: number, y: number, z: number, time: number, flying: boolean, yaw: number = 0) {
  // local frame: a along the bird's heading, b to its side; at yaw 0 it is the world's x and y
  const fx = Math.cos(yaw), fy = Math.sin(yaw);
  const L = (a: number, b: number, c: number): Vec3 => [x + fx * a - fy * b, y + fy * a + fx * b, z + c];
  capsule(L(-.26, 0, .2), L(.2, 0, .24), .16, .21, gullWhite, 'solid');
  const head = L(.28, 0, .46);
  sphere(head[0], head[1], head[2], .16, GULL_WHITE, 'solid');
  capsule(L(.4, 0, .44), L(.64, 0, .42), .055, .018, gullBeak, 'solid');
  capsule(L(-.22, 0, .25), L(-.48, 0, .22), .11, .025, gullTip, 'solid');
  if (flying) {
    const lift = Math.sin(Math.floor(time * 8) * Math.PI / 3) * .55;
    for (const side of [-1, 1]) {
      capsule(L(0, side * .10, .3), L(-.1, side * .67, .3 + lift), .15, .11, gullWhite, 'solid');
      capsule(L(-.1, side * .67, .3 + lift), L(-.4, side * 1.12, .25 + lift), .11, .025, gullTip, 'solid');
    }
  } else {
    for (const side of [-.12, .12]) {
      capsule(L(-.1, side, .27), L(-.34, side, .22), .12, .04, gullWing, 'solid');
      const leg = L(.03, side, 0), legTop = L(.03, side, .15);
      capsule(leg, legTop, .025, .025, gullBeak, 'solid');
    }
  }
  const eye = L(.37, .105, .5);
  plot(eye[0], eye[1], eye[2], rgb(48, 57, 54));
  castShadow(x, y, z + .2, .28);
}
export function fish(x: number, y: number, z: number, yaw: number, time: number, underwater: boolean, size: number = 1, back: Color = FISH_BACK): void {
  const fx = Math.cos(yaw), fy = Math.sin(yaw), sideX = -fy, sideY = fx;
  const tail = Math.sin(time * 7) * .12 * size;
  const belly: Color = underwater ? back : [Math.min(235,back[0]*1.16+12),Math.min(235,back[1]*1.12+10),Math.min(225,back[2]*1.1+10)];
  const fin: Color = [back[0]*.82,back[1]*.82,back[2]*.82];
  capsule([x-fx*.28*size,y-fy*.28*size,z],[x+fx*.20*size,y+fy*.20*size,z],.095*size,.17*size,():Color=>back,'solid');
  sphere(x+fx*.23*size,y+fy*.23*size,z,.15*size,belly,'solid');
  for(const side of [-1,1]) {
    capsule([x-fx*.31*size,y-fy*.31*size,z],[x-fx*.58*size+sideX*(side*.20*size+tail),y-fy*.58*size+sideY*(side*.20*size+tail),z+side*.035*size],.05*size,.025*size,():Color=>fin,'solid');
  }
  capsule([x,y,z+.12*size],[x-fx*.13*size,y-fy*.13*size,z+.24*size],.06*size,.025*size,():Color=>fin,'solid');
}
