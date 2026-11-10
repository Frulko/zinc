import * as ui from 'zinc:ui';
import { imageWidth } from 'zinc:gfx';
import { render, createSignal } from 'zinc:ui/solid';
import { Dropzone, AvatarUpload } from 'zinc:ui/kit';
import { equal, ok } from 'zinc:assert';
let selected:i32=0,rejected:i32=0,wrong:i32=0,photo:i32=0,decoded:i32=-1;
const[visible,setVisible]=createSignal(true);
function Surface():i32 {return <View className="w-full flex-col gap-4"><View className="flex-row w-full gap-4"><Dropzone browse={()=>Promise.resolve<string[]|null>(null)} label="Target" className="w-[260px]" accept="txt" compact={true} onFiles={(paths:string[])=>{selected++;ok(paths[0].endsWith('attachment.txt'));}} onReject={(path:string,reason:string)=>{rejected++;}}/><Dropzone browse={()=>Promise.resolve<string[]|null>(null)} label="Other" className="w-[260px]" accept="txt" compact={true} onFiles={(paths:string[])=>{wrong++;}}/></View><AvatarUpload browse={()=>Promise.resolve<string[]|null>(null)} name="Maya" onSelect={(path:string)=>{photo++;}}/></View>;}
function ownedImage(h:i32):i32 {const node=ui.inspectNode(h);if(node===null)return -1;if(node.tag===ui.IMAGE&&node.img>=0)return node.img;for(const child of node.children){const image=ownedImage(child);if(image>=0)return image;}return -1;}
let frame:i32=0;
render(()=> <View className="w-full">{visible()?<Surface/>:<View/>}</View>,0xffffff,(dt:number)=>ui.repaint());
ui.setAfterPaint(()=>{
 frame++;
 if(frame===8){equal(selected,1,'native stream routed to hit zone');equal(rejected,1,'file validation runs on native drops');equal(wrong,0,'other instance did not receive drop');}
 if(frame===22){equal(photo,1,'cancelled decode cannot publish before its replacement');decoded=ownedImage(ui.rootNode());ok(decoded>=0&&imageWidth(decoded)>0);setVisible(false);}
 if(frame===27){equal(imageWidth(decoded),0,'unmount releases owned preview');equal(selected,1);equal(photo,1);setVisible(true);}
 if(frame===34){equal(selected,2,'fresh mount subscribes once');equal(photo,1);equal(wrong,0);console.log('extended native drop: ok');ui.setAfterPaint(null);}
});
