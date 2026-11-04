import {
  W,H,R2,COS,Color,pix,zb,ground,groundZ,kinds,bakedPix,bakedZ,shadowMask,staticShadow,
  configureRenderer,copyInto,unproject,rgbColor,rampOf,noise,hash,plot,box,capsule,sphere,
  growTree,growGrass,bakeOcclusion,castShadow,applyShadows,
} from '../renderer';

const WATER_TONES:Color[]=[[43,99,103],[58,119,114],[75,137,122],[99,154,133]];
const GRASS_TONES:Color[]=[[53,78,49],[76,100,52],[104,124,63],[138,150,85]];

function cottage():void {
  const stone:Color=[218,204,168],roof:Color=[124,111,89],shutter:Color=[76,99,77];
  box(-12,-5.8,0,-7.4,-.8,4.2,stone);
  const wall=rampOf(stone),tiles=rampOf(roof);
  for(let a=-12;a<=-7.4;a+=.05){
    for(let z=.1;z<4.2;z+=.05){
      const course=Math.floor(z*2),brick=Math.floor(a*1.4+(course%2)*.5);
      const joint=(z*2-course)<.10||(a*1.4+(course%2)*.5-brick)<.08;
      plot(a,-.78,z,wall[joint?1:hash(brick,course)>.7?4:3]);
    }
  }
  for(let a=-5.8;a<=-.8;a+=.05){
    for(let z=.1;z<4.2;z+=.05){
      const course=Math.floor(z*2),brick=Math.floor(a*1.4+(course%2)*.5);
      const joint=(z*2-course)<.1||(a*1.4+(course%2)*.5-brick)<.08;
      plot(-7.38,a,z,wall[joint?0:hash(brick,course)>.7?3:2]);
    }
  }
  for(let x=-12.25;x<=-7.15;x+=.05){
    const slope=1-Math.abs((x+12.25)/5.1-.5)*2;
    for(let y=-6.05;y<=-.55;y+=.05){
      const row=Math.floor(y*7),tile=Math.floor(x*5+(row%2)*.5);
      plot(x,y,4.25+slope*2.5,tiles[x<-9.7?(hash(tile,row)>.6?4:3):(hash(tile,row)>.6?2:1)]);
    }
  }
  box(-8.1,-4.9,5.8,-7.55,-4.25,7.1,stone);
  box(-8.18,-4.98,7.1,-7.47,-4.17,7.3,[148,124,94]);
  box(-7.36,-3.9,.1,-7.29,-2.7,2.8,[83,75,61]);
  for(const x of [-11.1,-8.9]){
    box(x,-.76,1.7,x+.8,-.69,2.9,[54,76,73]);
    box(x+.37,-.68,1.7,x+.43,-.61,2.9,stone);
    box(x,-.68,2.25,x+.8,-.61,2.31,stone);
    for(const side of [-1,1])box(x+(side<0?-.38:.83),-.72,1.65,x+(side<0?-.05:1.16),-.60,2.95,shutter);
  }
  // Ivy climbs a wall in the same clustered volumes as the tree canopies.
  for(let k=0;k<40;k++){
    const z=hash(k,52)*4,x=-11.8+Math.sin(z*1.2)*.2+hash(k,53)*.45;
    sphere(x,-.56,z,.13,[83,112,69],'rough');
    if(k%7===0)sphere(x+.1,-.50,z+.1,.06,[186,126,102],'solid');
  }
  for(let z=1;z<6;z+=.4)castShadow(-9.7,-2.5,z,1.8);
}

export function bakeFishing():void {
  configureRenderer(22,1.1,-.25);
  for(let iy=0;iy<H;iy++){
    for(let ix=0;ix<W;ix++){
      const p=unproject(ix+.5,iy+.5),index=iy*W+ix;
      const edge=Math.pow(Math.pow(Math.abs(p.x)/15,4)+Math.pow(Math.abs(p.y)/10,4),.25);
      const rough=edge+(noise(p.x,p.y)-.5)*.09;
      if(rough>1.03||rough>.93&&hash(ix,iy)<(rough-.93)/.1)continue;
      const shore=-4.7+Math.sin(p.y*.4)*.35;
      let color:Color;
      if(p.x>shore){
        kinds[index]=2;
        color=WATER_TONES[Math.max(0,Math.min(3,Math.floor(.8+noise(p.x*.4,p.y*.35)*2.3+hash(ix,iy)*.2)))];
      }else{
        kinds[index]=3;
        color=GRASS_TONES[Math.max(0,Math.min(3,Math.floor(noise(p.x*.6,p.y*.7)*3.5)))];
      }
      pix[index]=rgbColor(color);ground[index]=1;zb[index]=(p.x+p.y)/R2*COS;
    }
  }
  copyInto(groundZ,zb);growGrass();
  cottage();growTree(-11,5.1,1.05,260,19);growTree(-5.9,-6.8,.75,170,53);
  // A narrow worn path meets a proper pontoon, with legs, rail and a little tackle basket.
  const path=rampOf([191,174,131]);
  for(let x=-7.4;x<-4.1;x+=.06)for(let y=-1.1;y<1.1;y+=.06)plot(x,y,.04,path[hash(x,y)>.7?2:3]);
  for(let x=-5.3;x<.8;x+=.38)box(x,-.9,.7,x+.35,.9,.85,[145,110,72],x);
  for(const x of [-4.8,-2.2,.6]){
    for(const y of [-.8,.8]){
      box(x-.10,y-.1,0,x+.1,y+.1,1.15,[92,78,59]);castShadow(x,y,.9,.12);
    }
  }
  capsule([-4.8,-.8,1.3],[-1.8,-.8,1.3],.055,.055,():Color=>[177,149,101],'rough');
  box(-3.2,.0,.85,-2.4,.65,1.35,[168,133,79]);
  for(let a=0;a<Math.PI*2;a+=.07)plot(-2.8+Math.cos(a)*.3,.32+Math.sin(a)*.3,1.38,rgbColor([206,181,124]));
  box(-5.4,3.5,.2,-3.9,4.2,.4,[145,111,69]);
  for(let i=0;i<17;i++){
    const y=-8+hash(i,31)*16;
    sphere(-4.8+Math.sin(y*.4)*.35,y,.08,.2+hash(i,32)*.35,[158,153,122],'rough');
  }
  for(let k=0;k<80;k++){
    const x=-5.6-hash(k,61)*2.4,y=2+hash(k,62)*5.5;
    const z=.12+hash(k,63)*.12;
    sphere(x,y,z,.055,k%4===0?[210,173,97]:[228,216,175],'solid');
  }
  bakeOcclusion();copyInto(staticShadow,shadowMask);applyShadows(groundZ);
  copyInto(bakedPix,pix);copyInto(bakedZ,zb);
}
