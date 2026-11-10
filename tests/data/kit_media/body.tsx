/** @jsxHelpers zinc:ui/kit/host */
import * as ui from 'zinc:ui';
import { createImage, beginImage, endImage, clear, destroyImage, imageWidth } from 'zinc:gfx';
import { ImageViewer, ImageCropper, ImageCompare, Carousel, ImageView, MediaRect, useQuietTheme, openImageViewer, closeImageViewer, imageViewerOpen, imageViewerState } from 'zinc:ui/kit';
import { componentSignal } from 'zinc:ui/kit/host';
import { equal, ok } from 'zinc:assert';
let getView = ():ImageView=>new ImageView(), getCrop=():MediaRect=>new MediaRect(), getSplit=():number=>0, getIndex=():i32=>0;
let setVisible=(value:boolean):void=>{}, closeCount:i32=0, resolveSharper=(image:i32):void=>{};
const image=createImage(40,20);beginImage(image);clear(0x778877);endImage();
const after=createImage(40,20);beginImage(after);clear(0x999988);endImage();
const sharper=createImage(80,40);beginImage(sharper);clear(0x889988);endImage();
function Surface():i32 {
 const [view,setView]=componentSignal(new ImageView()),[crop,setCrop]=componentSignal(new MediaRect()),[split,setSplit]=componentSignal(0.5),[index,setIndex]=componentSignal<i32>(0);
 getView=view;getCrop=crop;getSplit=split;getIndex=index;
 return <View className="w-full flex-col gap-3">
  <ImageViewer label="Photo" image={image} view={view} onChange={setView} height={130}/>
  <ImageCropper label="Crop" image={image} crop={crop} onChange={setCrop} height={130}/>
  <ImageCompare label="Compare" before={image} after={after} position={split} onChange={setSplit} height={100}/>
  <Carousel label="Collection" count={()=>3} index={index} onChange={setIndex} height={100} autoAdvance={0.3} loop={true} renderSlide={(at:i32)=><Button aria-label={'Slide action '+at} className="w-full h-full">{'Card '+at}</Button>}/>
 </View>;
}
export function App():i32 {
 const [visible,show]=componentSignal(true);setVisible=show;
 return <View className="w-full">{visible() ? <Surface/> : <View/>}</View>;
}
function named(h:i32,label:string):i32 {
 const node=ui.inspectNode(h);if(node===null)return -1;if(node.label===label)return h;
 for(const child of node.children){const found=named(child,label);if(found>=0)return found;}
 return -1;
}
function modalRoot():i32 {
 let h=ui.nodeAt(2,2);
 while(h>=0){const n=ui.inspectNode(h);if(n===null)break;if(n.role==='dialog')return h;h=n.parent;}
 throw new Error('Missing modal root');
}
function find(label:string):i32{const h=named(ui.rootNode(),label);ok(h>=0,'missing '+label);return h;}
function key(label:string,key:string,mods:i32=0):void{const h=find(label);ui.focusNode(h);ui.keyDown(h,key,mods);}
let stage:i32=0,oldIndex:i32=0;
useQuietTheme();ui.systemSignal('reducemotion 1');
ui.setAfterPaint(()=>{
 if(stage===0){
  key('Photo','1');equal(getView().zoom,1);key('Photo','+');equal(getView().zoom,1.5);key('Photo','0');equal(getView().zoom,0);
  key('Crop','ArrowRight');equal(getCrop().x,11);key('Crop','ArrowRight',ui.SHIFT);equal(getCrop().x,20);
  key('Compare','Home');key('Compare','ArrowRight',ui.SHIFT);equal(getSplit(),0.1);key('Compare','End');equal(getSplit(),1);
  key('Collection slides','ArrowRight');key('Collection slides','ArrowRight');equal(getIndex(),2);key('Collection slides','ArrowRight');equal(getIndex(),0);
  key('Collection slides','End');equal(getIndex(),2);
 }else if(stage===1){
  ok(ui.isDisabled(find('Slide action 0')),'inactive slides cannot receive focus');ok(!ui.isDisabled(find('Slide action 2')),'active slide stays enabled');
  ui.click(find('Show slide 1'));equal(getIndex(),0);
  ui.systemSignal('reducemotion 0');ui.tick(1);const rotation=find('Start rotation');ui.click(rotation);ui.tick(350);equal(getIndex(),1,'explicit rotation runs');
  const nextButton=ui.screenBox(find('Next slide'));
  ui.pointerAt(nextButton[0]+nextButton[2]/2,nextButton[1]+nextButton[3]/2,true);
  ok(ui.hasFocusWithin(find('Collection')),'pointer actually enters focus scope');
  const pointerIndex=getIndex();ui.pointerAt(1,1,true);ui.tick(500);equal(getIndex(),pointerIndex,'pointer focus pauses outside hover');
  ui.pointerAt(1,1,false);ui.tick(500);equal(getIndex(),pointerIndex,'leaving does not resume after focus');
  ui.click(rotation);ui.tick(350);equal(getIndex(),(pointerIndex+1)%3,'restart got '+getIndex()+' from '+pointerIndex);
  key('Collection slides','ArrowRight');oldIndex=getIndex();ui.tick(500);equal(getIndex(),oldIndex,'keyboard stops rotation');
  const compare=ui.screenBox(find('Compare'));
  ui.pointerAt(compare[0]+compare[2]*0.25,compare[1]+compare[3]/2,true);ui.pointerAt(compare[0]+compare[2]*0.25,compare[1]+compare[3]/2,false);
  ok(Math.abs(getSplit()-0.25)<0.01,'local pointer divider');
  ui.systemSignal('reducemotion 1');ui.tick(1);
  const photo=ui.screenBox(find('Photo'));ui.wheelAt(photo[0]+photo[2]/2,photo[1]+photo[3]/2,0,0,2);ok(getView().zoom>0,'pinch wheel updates view');
 }else if(stage===2){
  const carousel=ui.screenBox(find('Collection slides'));key('Collection slides','Home');ui.tick(800);
  ui.pointerAt(carousel[0]+carousel[2]*0.8,carousel[1]+carousel[3]/2,true);ui.pointerAt(carousel[0]+carousel[2]*0.15,carousel[1]+carousel[3]/2,true);ui.pointerAt(carousel[0]+carousel[2]*0.15,carousel[1]+carousel[3]/2,false);equal(getIndex(),1,'swipe selects next slide');
  const photo=ui.screenBox(find('Photo')),before=getView().cy;
  ui.pointerAt(photo[0]+photo[2]/2,photo[1]+photo[3]/2,true);
  ui.pointerAt(photo[0]+photo[2]/2,photo[1]+photo[3]/2+24,true);
  ui.pointerAt(photo[0]+photo[2]/2,photo[1]+photo[3]/2+24,false);
  ok(getView().cy<before,'pan before '+before+' after '+getView().cy+' zoom '+getView().zoom+' box '+photo.join(','));
  key('Crop','Home');const box=ui.screenBox(find('Crop'));
  ui.pointerAt(box[0]+box[2]/2,box[1]+box[3]/2,true);ui.pointerAt(box[0]+box[2]/2+20,box[1]+box[3]/2,true);ui.pointerAt(box[0]+box[2]/2+20,box[1]+box[3]/2,false);
  ok(getCrop().x>10,'crop follows pointer');
  const divider=ui.screenBox(find('Compare'));ui.pointerAt(divider[0]+divider[2]*0.25,divider[1]+divider[3]/2,true);ui.pointerAt(divider[0]+divider[2]*0.75,divider[1]+divider[3]/2,true);ui.pointerAt(divider[0]+divider[2]*0.75,divider[1]+divider[3]/2,false);ok(Math.abs(getSplit()-0.75)<0.01,'divider follows drag');
  ui.systemSignal('reducemotion 0');ui.tick(1);ui.click(find('Start rotation'));oldIndex=getIndex();
  setVisible(false);
 }else if(stage===3){
  equal(named(ui.rootNode(),'Photo'),-1);ui.tick(1000);equal(getIndex(),oldIndex,'disposed timer does not update parent');setVisible(true);
 }else if(stage===4){
  equal(getView().zoom,0);equal(getIndex(),0);ok(find('Photo')>=0,'fresh mount');
  ui.systemSignal('reducemotion 1');ui.tick(1);
  openImageViewer({items:[{image:image,width:40,height:20,title:'Preview',sharper:()=>new Promise<i32>((resolve:(image:i32)=>void)=>{resolveSharper=resolve;})}],index:0,onClose:()=>{closeCount++;}});
  ok(imageViewerOpen());equal(imageViewerState()[1],1);
  ui.keyDown(modalRoot(),'+',0);equal(imageViewerState()[1],1.5);ui.pointerAt(400,650,true);ui.pointerAt(450,650,true);ui.pointerAt(450,650,false);ok(imageViewerState()[2]>0,'existing modal pans with the first gesture delta');
  closeImageViewer();closeImageViewer();equal(closeCount,1);ok(!imageViewerOpen());resolveSharper(sharper);
 }else if(stage===5){
  equal(imageWidth(sharper),0,'stale sharper response released');equal(imageWidth(image),40,'caller thumbnail remains owned');
  openImageViewer({items:[{image:image,width:40,height:20}],index:0,onClose:()=>{closeCount++;}});
  ui.destroy(modalRoot());ok(!imageViewerOpen());equal(closeCount,2,'external destroy cleans exactly once');
  openImageViewer({items:[{image:image,width:40,height:20}],index:0});ok(imageViewerOpen(),'viewer reopens after external destroy');ui.systemSignal('reducemotion 0');ui.tick(1);closeImageViewer();ok(imageViewerOpen(),'animated close owns resources until finished');closeImageViewer(true);ok(!imageViewerOpen(),'owner may synchronously release borrowed pictures');
  setVisible(false);
 }else if(stage===6){
  ui.tick(1000);destroyImage(image);destroyImage(after);console.log('media UI: ok');ui.setAfterPaint(null);
 }
 stage++;
});
