import * as ui from 'zinc:ui';
import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';
import * as gfx from 'zinc:gfx';
import { startLive } from '../../../app/figma-live/viewer';
import { Scene } from '../../../app/figma-live/scene';
import { HouseController } from '../../../app/maison/controller';
function check(ok:boolean,message:string):void{if(!ok)throw new Error(message);}
let design: Scene | null=null;
startLive((scene:Scene):void=>{design=scene;new HouseController(scene);scene.load(JSON.parse(fs.readText(sys.env('ZINC_SEMANTIC_FIXTURE'))));});
const button=ui.find('Connecteurs · TypeScript');check(button>=0,'Connectors toggle is missing');ui.click(button);
check(ui.find('Design → code')>=0,'Connectors did not open');const slider=ui.find('Slider · salon.brightness');check(slider>=0,'Native slider binding is missing');ui.click(slider);
function allText(h:i32):string{let out=ui.inspectNode(h)!.text;for(let i=0;i<ui.childCount(h);i++)out+=' '+allText(ui.childAt(h,i));return out;}
check(allText(ui.inspectRoot()).indexOf('scene.controls.setValue("salon.brightness"')>=0,'Binding code snippet is missing');
function role(h:i32):i32{if(ui.inspectNode(h)!.role==='slider')return h;for(let i=0;i<ui.childCount(h);i++){const r=role(ui.childAt(h,i));if(r>=0)return r;}return -1;}
const scene=design as Scene;ui.keyDown(role(scene.outlet('salon.brightness')),'ArrowRight');
check(allText(ui.inspectRoot()).indexOf('salon.brightnessChanged →')>=0,'Native event did not appear in the inspector');
ui.click(ui.find('Fermer les connecteurs'));check(ui.find('Design → code')<0,'Connectors did not close');
scene.close();gfx.quit();console.log('maison viewer: connector toggle, code snippet and native event log ok');
