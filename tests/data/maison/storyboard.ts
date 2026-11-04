import * as ui from 'zinc:ui';
import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';
import { Scene } from '../../../app/figma-live/scene';
import { HouseController } from '../../../app/maison/controller';
import { Layer } from '../../../app/figma-live/model';
import { BindingEvent } from '../../../app/figma-live/native';
function check(ok:boolean,message:string):void{if(!ok)throw new Error(message);}
const scene=new Scene(),house=new HouseController(scene);
scene.load(JSON.parse(fs.readText(sys.env('ZINC_SEMANTIC_FIXTURE'))));ui.setRoot(scene.root);ui.layout();
check(scene.outlet('salon.brightness')>=0,'Missing semantic slider in real Figma snapshot');
const e=new BindingEvent();e.key='salon.lightChanged';e.value=0;
house.handle(e);check(house.client.entities.get('light.salon')!.state==='off','Controller did not receive native action');
e.value=1;house.handle(e);check(house.client.entities.get('light.salon')!.state==='on','Demo light failed to turn on');
function named(n:Layer,name:string):string{if(n.name===name)return n.id;for(const c of n.children){const id=named(c,name);if(id!=='')return id;}return '';}
scene.customViewport=true;
for(const width of [390,834,1280]){scene.resize(width,900);ui.layout();check(scene.screen().width===width,'Wrong responsive Figma screen');const h=scene.outlet('salon.brightness');const box=ui.screenBox(h);check(h>=0&&box[2]>0&&box[0]>=0&&box[0]+box[2]<=width+1,'Native slider outside viewport');if(width===390){const settings=scene.outlet(named(scene.screen().tree,'action:connection.open'));check(settings>=0,'Mobile settings are missing');ui.click(settings);check(ui.find('Votre Home Assistant')>=0,'Mobile connection sheet did not open');ui.click(ui.find('Fermer'));}}
for(const screen of scene.document.screens)if(screen.name==='Maison / Devices / Tablet')scene.navigate(screen.id);
for(const width of [390,834,1280]){scene.resize(width,900);ui.frame(16,0xffffff);const h=scene.outlet('house.devices'),box=ui.screenBox(h);check(scene.screen().width===width&&box[2]>200&&box[0]+box[2]<=width+1,'Device list did not adapt to the viewport');}
ui.frame(16,0xffffff);const list=scene.outlet('house.devices');check(list>=0&&ui.childCount(list)>0,'Live device rows are missing');
const row=ui.childAt(list,0);check(ui.childCount(ui.childAt(row,1))>0,'Device button has no rendered text label');
for(let i=0;i<100;i++)house.client.receive('{"type":"event","event":{"c":{"light.salon":{"+":{"a":{"brightness":100}}}}}}');
ui.frame(16,0xffffff);check(ui.childAt(list,0)===row,'Attribute updates rebuilt device rows');
house.client.receive('{"type":"event","event":{"r":["light.salon"],"a":{"light.kitchen":{"s":"on","a":{"friendly_name":"Cuisine"}}}}}');
ui.frame(16,0xffffff);
function text(h:i32):string{let out=ui.inspectNode(h)!.text;for(let i=0;i<ui.childCount(h);i++)out+=' '+text(ui.childAt(h,i));return out;}
check(text(list).indexOf('Cuisine')>=0&&text(list).indexOf('Suspension du salon')<0,'Same-count entity replacement left stale rows');
scene.close();console.log('maison storyboard: real snapshot, controller actions, three breakpoints and native device list ok');
