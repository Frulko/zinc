import * as ui from 'zinc:ui';
import { render, createSignal, createNodeRef } from 'zinc:ui/solid';
import { Svg } from 'zinc:svg';
import { iconNames } from 'zinc:icons';
import { componentEffect } from '../../../lib/std/kit/host';
import { Alert, Banner, Progress, ProgressRing, Meter, Spinner, Skeleton, Badge, Avatar, EmptyState, Timeline, useQuietTheme } from 'zinc:ui/kit';
useQuietTheme();
const root = createNodeRef();
const [value, setValue] = createSignal(-20), [shown, setShown] = createSignal(true);
let effects: i32 = 0, frame: i32 = 0, actions: i32 = 0, dismissed: i32 = 0;
let stoppedRotation: number = 0;
let resource: Svg | null = null;
function Probe(): i32 {
  componentEffect(() => { value(); effects++; const image = new Svg('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><circle cx="5" cy="5" r="4"/></svg>'); resource = image; return () => { image.dispose(); effects--; }; });
  return <View />;
}
function App(): i32 {
  return <View ref={root} className="p-4 flex-col gap-3">
    <Banner title="Update ready" action="Restart" onAction={() => actions++} dismissible={true} dismissLabel="Dismiss banner" onDismiss={() => dismissed++} />
    <Alert title="Storage warning" tone="warning" dismissible={true} dismissLabel="Dismiss alert" />
    <Progress label="Upload" value={value} showValue={true} />
    <Meter label="Storage" value={() => 18.4} max={20} unit="GB" />
    <Badge label="Ready" tone="success" dot={true} />
    <Avatar name="Ada Lovelace" status="online" />
    <EmptyState title="No projects" action="Create project" onAction={() => actions++} />
    <Timeline label="History" items={[{title:'Published',time:'Now',tone:'success'},{title:'Queued',description:'Waiting for a runner'}]} />
    <Show when={shown()}><View className="flex-row gap-3"><Probe /><Spinner label="Working" /><Skeleton width={100} /><ProgressRing label="Ring" value={value} size={48} /><Progress label="Unknown work" value={() => 0} indeterminate={true} className="w-40" /></View></Show>
  </View>;
}
function find(h: i32, text: string): i32 {
  const n = ui.inspectNode(h); if (n === null) return -1;
  if (n.label === text) return h;
  if (n.tag === ui.TEXT && n.text === text) { for (let p = n.parent; p >= 0; p = ui.parentOf(p)) { const parent = ui.inspectNode(p); if (parent !== null && parent.tag === ui.BUTTON) return p; } return h; }
  for (const child of n.children) { const result = find(child,text); if (result >= 0) return result; } return -1;
}
function range(h:i32,label:string):i32{const n=ui.inspectNode(h);if(n===null)return -1;if(n.role==='progressbar'&&n.label===label)return h;for(const child of n.children){const result=range(child,label);if(result>=0)return result;}return -1;}
function nativeValue(h:i32):string{const n=ui.inspectNode(h);if(n===null)return '';for(let i=0;i<n.nkv.length;i+=2)if(n.nkv[i]==='value')return n.nkv[i+1];return '';}
function attr(h: i32, key: string): string { const n = ui.inspectNode(h); if (n === null) return ''; const i = n.attrK.indexOf(key); return i < 0 ? '' : n.attrV[i]; }
function visible(h: i32): boolean { if (h < 0) return false; for (let p=h;p>=0;p=ui.parentOf(p)) { const n=ui.inspectNode(p); if(n===null||n.hidden)return false; }return true; }
render(App,0xf2f2f2,(dt:number)=>{
  frame++;
  if(frame===2){
    if(attr(range(root.node,'Upload'),'aria-valuenow')!=='0')throw new Error('negative progress was not clamped');
    if(ui.nativeRender()&&(nativeValue(range(root.node,'Upload'))!=='-20'||nativeValue(range(root.node,'Unknown work'))!=='-1'))throw new Error('native progress indeterminate contract');
    if(!attr(find(root.node,'Storage'),'aria-valuetext').includes('GB'))throw new Error('meter accessible unit missing');
    if(attr(find(root.node,'Ring'),'aria-valuemin')!=='0'||attr(find(root.node,'Ring'),'aria-valuemax')!=='100')throw new Error('ring range missing');
    if(effects!==1||resource===null||(resource as Svg).items()===0)throw new Error('owned effect did not mount');
    const old=resource as Svg; setValue(150);
    if(effects!==1||old.items()!==0)throw new Error('effect replacement retained Svg');
    if(attr(range(root.node,'Upload'),'aria-valuenow')!=='100')throw new Error('progress upper clamp');
    ui.tick(120); if(ui.getNumber(find(root.node,'Working'),'rotate')===0)throw new Error('spinner did not start');
    ui.systemSignal('reducemotion 1');ui.tick(1);stoppedRotation=ui.getNumber(find(root.node,'Working'),'rotate');
    ui.click(find(root.node,'Restart'));ui.click(find(root.node,'Create project'));if(actions!==2)throw new Error('feedback actions');
    ui.keyDown(find(root.node,'Dismiss banner'),'Enter');
  }
  if(frame===3){
    ui.keyUp('Enter');if(visible(find(root.node,'Update ready'))||dismissed!==1)throw new Error('banner keyboard dismissal');
    ui.click(find(root.node,'Dismiss alert'));if(visible(find(root.node,'Storage warning')))throw new Error('alert dismissal');
    setShown(false);if(effects!==0||resource===null||(resource as Svg).items()!==0)throw new Error('unmount retained effect/Svg');
    ui.tick(2000);ui.systemSignal('reducemotion 0');ui.tick(1);
    if(stoppedRotation!==0)throw new Error('reduced motion kept spinner moving');
    console.log('feedback icons: ' + iconNames().join(','));
    console.log('feedback: ok');
  }
});
