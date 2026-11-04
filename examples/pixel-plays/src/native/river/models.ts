import {
  Color, CachedModel, beginModel, captureModel, capsule, sphere, box,
  plot, rgbColor, rampOf, noise, hash,
} from '../renderer';
import { LOG_LENGTHS, LOG_RADII } from './state';

export const logModels: CachedModel[] = [];
let canoe: CachedModel | null = null;

function logCylinder(length: number, radius: number, yaw: number, kind: number, snow: boolean): void {
  const dx = Math.cos(yaw), dy = Math.sin(yaw), sx = -dy, sy = dx;
  const bark: Color = kind === 2 ? [192,185,157] : kind === 0 ? [162,127,85] : kind === 6 ? [102,113,71] : [107+kind*4,81+kind*3,58+kind*2];
  const ramp = rampOf(bark), cut = rampOf([196,159,105]);
  for (let along = -length; along <= length; along += .065) {
    for (let angle = 0; angle < Math.PI * 2; angle += .09) {
      const across = Math.cos(angle) * radius, z = .14 + Math.sin(angle) * radius;
      const grain = noise(along * 1.8 + kind, angle * 5) + (hash(Math.floor(along*18),Math.floor(angle*7))-.5)*.3;
      let level = Math.max(0,Math.min(4,Math.floor(2.5 + Math.sin(angle) * 1.3 + grain * .8)));
      if (kind === 2 && Math.floor(along*4+angle*3)%7===0) level = 0;
      const color = snow && Math.sin(angle) > .75 ? rgbColor([223,229,215]) : ramp[level];
      plot(along*dx+across*sx,along*dy+across*sy,z,color);
    }
  }
  for (const end of [-1,1]) {
    for (let u = -radius; u <= radius; u += .04) {
      for (let v = -radius; v <= radius; v += .04) {
        const distance = Math.hypot(u,v);
        if (distance > radius) continue;
        const ring = Math.floor(distance * 24) % 3;
        plot(end*length*dx+u*sx,end*length*dy+u*sy,.14+v,cut[ring===0?1:3]);
      }
    }
  }
  if (kind === 1 || kind === 3 || kind === 4) {
    capsule([.3*dx,.3*dy,.16],[.9*dx+.55*sx,.9*dy+.55*sy,.6],radius*.5,radius*.15,():Color=>bark,'rough');
  }
  if (kind === 3) capsule([-length*.6*dx,-length*.6*dy,.15],[-length*dx+.7*sx,-length*dy+.7*sy,.22],radius*.7,radius*.45,():Color=>bark,'rough');
  if (kind === 5) capsule([-length*dx+.35*sx,-length*dy+.35*sy,.16],[length*dx+.35*sx,length*dy+.35*sy,.22],radius*.65,radius*.65,():Color=>[137,104,70],'rough');
}

export function bakeRiverModels(snow: boolean): void {
  logModels.length = 0;
  for (let kind = 0; kind < 7; kind++) {
    for (let turn = 0; turn < 2; turn++) {
      beginModel();
      logCylinder(LOG_LENGTHS[kind],LOG_RADII[kind],turn===0?-.30:.28,kind,snow);
      logModels.push(captureModel());
    }
  }
  beginModel();
  const wood = rampOf([154,104,62]), inside = rampOf([190,151,97]);
  for (let y = -1.85; y <= 1.85; y += .04) {
    const width = .62 * (1 - Math.pow(Math.abs(y) / 1.85, 3));
    for (let x = -width; x <= width; x += .04) plot(x,y,.23,inside[Math.floor((y+2)*7)%4===0?2:3]);
    for (let z = 0; z <= .62; z += .04) {
      const taper = .6 + z / .62 * .4;
      plot(-width*taper,y,z,wood[z>.5?4:2]);
      plot(width*taper,y,z,wood[z>.5?4:1]);
    }
  }
  box(-.51,-.7,.42,.51,-.5,.51,[160,126,82]);
  box(-.47,.55,.38,.47,.76,.47,[160,126,82]);
  box(-.24,.9,.23,.24,1.35,.57,[139,77,51]);
  canoe = captureModel();
}
export function drawCanoe(x: number, y: number, z: number): void {
  if (canoe !== null) canoe.drawAt(x,y,z);
}
