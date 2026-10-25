import { AnimatedScene } from 'zinc:animation/scene';
import { SceneDocument, SceneRecord } from 'zinc:3d/scene';
import { readText } from 'zinc:fs';
import { args } from 'zinc:sys';
function check(ok:boolean,why:string):void{if(!ok)throw new Error('animated scene: '+why);}
const base=args()[0]+'/';
const document:SceneDocument=JSON.parse(readText(base+'scene.json'));
const original=document.nodes.find((n:SceneRecord)=>n.id==='companion');
if(original===undefined)throw new Error('missing fixture character');
const second:SceneRecord=JSON.parse(JSON.stringify(original));
second.id='companion-2';second.name='Second companion';second.translation[0]+=2;document.nodes.push(second);
const scene=new AnimatedScene();check(scene.reload(JSON.stringify(document),base),scene.error);
const first=scene.animations.get('companion'),other=scene.animations.get('companion-2');
if(first===undefined||other===undefined)throw new Error('missing players');
check(first.model.handle!==other.model.handle&&first.model.mesh!==other.model.mesh,'skins incorrectly shared');
first.play('Walk',0);first.seek(.25);other.play('Run',0);other.seek(.15);
let different=0;for(let i=0;i<first.model.positions.length;i++)if(Math.abs(first.model.positions[i]-other.model.positions[i])>.005)different++;
check(different>50,'instances do not deform independently');
first.paused=true;first.speed=1.25;
for(let i=0;i<10;i++){
  check(scene.reload(JSON.stringify(document),base),scene.error);
  const current=scene.animations.get('companion');
  if(current===undefined)throw new Error('lost player');
  check(current===first&&current.paused&&current.speed===1.25&&Math.abs(current.time-.25)<.00001,'compatible state lost');
  check(current.model.handle<4,'native instance handles grow across replacements');
}
const before=scene.document,model=first.model;
for(const a of document.assets)if(a.kind==='skin'&&a.events!==undefined)a.events[0].time=999;
check(!scene.reload(JSON.stringify(document),base),'invalid clip metadata accepted');
check(scene.document===before&&first.model===model,'failed skin revision replaced live state');
scene.dispose();scene.dispose();
console.log('animated scene: independent skins, ten bounded replacements, compatible state and failed-candidate cleanup passed');
