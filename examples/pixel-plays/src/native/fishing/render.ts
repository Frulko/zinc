import {
  W,H,Color,pix,zb,bakedPix,bakedZ,shadowMask,pendingShadows,copyInto,drawLeaves,drawTufts,
  rgb,rgbColor,hash,project,plot,sphere,capsule,figure,dynamicAdd,flushShadows,applyShadows,
  shadeEdges,drawArrow,
} from '../renderer';
import { cat,fish } from '../models/animals';
import { waterPoint,ripple } from '../models/water';
import { fishing,species } from './state';

const ANGLER = {shirt:[132,146,106],stripe:[160,168,122],legs:[85,79,65],hair:[111,94,68],skin:[219,176,139]};
const ROD:Color=[106,83,53];
const FOAM=rgb(143,177,146);

function drawFloat(x:number,y:number,z:number):void {
  sphere(x,y,z+.05,.09,[220,215,181],'solid');
  sphere(x,y,z+.17,.065,[165,79,56],'solid');
}
function drawRod(time:number,floatX:number,floatY:number,floatZ:number,line:boolean):void {
  const bend=fishing.phase==='reeling'?fishing.tension:0;
  let px=.12,py=.12,pz=2.02;
  const tipX=2.35-bend*.3,tipY=.9,tipZ=3.2-bend*.5;
  for(let k=1;k<=12;k++){
    const t=k/12,s=1-t;
    const x=s*s*.12+2*s*t*1.35+t*t*tipX;
    const y=s*s*.12+2*s*t*.55+t*t*tipY;
    const z=s*s*2.02+2*s*t*3.65+t*t*tipZ;
    capsule([px,py,pz],[x,y,z],.027,.02,():Color=>ROD,'solid');
    px=x;py=y;pz=z;
  }
  const endX=line?floatX:tipX-.15,endY=line?floatY:tipY,endZ=line?floatZ:tipZ-.65;
  const tension=fishing.phase==='reeling'?fishing.tension:0;
  const color=tension>.85?rgb(184,113,78):rgb(212,211,176);
  for(let k=0;k<=95;k++){
    const t=k/95;
    plot(tipX+(endX-tipX)*t,tipY+(endY-tipY)*t,tipZ+(endZ-tipZ)*t-Math.sin(t*Math.PI)*(.12+(1-tension)*.35),color);
  }
}
function duck(time:number):void {
  const x=9+Math.sin(time*.17),y=6.2+Math.sin(time*.12)*.8;
  capsule([x-.25,y,.13],[x+.23,y,.19],.18,.22,():Color=>[150,143,109],'solid');
  sphere(x+.32,y,.46,.16,[63,103,78],'solid');
  capsule([x+.41,y,.44],[x+.62,y,.42],.05,.015,():Color=>[177,144,75],'solid');
  capsule([x-.16,y+.15,.27],[x-.37,y+.1,.20],.12,.025,():Color=>[91,100,86],'solid');
  ripple(x-.4,y,.4+(time*.2)%.5,FOAM,true);
}
export function drawFishing():void {
  const time=Math.floor(fishing.time*8)/8;
  copyInto(pix,bakedPix);copyInto(zb,bakedZ);shadowMask.fill(0);pendingShadows.length=0;
  drawLeaves(time);drawTufts(time);
  for(let k=0;k<200;k++){
    const x=-3.8+hash(k,21)*17;
    const y=((hash(k,22)*19+time*(.13+hash(k,23)*.22))%19)-9.5;
    for(let j=0;j<2;j++)waterPoint(x,y+j*.12,hash(k,24)>.4?FOAM:rgb(77,139,122));
  }
  for(const y of [-.8,.8])ripple(.6,y,.2+(time*.12)%.35,FOAM,true);
  const active=fishing.phase==='waiting'||fishing.phase==='bite'||fishing.phase==='reeling';
  let floatX=fishing.floatX,floatY=fishing.floatY,floatZ=.03+Math.sin(time*2.4)*.025;
  if(fishing.phase==='casting'){
    const progress=Math.min(1,fishing.phaseTime/.9);
    floatX=.4+(fishing.floatX-.4)*progress;floatY=.1+(fishing.floatY-.1)*progress;
    floatZ=2.0*(1-progress)+Math.sin(progress*Math.PI)*1.8;
  }
  if(fishing.phase==='bite')floatZ=-.1+Math.sin(time*9)*.12;
  if(fishing.phase==='reeling'){
    const progress=fishing.distance/fishing.initialDistance;
    floatX=.6+(fishing.floatX-.6)*progress;
    floatY=.2+(fishing.floatY-.2)*progress+Math.sin(time*3)*.25;
    floatZ=fishing.tension>.7?Math.max(.05,Math.sin(time*3)*.8):.05;
    fish(floatX,floatY,floatZ,Math.atan2(.2-floatY,.6-floatX),time,false,1.1,species[fishing.species].color);
    ripple(floatX,floatY,.3+(time*.7)%.55,FOAM,true);
  }
  for(let k=0;k<3;k++){
    let x=3.8+Math.sin(time*.27+k*2.3)*2.3+k*1.6;
    let y=-3.7+k*3.6+Math.sin(time*.19+k)*1.1;
    if(k===0&&(fishing.phase==='waiting'||fishing.phase==='bite')){
      const approach=Math.min(1,fishing.phaseTime/Math.max(1,fishing.wait-1));
      x+=(fishing.floatX-x)*approach;y+=(fishing.floatY-y)*approach;
    }
    fish(x,y,.06,Math.cos(time*.27+k*2.3)>0?0:Math.PI,time+k,true,.85,species[(k+fishing.attempts)%5].color);
  }
  const holding=fishing.phase==='reeling'&&fishing.holding;
  figure(-.35,.05,0,{z:.85,scale:.9,crouch:.18,lean:holding?-.16:.1,stance:.13,armR:1.3,armL:1.05},ANGLER,dynamicAdd);
  drawRod(time,floatX,floatY,floatZ,active||fishing.phase==='casting');
  if(active||fishing.phase==='casting')drawFloat(floatX,floatY,floatZ);
  if(fishing.phase==='waiting'||fishing.phase==='bite')ripple(floatX,floatY,.15+(time*(fishing.phase==='bite'?1:.2))%.6,FOAM,true);
  if(fishing.phase==='idle'){
    const target=project(fishing.aimX,fishing.aimY,0);
    ripple(fishing.aimX,fishing.aimY,.4,FOAM,true);
    if(fishing.attempts===0)drawArrow(target.sx,target.sy,time);
  }
  if(fishing.phase==='bite'){
    const point=project(floatX,floatY,.2);
    drawArrow(point.sx,point.sy-4,time);
  }
  if(fishing.phase==='caught'){
    fish(.6,.25,1.7,Math.PI*.4,time,false,1.2,species[fishing.species].color);
    for(let k=0;k<8;k++){
      const age=(fishing.phaseTime+k*.05)%.7;
      plot(.6+Math.sin(k)*age,.25+Math.cos(k)*age,1.3-age*1.8,rgb(206,222,190));
    }
  }
  cat(-5.6,2.4,.03,time,fishing.phase==='caught');
  duck(time);
  flushShadows();applyShadows(bakedZ);shadeEdges();
  for(let k=0;k<5;k++){
    const age=(time*.13+k*.2)%1;
    plot(-7.8+age*.7,-4.5+age*.2,7.3+age*1.5,rgb(210+age*28,211+age*25,199+age*26));
  }
}
