/** @jsxHelpers zinc:ui/kit/host */
import * as ui from 'zinc:ui';
import { Dropzone, AvatarUpload, SignaturePad, SignatureStroke, Comments, Presence, RollingCounter, Ticker, CardStack, ShimmerText, Typewriter, WordReveal, SpotlightCard, Loader, Waveform, NowPlaying, useQuietTheme } from 'zinc:ui/kit';
import { componentSignal } from 'zinc:ui/kit/host';
import { ok, equal } from 'zinc:assert';
let browseCount:i32=0,selected:i32=0,finishBrowse=(value:string[]|null):void=>{};
let signature=():SignatureStroke[]=>[], position=():number=>0, index=():i32=>0, playing=():boolean=>false, setVisible=(v:boolean):void=>{}, likes:i32=0,replies:i32=0,people:i32=0,exported:i32=0,done:i32=0,opened:i32=0;
const signatureLabel='Signature. Arrow keys move the pen, Enter starts or ends a stroke, Escape ends, Delete clears.';
const stackLabel='Card stack. Arrow keys browse cards, Enter opens the front card.';
function Surface():i32 {
 const [strokes,setStrokes]=componentSignal<SignatureStroke[]>([]),[pos,setPos]=componentSignal(0.25),[at,setAt]=componentSignal<i32>(0),[play,setPlay]=componentSignal(false);
 signature=strokes;position=pos;index=at;playing=play;
 return <View className="w-full flex-col gap-2">
  <Dropzone browse={()=>{browseCount++;return new Promise<string[]|null>((resolve:(value:string[]|null)=>void)=>{finishBrowse=resolve;});}} label="Attachments" compact={true} onFiles={(paths:string[])=>{selected++;}}/><AvatarUpload browse={()=>Promise.resolve<string[]|null>(null)} name="Maya" onSelect={(path:string)=>{}}/>
  <SignaturePad value={strokes} onChange={setStrokes} height={110} onExport={(value:SignatureStroke[])=>{exported=value.length;}}/>
  <Comments items={[{id:'c',author:'Maya',text:'Ready',likes:2}]} onLike={(id:string)=>{equal(id,'c');likes++;}} onReply={(id:string)=>{replies++;}}/>
  <Presence people={[{id:'a',name:'Maya',status:'online'},{id:'b',name:'Jonas'},{id:'c',name:'Priya'}]} maxVisible={2} onPerson={(id:string)=>{people++;}} onOverflow={()=>{people+=10;}}/>
  <RollingCounter value={1234.5} decimals={1}/><Ticker items={[{label:'Coverage',value:'76%'}]} active={true}/>
  <CardStack cards={[{id:'a',title:'A'},{id:'b',title:'B'},{id:'c',title:'C'}]} index={at} onChange={(value:i32,direction:string)=>setAt(value)} onOpen={(id:string)=>{opened++;}} height={95}/>
  <ShimmerText text="Loading preview" active={true}/><Typewriter text="Ready for review" active={true} onDone={()=>{done++;}}/><WordReveal text="Small deliberate changes" active={true}/><SpotlightCard title="Inspect details" active={true} onClick={()=>{opened++;}}/>
  <Loader active={()=>true}/><Loader active={()=>true} style="orbit"/>
  <Waveform label="Seek" peaks={[0.2,0.8,0.4,1,0.3]} position={pos} onSeek={setPos} height={40}/>
  <NowPlaying title="Track" artist="Artist" playing={play} position={()=>pos()*100} duration={100} onPlay={setPlay} onSeek={(value:number)=>setPos(value/100)} onPrevious={()=>setPos(0)} onNext={()=>setPos(1)} compact={true}/>
 </View>;
}
export function App():i32 {const[visible,show]=componentSignal(true);setVisible=show;return <View className="w-full">{visible()?<Surface/>:<View/>}</View>;}
function named(h:i32,label:string):i32 {const node=ui.inspectNode(h);if(node===null)return -1;if(node.label===label)return h;for(const child of node.children){const found=named(child,label);if(found>=0)return found;}return -1;}
function find(label:string):i32 {const h=named(ui.rootNode(),label);ok(h>=0,'missing '+label);return h;}
function key(label:string,name:string):void {const h=find(label);ui.focusNode(h);ui.keyDown(h,name);}
let stage:i32=0,oldDone:i32=0;
useQuietTheme();ui.systemSignal('reducemotion 1');
ui.setAfterPaint(()=>{
 if(stage===0){
  key(signatureLabel,'Enter');key(signatureLabel,'ArrowRight');key(signatureLabel,'ArrowDown');key(signatureLabel,'Enter');equal(signature().length,1);ok(signature()[0].points.length>=3);
  ui.click(find('Export signature'));equal(exported,1);ui.click(find('Clear signature'));equal(signature().length,0);
  ui.click(find('Like · 2'));ui.click(find('Reply'));equal(likes,1);equal(replies,1);ui.click(find('Maya, online'));ui.click(find('1 more people'));equal(people,11);
  key('Seek','Home');equal(position(),0);key('Seek','ArrowRight');equal(position(),0.01);key('Seek','End');equal(position(),1);
  key(stackLabel,'ArrowLeft');equal(index(),1);key(stackLabel,'ArrowRight');equal(index(),0);
  ui.click(find('Play'));ok(playing());ui.click(find('Next'));equal(position(),1);ui.click(find('Previous'));equal(position(),0);
 }else if(stage===1){
  const box=ui.screenBox(find(signatureLabel));ui.pointerAt(box[0]+10,box[1]+20,true);ui.pointerAt(box[0]+50,box[1]+40,true);ui.pointerAt(box[0]+70,box[1]+60,false);equal(signature().length,1);ok(signature()[0].points.length>1);
  const seek=ui.screenBox(find('Seek'));ui.pointerAt(seek[0]+seek[2]*0.25,seek[1]+10,true);ui.pointerAt(seek[0]+seek[2]*0.75,seek[1]+10,true);ui.pointerAt(seek[0]+seek[2]*0.75,seek[1]+10,false);ok(Math.abs(position()-0.75)<0.02,'pointer seek');
  const cards=ui.screenBox(find(stackLabel));ui.pointerAt(cards[0]+cards[2]*0.8,cards[1]+40,true);ui.pointerAt(cards[0]+cards[2]*0.1,cards[1]+40,true);ui.pointerAt(cards[0]+cards[2]*0.1,cards[1]+40,false);equal(index(),1,'flick advances');
  ui.systemSignal('reducemotion 0');ui.tick(1);
  const wordRoot=ui.inspectNode(find('Small deliberate changes'));ok(wordRoot!==null);
  const descendants:i32[]=(wordRoot as ui.UiNode).children.slice();let word:i32=-1;
  while(descendants.length>0){const candidate=descendants.shift() as i32,n=ui.inspectNode(candidate);if(n!==null){if(n.tag===ui.TEXT){word=candidate;break;}for(const child of n.children)descendants.push(child);}}
  ok(word>=0);const initial=(ui.inspectNode(word) as ui.UiNode).opacity;ui.tick(100);ok((ui.inspectNode(word) as ui.UiNode).opacity>initial,'word reveal advances in both UI models');
  ui.click(find('Attachments'));ui.click(find('Attachments'));equal(browseCount,1,'one owned picker request');oldDone=done;setVisible(false);
 }else if(stage===2){finishBrowse(['stale.txt']);ui.tick(2000);equal(done,oldDone,'disposed effects do not complete');equal(named(ui.rootNode(),'Seek'),-1);setVisible(true);
 }else if(stage===3){equal(selected,0,'late picker does not publish');equal(signature().length,0);equal(index(),0);ui.systemSignal('reducemotion 1');ui.tick(1);console.log('extended UI: ok');ui.setAfterPaint(null);}
 stage++;
});
