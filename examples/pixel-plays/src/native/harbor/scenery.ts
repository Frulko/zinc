import {
  W,H,R2,COS,pix,zb,ground,groundZ,kinds,KIND_GRASS,bakedPix,bakedZ,staticShadow,
  shadowMask,project,unproject,rgb,hash,noise,clamp,bayerAt,rampOf,box,capsule,
  growGrass,growTree,bakeOcclusion,applyShadows,castShadow,plot,sphere,
} from '../renderer';
import { WATER,STONE,WOOD,CREAM,BRICK,BLUE,ROPE } from './palette';
import { HULL, Position } from './state';
import { copyInto, CachedModel, captureModel, rgbColor } from '../renderer';

export const KIND_WATER = 2;
let boatModel: CachedModel | null = null;
export const waterStreaks: {x:number;y:number;speed:number;length:number}[] = [];
function terrainColor(x: number,y: number,ix: number,iy: number,i: number) {
  const edge = (Math.abs(x/14.5)**4 + Math.abs(y/9)**4)**.25;
  const rough = edge + (noise(x*1.1,y*1.1)-.5)*.10;
  if (rough > 1.03 || rough > .92 && hash(ix,iy) < (rough-.92)/.11) return 0;
  const landEdge = -5 + (noise(y*.3,4)-.5)*1.1;
  if (x < landEdge) {
    kinds[i] = KIND_GRASS;
    const shade = clamp(Math.floor(noise(x*.9,y*.9)*4 + hash(ix,iy)*.6),0,3);
    return rgbColor([[60,88,63],[82,108,64],[112,130,75],[141,149,91]][shade]);
  }
  kinds[i] = KIND_WATER;
  const shade = clamp(Math.floor(1.5+(noise(x*.35,y*.45)-.5)*2.4+(bayerAt(ix,iy)-.5)*.5),0,3);
  return rgbColor(WATER[shade]);
}

function stoneQuay() {
  box(-6.5,-4.5,.02,-1.4,5.8,.85,CREAM);
  // Stagger the joints and vary each block, while the walking surface stays broad and quiet.
  for (let row=0;row<7;row++) {
    const y=-4.5+row*1.5;
    const offset=row%2 ? -.6 : 0;
    for (let x=-6.5+offset;x<-1.4;x+=1.25) {
      const left=Math.max(-6.5,x), right=Math.min(-1.4,x+1.22);
      if (right>left) box(left,y,.85,right,Math.min(y+1.47,5.8),.89,STONE[Math.floor(hash(x,row)*4)],row);
    }
  }
  // Narrow timber landing and its dark, wet supports.
  for (let y=-1.4;y<1.4;y+=.36) box(-1.4,y,.9,.9,y+.33,1,WOOD,y);
  for (const x of [-1.2,.7]) {
    for (const y of [-1.3,1.2]) {
      box(x-.10,y-.10,0,x+.10,y+.10,1.3,[91,77,58]);
      castShadow(x,y,1.2,.15);
    }
  }
  for (const y of [-3.1,3.9]) {
    box(-1.9,y,.9,-1.55,y+.35,1.2,BLUE);
    capsule([-1.73,y-.08,1.2],[-1.73,y+.43,1.2],.13,.13,()=>BLUE,'solid');
  }
}

function boathouse() {
  box(-10,-5.8,.2,-6.5,-2.4,3.5,CREAM);
  // A shallow pitched terracotta roof catches the same warm light as the quay.
  const roof=rampOf(BRICK);
  for (let x=-10.3;x<=-6.2;x+=.055) {
    const z=3.55+(.5-Math.abs((x+10.3)/4.1-.5))*1.7;
    for (let y=-6.1;y<=-2.1;y+=.055) {
      const tile=(Math.floor(y*3.5)%2===0 ? 0 : 1);
      plot(x,y,z,roof[x<-8.25 ? 3+tile : 1+tile]);
    }
  }
  box(-6.46,-4.6,.25,-6.38,-3.5,2.4,BLUE);
  box(-9.3,-2.38,1.5,-8.2,-2.30,2.45,BLUE);
  box(-8.78,-2.29,1.5,-8.71,-2.22,2.45,CREAM);
  box(-9.3,-2.29,1.94,-8.2,-2.22,2.01,CREAM);
  box(-7,-5.1,3.8,-6.65,-4.7,5.1,CREAM);
  box(-7.08,-5.18,5.1,-6.57,-4.62,5.3,BRICK);
}

function quayDetails() {
  // A rope coil, two flower pots, and the bench make the place feel used.
  for (let ring=0;ring<4;ring++) {
    for (let a=0;a<6.3;a+=.04) {
      plot(-2.2+Math.cos(a)*(.22+ring*.06),-2.3+Math.sin(a)*(.22+ring*.06),.92,rgbColor(ROPE));
    }
  }
  box(-5.2,2.2,1.45,-4.7,5.1,1.65,WOOD);
  box(-5.4,2.2,1.65,-5.25,5.1,2.3,WOOD);
  for (const y of [2.4,4.7]) box(-5.2,y,.9,-4.8,y+.18,1.45,BLUE);
  for (const y of [-2,1.4]) {
    sphere(-5.8,y,.35,.45,BRICK,'rough');
    for (let k=0;k<8;k++) {
      const a=k*.78;
      capsule([-5.8,y,.4],[-5.8+Math.cos(a)*.35,y+Math.sin(a)*.35,1.05+hash(k,y)*.4],.055,.025,()=>[86,112,67],'solid');
      sphere(-5.8+Math.cos(a)*.35,y+Math.sin(a)*.35,1.1+hash(k,y)*.4,.075,[223,182,108],'solid');
    }
  }
}

function cacheBoat() {
  pix.fill(0); zb.fill(-1e9);
  const hull=rampOf(BRICK), deck=rampOf(WOOD), ink=rgb(57,59,64);
  for (let x=-HULL.halfLength;x<=HULL.halfLength;x+=.045) {
    const width=HULL.halfWidth*(1-(Math.abs(x)/HULL.halfLength)**4);
    for (let y=-width;y<=width;y+=.045) {
      plot(x,y,.48,deck[Math.floor((x+3.2)*3)%2 ? 2 : 3]);
    }
    for (let z=.02;z<=.94;z+=.04) {
      const taper=.62+.38*z/.94;
      plot(x*taper,-width*taper,z,hull[3]);
      plot(x*taper,width*taper,z,hull[z<.25 ? 0 : 2]);
    }
    plot(x,-width,.97,ink);
    plot(x,width,.97,ink);
  }
  box(-2,-.74,.49,-.45,.74,1.85,CREAM);
  box(-1.95,-.80,1.84,-.4,.80,2.04,BLUE);
  box(-1.6,.745,1,-.7,.79,1.55,BLUE);
  box(-.44,-.55,1.05,-.40,.55,1.6,BLUE);
  box(-1.65,-.25,2,-1.32,.10,2.5,BRICK);
  box(.1,-.85,.48,.5,.85,.62,WOOD);
  // A lifebuoy reads as a ring rather than a white blob at this resolution.
  for (let a=0;a<6.3;a+=.035) {
    const color=Math.floor(a/1.57)%2 ? CREAM : BRICK;
    sphere(-1.05+Math.cos(a)*.28,.85,1.12+Math.sin(a)*.28,.085,color,'solid');
  }
  boatModel = captureModel();
}

export function bakeHarbor() {
  waterStreaks.length = 0;
  zb.fill(-1e9); pix.fill(rgb(255,255,255));
  ground.fill(0); kinds.fill(0); shadowMask.fill(0);
  for (let iy=0;iy<H;iy++) {
    for (let ix=0;ix<W;ix++) {
      const p=unproject(ix+.5,iy+.5), i=iy*W+ix;
      const color=terrainColor(p.x,p.y,ix,iy,i);
      if (!color) continue;
      pix[i]=color; ground[i]=1; zb[i]=(p.x+p.y)/R2*COS;
    }
  }
  copyInto(groundZ, zb);
  growGrass(); stoneQuay(); boathouse(); quayDetails(); growTree(-10,4.4,1.05,300,43);
  for (let x=-10;x<-6.5;x+=.35) castShadow(x,-3.5,3.1,1.3);
  for (let y=-4.2;y<5.6;y+=.3) castShadow(-1.6,y,.8,.3);
  bakeOcclusion(); copyInto(staticShadow, shadowMask); applyShadows(groundZ);
  copyInto(bakedPix, pix); copyInto(bakedZ, zb);
  cacheBoat();
  for (let k=0;k<240;k++) {
    waterStreaks.push({x:-4+hash(k,31)*17,y:hash(k,32)*17-8.5,speed:.22+hash(k,33)*.42,length:2+Math.floor(hash(k,34)*3)});
  }
}

export function drawBoat(position: Position):void { if(boatModel!==null) boatModel.drawAt(position.x,position.y,position.z); }
