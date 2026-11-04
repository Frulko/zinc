import * as ui from 'zinc:ui';
import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';
import { Scene } from '../../../app/figma-live/scene';
import { BindingEvent } from '../../../app/figma-live/native';
function check(ok:boolean,message:string):void{if(!ok)throw new Error(message);}
function role(h:i32,name:string):i32{const n=ui.inspectNode(h);if(n!==null&&n.role===name)return h;for(let i=0;i<ui.childCount(h);i++){const found=role(ui.childAt(h,i),name);if(found>=0)return found;}return -1;}
const scene=new Scene();let changes=0,lastValue:number=0,rows=0;
scene.onBinding=(e:BindingEvent):boolean=>{changes++;lastValue=e.value;return true;};
scene.controls.registerList('test.rows',():number=>100000,(index:i32):i32=>{rows++;const h=ui.createNode(ui.TEXT);ui.setClass(h,'h-10 w-full');ui.setText(h,'Row '+index);return h;});
scene.load(JSON.parse(fs.readText(sys.env('ZINC_SEMANTIC_FIXTURE'))));ui.setRoot(scene.root);ui.layout();
const slider=scene.outlet('test.brightness'),nativeSlider=role(slider,'slider');check(nativeSlider>=0,'Not a real native slider');
ui.keyDown(nativeSlider,'ArrowRight');check(changes===1&&lastValue===51,'Numeric slider event was lost');
for(let i=0;i<1000;i++)scene.controls.setValue('test.brightness',i%100);
ui.layout();check(scene.outlet('test.brightness')===slider,'Value updates rebuilt the slider');
const toggle=role(scene.outlet('test.light'),'switch');check(toggle>=0,'Not a real native switch');ui.click(toggle);check(changes===2&&lastValue===1,'Switch event');
ui.frame(16,0xffffff);const list=scene.outlet('test.rows');check(ui.childCount(list)>0&&ui.childCount(list)<20&&rows>0&&rows<20,'Virtual list realized the whole collection');
ui.scrollTo(list,0,200000);ui.frame(16,0xffffff);check(ui.childCount(list)<20,'Virtual list grew with the collection');
const chat=scene.outlet('test.chat');
function append():void{const row=ui.createNode(ui.VIEW);ui.setClass(row,'h-10 shrink-0');ui.insert(chat,row,-1);ui.layout();}
for(let i=0;i<8;i++)append();check(ui.scrollTop(chat)>0,'Chat did not follow the tail');
ui.scrollTo(chat,0,20);ui.layout();append();check(Math.abs(ui.scrollTop(chat)-20)<1,'Chat stole manual scroll-up');
ui.scrollTo(chat,0,100000);ui.layout();const previous=ui.scrollTop(chat);append();check(ui.scrollTop(chat)>previous,'Chat did not resume tail following');
scene.close();console.log('maison semantics: native controls, numeric events, 1000 stable updates, 100000 virtual rows and sticky chat ok');
