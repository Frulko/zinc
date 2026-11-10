/** @jsxHelpers zinc:ui/kit/host */
import * as ui from 'zinc:ui';
import * as fs from 'zinc:fs';
import { on } from 'zinc:system/events';
import { createNodeRef } from 'zinc:ui/solid';
import { Value, spring, timing, Easing } from 'zinc:ui/animated';
import { pointerX, pointerY, rect, rrect, border, path as drawPath, clip, unclip, drawText, font, textWidth, startImageDecode, pollImageDecode, cancelImageDecode, destroyImage } from 'zinc:gfx';
import { theme, themeColor } from './theme';
import { componentRef, componentEffect, componentSignal, renderSlot } from './host';
import { Button as Action } from './button';
import { Avatar, Spinner, ProgressRing } from './feedback';
import { Tooltip } from './overlays';
import { retainCachedImage, releaseCachedImage } from '../image-cache';
import { clampExtended, fileRejection, SignaturePoint, SignatureStroke, SignaturePhase, SignatureSession, counterText, waveformPeaks, mediaTime, seekKey } from './extended-model';
export { SignaturePoint, SignatureStroke } from './extended-model';

function surface(extra: string = ''): string { return `min-w-0 rounded-[10px] border border-${theme().border} bg-${theme().card} ${extra}`; }
function focus(): string { return `focus-visible:ring-2 focus-visible:ring-${theme().accent} focus-visible:ring-offset-2`; }
function textClass(): string { return `text-[13px] text-${theme().foreground}`; }
function inside(root: i32): boolean {
  let hit = ui.nodeAt(pointerX(), pointerY());
  for (let depth = 0; hit >= 0 && depth < 64; depth++) { if (hit === root) return true; const node = ui.inspectNode(hit); if (node === null) return false; hit = node.parent; }
  return false;
}
enum PickerState { Idle, Picking, Disposed }
class PickerSession {
  state:PickerState=PickerState.Idle;generation:i32=0;
  transition(next:PickerState):boolean {
    if(this.state===PickerState.Disposed||next===PickerState.Picking&&this.state!==PickerState.Idle)return false;
    this.state=next;return true;
  }
  begin():boolean {if(!this.transition(PickerState.Picking))return false;this.generation++;return true;}
  current(generation:i32):boolean {return this.state===PickerState.Picking&&this.generation===generation;}
  dispose():void {this.generation++;this.transition(PickerState.Disposed);}
}
function useImages(read:()=>i32[]):void {
  componentEffect(()=>{const images=read();for(const image of images)retainCachedImage(image);return ()=>{for(const image of images)releaseCachedImage(image);};});
}
export interface DropzoneProps {
  label: string; accept?: string; maxBytes?: number; multiple?: boolean; compact?: boolean; disabled?: boolean;
  description?: string; children?: () => i32; browse: () => Promise<string[] | null>; onFiles: (paths: string[]) => void; onReject?: (path: string, reason: string) => void; className?: string;
}
export function Dropzone(p: DropzoneProps): i32 {
  const root = createNodeRef(), serial = componentRef<i32>(-1), picker=componentRef(new PickerSession()).current, [status, setStatus] = componentSignal('');
  const current = componentRef(p); current.current = p;
  const select = (paths: string[]): void => {
    const props = current.current; if (props.disabled === true || ui.nodeSerial(root.node) !== serial.current) return;
    const valid: string[] = [];
    for (const path of paths.slice(0, props.multiple === true ? 128 : 1)) {
      let reason = '';
      try { const st = fs.stat(path); reason = fileRejection(path, props.accept ?? '', st.size, props.maxBytes ?? 16 * 1024 * 1024, st.isFile); }
      catch (error) { reason = 'Cannot read this file'; }
      if (reason.length === 0) valid.push(path);
      else { setStatus(reason); if (props.onReject !== undefined) props.onReject(path, reason); }
    }
    if (valid.length > 0) { setStatus(valid.length + ' file' + (valid.length > 1 ? 's' : '') + ' selected'); props.onFiles(valid); }
  };
  const browse = async (): Promise<void> => {
    if (current.current.disabled === true || !picker.begin()) return;
    const generation=picker.generation;setStatus('Choosing files');
    try { const result = await current.current.browse(); if (result !== null && picker.current(generation) && ui.nodeSerial(root.node) === serial.current) select(result); else if(result===null&&picker.current(generation))setStatus('Selection cancelled'); }
    catch (error) { if (picker.current(generation) && ui.nodeSerial(root.node) === serial.current) setStatus('File picker is unavailable'); }
    finally {if(picker.current(generation))picker.transition(PickerState.Idle);}
  };
  const node = <Button ref={root} role="button" aria-label={p.label} disabled={p.disabled === true} onClick={() => { browse(); }} className={`${surface('items-center justify-center gap-2 px-4 py-3')} ${focus()} ${p.disabled === true ? 'opacity-45' : ''} ${p.className ?? ''}`} style={{ minHeight: p.compact === true ? 54 : 150 }}>
    {renderSlot(p.children)}<Text className={textClass()}>{p.label}</Text><Text className={`text-[12px] text-${theme().mutedForeground}`}>{p.description ?? 'Drop files here or press to browse'}</Text>
    <Show when={status().length > 0}><Text role="status" className={`text-[12px] text-${theme().mutedForeground}`}>{status()}</Text></Show>
  </Button>;
  componentEffect(() => { serial.current = ui.nodeSerial(root.node); const dispose = on('drop', (args: string[]) => { if (args.length > 0 && (args.length < 2 || args[1] !== 'text') && ui.nodeSerial(root.node) === serial.current && inside(root.node)) select([args[0]]); }); return ()=>{dispose();picker.dispose();}; }, []);
  return node;
}

enum DecodePhase { Idle, Decoding, Ready, Failed, Disposed }
class AvatarDecode {
  state: DecodePhase = DecodePhase.Idle; generation: i32 = 0; request: i32 = 0; image: i32 = -1;
  transition(next: DecodePhase): boolean { if (this.state === DecodePhase.Disposed) return false; this.state = next; return true; }
  cancel(): void { this.generation++; if (this.state === DecodePhase.Decoding) { cancelImageDecode(this.request); this.transition(this.image >= 0 ? DecodePhase.Ready : DecodePhase.Idle); } this.request = 0; }
  release(): void { if (this.image >= 0) destroyImage(this.image); this.image = -1; }
  dispose(): void { this.cancel(); this.release(); this.transition(DecodePhase.Disposed); }
}
export interface AvatarUploadProps { name: string; image?: i32; size?: number; disabled?: boolean; maxBytes?: number; browse: () => Promise<string[] | null>; onSelect: (path: string) => void; onError?: (message: string) => void; className?: string }
export function AvatarUpload(p: AvatarUploadProps): i32 {
  const memory = componentRef<AvatarDecode | null>(null);
  if (memory.current === null) memory.current = new AvatarDecode();
  const owner = memory.current, [image, setImage] = componentSignal<i32>(-1), [message, setMessage] = componentSignal('');
  const props = componentRef(p); props.current = p;
  const path = componentRef('');
  const fail = (reason: string): void => { if (owner.state === DecodePhase.Disposed) return; owner.cancel(); owner.transition(DecodePhase.Failed); setMessage(reason); const f = props.current.onError; if (f !== undefined) f(reason); };
  const polling = componentRef<(() => void) | null>(null);
  if (polling.current === null) polling.current = (): void => {
    if (owner.state !== DecodePhase.Decoding) { ui.removeStepper(polling.current as () => void); return; }
    const generation = owner.generation, result = pollImageDecode(owner.request);
    if (result === -2) return;
    ui.removeStepper(polling.current as () => void); owner.request = 0;
    if (generation !== owner.generation || owner.state === DecodePhase.Disposed) { if (result >= 0) destroyImage(result); return; }
    if (result < 0) { fail('Cannot decode this image'); return; }
    owner.release(); owner.image = result; owner.transition(DecodePhase.Ready); setImage(result); setMessage('Photo updated'); props.current.onSelect(path.current);
  };
  const poll = polling.current;
  const select = (paths: string[]): void => {
    if (paths.length === 0 || owner.state === DecodePhase.Disposed) return;
    owner.cancel(); ui.removeStepper(poll);
    try {
      const request = startImageDecode(fs.readBytes(paths[0]), 512);
      if (request <= 0) throw new Error('Image decoder is busy; try again');
      owner.request = request; owner.transition(DecodePhase.Decoding); path.current = paths[0]; setMessage('Loading image'); ui.addStepper(poll);
    } catch (error) { fail('Cannot decode this image'); }
  };

  useImages(()=>[p.image??-1]);
  componentEffect(() => () => { ui.removeStepper(poll); owner.dispose(); }, []);
  return <View className={`flex-col items-start gap-2 ${p.className ?? ''}`}>
    <Dropzone browse={p.browse} label="Change photo" description="PNG, JPEG, BMP, GIF or WebP" accept="png;jpg;jpeg;bmp;gif;webp" compact={true} disabled={p.disabled} maxBytes={p.maxBytes ?? 8 * 1024 * 1024} onFiles={select} onReject={(path: string, reason: string) => fail(reason)}><Avatar name={p.name} size={p.size ?? 72} image={image() >= 0 ? image() : p.image ?? -1}/></Dropzone>
    <Text role="status" className={`text-[12px] text-${theme().mutedForeground}`}>{message()}</Text>
  </View>;
}

export interface SignaturePadProps { value: () => SignatureStroke[]; onChange: (strokes: SignatureStroke[]) => void; onExport?: (strokes: SignatureStroke[]) => void; label?: string; height?: number; disabled?: boolean; className?: string }
export function SignaturePad(p: SignaturePadProps): i32 {
  const owner = componentRef(new SignatureSession()).current, width = componentRef(1), height = componentRef(p.height ?? 150), cursor = componentRef([0.5, 0.5]);
  const publish = (): void => { p.onChange(owner.strokes); ui.repaint(); };
  const begin = (x: number, y: number): void => { if (p.disabled !== true && owner.begin(p.value(), x, y, ui.now())) publish(); };
  const append = (x: number, y: number): void => { if (p.disabled !== true && owner.append(x, y, ui.now())) publish(); };
  componentEffect(() => () => owner.dispose(), []);
  return <View className={`flex-col gap-2 ${p.className ?? ''}`}>
    <Button role="group" aria-label={(p.label ?? 'Signature') + '. Arrow keys move the pen, Enter starts or ends a stroke, Escape ends, Delete clears.'} disabled={p.disabled === true} className={`${surface('relative overflow-hidden w-full')} ${focus()}`} style={{ height: p.height ?? 150 }}
      onPointerDown={(e: ui.PointerEvent) => { if (e.button === 0) begin(e.x / width.current, e.y / height.current); }}
      onPointerMove={(e: ui.PointerEvent) => append(e.x / width.current, e.y / height.current)} onPointerUp={(e: ui.PointerEvent) => owner.end()} onPointerCancel={(e: ui.PointerEvent) => owner.end()}
      onKeyDown={(e: ui.KeyEvent) => {
        const c = cursor.current, step = e.shift ? 0.05 : 0.01;
        if (e.key === 'Enter' || e.key === ' ') { if (owner.state === SignaturePhase.Drawing) owner.end(); else begin(c[0], c[1]); }
        else if (e.key === 'Escape') owner.end();
        else if (e.key === 'Delete' || e.key === 'Backspace') { owner.end(); p.onChange([]); }
        else if (e.key.startsWith('Arrow')) { c[0] = clampExtended(c[0] + (e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0)); c[1] = clampExtended(c[1] + (e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0)); append(c[0], c[1]); }
        else return;
        e.preventDefault(); ui.repaint();
      }}>
      <Canvas className="absolute inset-0 pointer-events-none" style={{ lazy: 1 }} onDraw={(x: i32, y: i32, w: i32, h: i32) => { width.current = w; height.current = h; let remaining = 8192; for (const stroke of p.value().slice(0, 256)) { const points = stroke.points.slice(0, remaining); remaining -= points.length; const contours:number[]=[];
        for (let i = 0; i < points.length; i++) { const point = points[i], previous = points[Math.max(0, i - 1)], px = x + clampExtended(point.x) * w, py = y + clampExtended(point.y) * h, ax = x + clampExtended(previous.x) * w, ay = y + clampExtended(previous.y) * h, dx = px - ax, dy = py - ay, length = Math.max(0.001, Math.hypot(dx,dy)), nx = -dy / length, ny = dx / length, a = clampExtended(previous.width,1,3)/2, b = clampExtended(point.width,1,3)/2;
          if (i > 0) contours.push(4, ax+nx*a,ay+ny*a,px+nx*b,py+ny*b,px-nx*b,py-ny*b,ax-nx*a,ay-ny*a);
          rrect(px-b,py-b,b*2,b*2,b,themeColor('foreground'),255);
        }
        if (contours.length > 0) drawPath(contours,themeColor('foreground'),255); } }} />
    </Button>
    <View className="flex-row flex-wrap gap-2"><Action label="Clear signature" variant="outline" size="sm" disabled={p.disabled} onClick={() => { owner.end(); p.onChange([]); }}/><Show when={p.onExport !== undefined}><Action label="Export signature" size="sm" disabled={p.disabled} onClick={() => { const exportValue = p.onExport; if (exportValue !== undefined) exportValue(p.value()); }}/></Show></View>
  </View>;
}

export interface CommentItem { id: string; author: string; text: string; time?: string; image?: i32; depth?: number; likes?: number; liked?: boolean; badge?: string; edited?: boolean }
export interface CommentsProps { items: CommentItem[]; onLike?: (id: string) => void; onReply?: (id: string) => void; className?: string }
export function Comments(p: CommentsProps): i32 {
  useImages(()=>p.items.slice(0,256).map((item:CommentItem)=>item.image??-1));
  return <View role="list" aria-label="Comments" className={`flex-col gap-4 ${p.className ?? ''}`}>
    {p.items.slice(0, 256).map((item: CommentItem) => <View role="listitem" className={`flex-row gap-3 min-w-0 border-l border-${theme().border} pl-3`} style={{ marginLeft: clampExtended(item.depth ?? 0, 0, 8) * 16 }}>
      <Avatar name={item.author} image={item.image} size="sm"/>
      <View className="flex-col gap-2 grow shrink min-w-0"><View className="flex-row flex-wrap gap-2"><Text className={`text-[13px] font-medium text-${theme().foreground}`}>{item.author}</Text><Text className={`text-[12px] text-${theme().mutedForeground}`}>{item.badge ?? ''} {item.time ?? ''}{item.edited === true ? ' · edited' : ''}</Text></View><Text className={textClass()}>{item.text}</Text>
      <View className="flex-row gap-2"><Show when={p.onLike !== undefined}><Action size="sm" variant="ghost" label={(item.liked === true ? 'Liked' : 'Like') + ' · ' + (item.likes ?? 0)} pressed={item.liked} onClick={() => { if (p.onLike !== undefined) p.onLike(item.id); }}/></Show><Show when={p.onReply !== undefined}><Action size="sm" variant="ghost" label="Reply" onClick={() => { if (p.onReply !== undefined) p.onReply(item.id); }}/></Show></View></View>
    </View>)}
  </View>;
}
export interface PresencePerson { id: string; name: string; image?: i32; status?: string }
export interface PresenceProps { people: PresencePerson[]; maxVisible?: number; size?: number; onPerson?: (id: string) => void; onOverflow?: () => void; className?: string }
export function Presence(p: PresenceProps): i32 {
  useImages(()=>p.people.slice(0,20).map((person:PresencePerson)=>person.image??-1));
  const root=createNodeRef(), [expanded,setExpanded]=componentSignal(false);
  const expand=(value:boolean):void=>{if(value===expanded())return;if(!ui.prefersReducedMotion())ui.LayoutAnimation.configureNext(ui.LayoutAnimation.create(240,'spring','opacity'));setExpanded(value);};
  const limit = (): i32 => Math.floor(clampExtended(p.maxVisible ?? 5, 1, 20));
  const node = <View ref={root} role="group" aria-label="People present" onPointerEnter={(e:ui.PointerEvent)=>expand(true)} onPointerLeave={(e:ui.PointerEvent)=>{if(!ui.hasFocusWithin(root.node))expand(false);}} className={`flex-row flex-wrap items-center ${p.className ?? ''}`}>
    {p.people.slice(0, limit()).map((person: PresencePerson, index: i32) => <Tooltip label={person.name + ', ' + (person.status ?? 'online')} className="min-w-0"><Button aria-label={person.name + ', ' + (person.status ?? 'online')} className={`rounded-full border-2 border-${theme().card} ${focus()} ${person.status === 'away' || person.status === 'offline' ? 'opacity-55' : ''}`} style={{ marginLeft: index === 0 || expanded() ? 0 : -8 }} disabled={p.onPerson === undefined} onClick={() => { if (p.onPerson !== undefined) p.onPerson(person.id); }}><Avatar name={person.name} image={person.image} status={person.status} size={p.size ?? 36}/></Button></Tooltip>)}
    <Show when={p.people.length > limit()}><Action variant="outline" size="sm" disabled={p.onOverflow === undefined} ariaLabel={(p.people.length - limit()) + ' more people'} label={'+' + (p.people.length - limit())} onClick={() => { if (p.onOverflow !== undefined) p.onOverflow(); }}/></Show>
  </View>;
  componentEffect(()=>ui.onFocusWithin(root.node,(visible:boolean)=>{const node=ui.inspectNode(root.node);expand(ui.hasFocusWithin(root.node)||node!==null&&node.hovered);}),[]);
  return node;
}

// Shared motion owns one Value and one legal lifecycle; static controls register no stepper.
enum MotionState { Idle, Running, Paused, Disposed }
class ExtendedMotion {
  state: MotionState = MotionState.Idle; value: Value = new Value(1); generation: i32 = 0; key: string = '';
  transition(next: MotionState): boolean { if (this.state === MotionState.Disposed) return false; this.state = next; return true; }
  stop(): void { this.generation++; this.value.stopAnimation(); this.transition(MotionState.Idle); }
  run(duration: number, repeat: boolean, delay: number, springing: boolean, resume: boolean = false): void {
    if (!this.transition(MotionState.Running)) return;
    const generation = this.generation;
    if (!resume) this.value.setValue(0);
    const animation = springing ? spring(this.value, { toValue: 1, stiffness: 240, damping: 28, mass: 1 }) : timing(this.value, { toValue: 1, duration: clampExtended(duration * (resume ? 1 - this.value.get() : 1), 40, 60000), delay: clampExtended(delay, 0, 60000), easing: Easing.linear });
    animation.start((finished: boolean) => {
      if (this.generation !== generation || this.state !== MotionState.Running) return;
      if (finished && repeat) this.run(duration, repeat, delay, springing); else this.transition(MotionState.Idle);
    });
  }
  dispose(): void { this.stop(); this.value.removeAllListeners(); this.transition(MotionState.Disposed); }
}
function useMotion(key: () => string, active: () => boolean, duration: () => number, repeat: boolean = false, delay: () => number = () => 0, springing: boolean = false, paused: () => boolean = () => false): Value {
  const memory = componentRef<ExtendedMotion | null>(null);
  if (memory.current === null) memory.current = new ExtendedMotion();
  const owner = memory.current;
  const latest = componentRef(() => {});
  latest.current = (): void => {
    const next = key() + ':' + active() + ':' + duration() + ':' + delay() + ':' + ui.prefersReducedMotion();
    if (owner.key === next) {
      if (paused() && owner.state === MotionState.Running) { owner.stop(); owner.transition(MotionState.Paused); }
      else if (!paused() && owner.state === MotionState.Paused) owner.run(duration(), repeat, 0, springing, true);
      return;
    }
    owner.key = next; owner.stop();
    if (!active() || ui.prefersReducedMotion()) owner.value.setValue(1); else if (paused()) { owner.value.setValue(0); owner.transition(MotionState.Paused); } else owner.run(duration(), repeat, delay(), springing);
  };
  componentEffect(() => { const update = (): void => latest.current(); owner.value.addListener((v: number) => ui.repaint()); update(); ui.addWatcher(update); return () => { ui.removeWatcher(update); owner.dispose(); }; }, []);
  return owner.value;
}
export interface RollingCounterProps { value: number; prefix?: string; suffix?: string; decimals?: i32; grouping?: boolean; animate?: boolean; size?: number; className?: string }
export function RollingCounter(p: RollingCounterProps): i32 {
  const text = (): string => counterText(p.value, p.decimals ?? 0, p.grouping !== false);
  const previous = componentRef(text()), target = componentRef(text()), direction = componentRef(1);
  const progress = useMotion(() => text(), () => p.animate !== false, () => 260, false, () => 0, true);
  const read = (): string => { const value = text(); if (target.current !== value) { previous.current = target.current; direction.current = p.value >= Number(previous.current.replaceAll(',', '')) ? 1 : -1; target.current = value; } return value; };
  const node = <View role="status" aria-label={(p.prefix ?? '') + text() + (p.suffix ?? '')} className={`flex-row items-center gap-1 ${p.className ?? ''}`}><Text className={textClass()}>{p.prefix ?? ''}</Text>
    <Canvas style={{ width: Math.max(1, textWidth(font('sans', p.size ?? 28), text(), 0)), height: (p.size ?? 28) * 1.4, lazy: 1 }} onDraw={(x: i32, y: i32, w: i32, h: i32) => {
      const value = read(), old = previous.current.padStart(value.length, ' ').slice(-value.length), f = font('sans', p.size ?? 28), t = progress.get(); let left = x;
      for (let i = 0; i < value.length; i++) { const digit = value[i], width = textWidth(f, digit, 0), changed = old[i] !== digit && digit >= '0' && digit <= '9'; if (changed && t < 1) drawText(f, left, y - t * h * direction.current, old[i], themeColor('foreground'), 255, 0); drawText(f, left, y + (changed ? (1 - t) * h * direction.current : 0), digit, themeColor('foreground'), 255, 0); left += width; }
    }}/><Text className={textClass()}>{p.suffix ?? ''}</Text></View>;
  return node;
}
export interface TickerItem { label: string; value: string; delta?: number; lowerIsBetter?: boolean }
export interface TickerProps { items: TickerItem[]; active?: boolean; speed?: number; height?: number; className?: string }
export function Ticker(p: TickerProps): i32 {
  const root = createNodeRef(), [paused, setPaused] = componentSignal(false);
  const motion = useMotion(() => p.items.slice(0, 256).map((item: TickerItem) => item.label + item.value).join('|'), () => p.active === true, () => Math.max(1000, Math.min(256, p.items.length) * 150 / clampExtended(p.speed ?? 40, 5, 300) * 1000), true, () => 0, false, paused);
  const node = <Button role="group" aria-label="Live ticker. Hold focus or hover to pause." className={`${surface('overflow-hidden relative w-full')} ${focus()} ${p.className ?? ''}`} style={{ minHeight: p.height ?? 42 }} onPointerEnter={(e: ui.PointerEvent) => setPaused(true)} onPointerLeave={(e: ui.PointerEvent) => { if (!ui.hasFocusWithin(root.node)) setPaused(false); }} ref={root}>
    <Show when={p.active === true && !ui.prefersReducedMotion()} fallback={<View className="flex-row flex-wrap gap-x-5 gap-y-2 p-3 w-full">{p.items.slice(0,256).map((item:TickerItem)=><View className="flex-col gap-1"><Text className={textClass()}>{item.label+'  '+item.value}</Text><Text className={`text-[11px] text-${item.delta===undefined||item.delta===0?theme().mutedForeground:(item.lowerIsBetter===true?(item.delta??0)<0:(item.delta??0)>0)?theme().success:theme().destructive}`}>{item.delta===undefined?'':((item.delta??0)>0?'+':'')+item.delta+'%'}</Text></View>)}</View>}>
    <Canvas style={{ height:p.height??42,lazy: 1 }} className="w-full pointer-events-none" onDraw={(x: i32, y: i32, w: i32, h: i32) => {
      const items = p.items.slice(0, 256), f = font('sans', 13), span = Math.max(w, items.length * 150), offset = p.active === true && !ui.prefersReducedMotion() ? motion.get() * span : 0;
      for (let copy = 0; copy < (p.active === true && !ui.prefersReducedMotion() ? 2 : 1); copy++) for (let i = 0; i < items.length; i++) { const item = items[i], left = x + i * 150 - offset + copy * span; if (left + 150 < x || left > x + w) continue; drawText(f, left + 12, y + 5, item.label + '  ' + item.value, themeColor('foreground'), 255, 0); if (item.delta !== undefined) { const delta = item.delta ?? 0, good = item.lowerIsBetter === true ? delta < 0 : delta > 0; drawText(font('sans', 11), left + 12, y + 23, (delta > 0 ? '+' : '') + delta + '%', delta === 0 ? themeColor('mutedForeground') : good ? themeColor('success') : themeColor('destructive'), 255, 0); } }
    }}/>
    </Show>
  </Button>;
  componentEffect(() => ui.onFocusWithin(root.node, (visible: boolean) => { const node=ui.inspectNode(root.node); setPaused(ui.hasFocusWithin(root.node) || node !== null && node.hovered); }), []);
  return node;
}

export interface StackCard { id: string; title: string; description?: string }
export interface CardStackProps { cards: StackCard[]; index: () => i32; onChange: (index: i32, direction: string) => void; visible?: number; height?: number; onOpen?: (id: string) => void; className?: string }
export function CardStack(p: CardStackProps): i32 {
  const [drag, setDrag] = componentSignal(0), width = componentRef(1);
  const index = (): i32 => Math.floor(clampExtended(p.index(), 0, Math.max(0, p.cards.length - 1)));
  const advance = (direction: string): void => { setDrag(0); if (p.cards.length > 1) p.onChange((index() + (direction === 'left' ? 1 : p.cards.length - 1)) % p.cards.length, direction); };
  const progress = useMotion(() => String(index()), () => true, () => 220, false, () => 0, true);
  return <View className={`flex-col gap-3 ${p.className ?? ''}`}>
    <Button aria-label="Card stack. Arrow keys browse cards, Enter opens the front card." className={`relative w-full overflow-hidden ${focus()}`} style={{ height: p.height ?? 180 }} dragThreshold={4}
      onClick={() => { if (p.onOpen !== undefined && p.cards.length > 0) p.onOpen(p.cards[index()].id); }}
      onKeyDown={(e: ui.KeyEvent) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { advance(e.key === 'ArrowLeft' ? 'left' : 'right'); e.preventDefault(); } }}
      onDrag={(e: ui.PointerEvent) => { if (e.phase < 2) setDrag(e.dx); if (e.phase >= 2) { if (e.phase === 2 && Math.abs(e.dx) > width.current * 0.2) advance(e.dx < 0 ? 'left' : 'right'); else setDrag(0); } }} onPointerCancel={(e: ui.PointerEvent) => { setDrag(0); }}>
      <Canvas className="absolute inset-0 pointer-events-none" style={{ lazy: 1 }} onDraw={(x: i32, y: i32, w: i32, h: i32) => {
        width.current = w; const count = Math.min(p.cards.length, Math.floor(clampExtended(p.visible ?? 3, 1, 6)));
        for (let depth = count - 1; depth >= 0; depth--) {
          const card = p.cards[(index() + depth) % p.cards.length], dx = depth === 0 ? drag() : 0, inset = depth * 8, top = depth * 7 + (depth === 0 ? (1 - progress.get()) * 8 : 0);
          rrect(x + inset + dx, y + top, w - inset * 2, h - count * 7, 10, themeColor(depth === 0 ? 'card' : 'muted'), 255);
          border(x + inset + dx, y + top, w - inset * 2, h - count * 7, 10, 1, themeColor('border'), 255);
          if (depth === 0) { drawText(font('sans', 17), x + 20 + dx, y + 24 + top, card.title, themeColor('foreground'), 255, 0); drawText(font('sans', 13), x + 20 + dx, y + 55 + top, (card.description ?? '').slice(0, 300), themeColor('mutedForeground'), 255, 0); }
        }
      }}/>
    </Button><View className="flex-row items-center gap-2"><Action label="Previous card" variant="outline" size="sm" disabled={p.cards.length < 2} onClick={() => advance('right')}/><Text role="status" className={textClass()}>{p.cards.length === 0 ? 'No cards' : (index() + 1) + ' / ' + p.cards.length}</Text><Action label="Next card" variant="outline" size="sm" disabled={p.cards.length < 2} onClick={() => advance('left')}/></View>
  </View>;
}
export interface ShimmerTextProps { text: string; active?: boolean; duration?: number; delay?: number; size?: number; className?: string }
export function ShimmerText(p: ShimmerTextProps): i32 {
  const value = useMotion(() => p.text, () => p.active === true, () => p.duration ?? 1800, true, () => p.delay ?? 0);
  return <View role="status" aria-label={p.text} className={`overflow-hidden ${p.className ?? ''}`}>
    <Canvas style={{ width: Math.max(1, textWidth(font('sans', p.size ?? 20), p.text.slice(0, 4096), 0)), height: (p.size ?? 20) * 1.4, lazy: 1 }} onDraw={(x: i32, y: i32, w: i32, h: i32) => {
      const text = p.text.slice(0, 4096), f = font('sans', p.size ?? 20);
      drawText(f, x, y, text, themeColor('mutedForeground'), 255, 0);
      if (p.active === true && !ui.prefersReducedMotion()) { const band = Math.max(20, w / 5); clip(x - band + value.get() * (w + band), y, band, h); drawText(f, x, y, text, themeColor('foreground'), 255, 0); unclip(); }
    }}/>
  </View>;
}
export interface TypewriterProps { text: string; active?: boolean; speed?: number; caret?: boolean; onDone?: () => void; className?: string }
export function Typewriter(p: TypewriterProps): i32 {
  const layout = createNodeRef(), full = (): string => p.text.slice(0, 16384), previous = componentRef(full()), start = componentRef<i32>(0), shown = componentRef<i32>(0), completed = componentRef('');
  const motion = useMotion(() => { const next = full(); if (previous.current !== next) { start.current = next.startsWith(previous.current) ? shown.current : 0; previous.current = next; } return next; }, () => p.active === true, () => Math.max(40, (full().length - start.current) / (clampExtended(p.speed ?? 40, 1, 1000) * Math.max(1, (full().length - start.current) / 120)) * 1000));
  componentEffect(() => { const done = (): void => { if (motion.get() >= 1 && completed.current !== full()) { completed.current = full(); if (p.onDone !== undefined) p.onDone(); } }; ui.addWatcher(done); return () => ui.removeWatcher(done); });
  return <View role="status" aria-label={full()} className={`relative ${p.className ?? ''}`}><Text ref={layout} aria-hidden="true" className={`${textClass()} opacity-0`}>{full()}</Text>
    <Canvas className="absolute inset-0 pointer-events-none" style={{ lazy: 1 }} onDraw={(x:i32,y:i32,w:i32,h:i32) => {
      const text = full(), lines = ui.textLines(layout.node), face = ui.textFont(layout.node), lineHeight = h / Math.max(1, lines.length);
      let visible = Math.floor(start.current + (text.length - start.current) * motion.get());
      if (visible > 0 && visible < text.length && text.charCodeAt(visible - 1) >= 0xd800 && text.charCodeAt(visible - 1) <= 0xdbff) visible--;
      shown.current = visible; let offset = 0;
      for (let i = 0; i < Math.min(512, lines.length); i++) {
        const line = lines[i], at = text.indexOf(line, offset), begin = at < 0 ? offset : at, count = Math.floor(clampExtended(visible - begin, 0, line.length));
        const width = textWidth(face, line.slice(0, count), 0);
        if (count > 0) { clip(x, y + i * lineHeight, width, lineHeight); drawText(face, x, y + i * lineHeight, line, themeColor('foreground'), 255, 0); unclip(); }
        if (p.caret !== false && p.active === true && visible < text.length && visible >= begin && visible <= begin + line.length) rect(x + width, y + i * lineHeight + 1, 1, Math.max(1, lineHeight - 3), themeColor('accent'));
        offset = begin + line.length;
      }
    }}/>
  </View>;
}
export interface WordRevealProps { text: string; active?: boolean; stagger?: number; className?: string }
export function WordReveal(p: WordRevealProps): i32 {
  const root=createNodeRef(), words=p.text.slice(0,16384).split(' ').slice(0,1024);
  const progress = useMotion(() => p.text, () => p.active === true, () => words.length * clampExtended(p.stagger ?? 65, 10, 1000) + 180);
  const latest=componentRef(()=>{});
  latest.current=():void=>{
    const pending:i32[]=[root.node];let index=0,visited=0;
    while(pending.length>0&&visited<4096){const h=pending.shift() as i32;visited++;const node=ui.inspectNode(h);if(node===null)continue;
      if(node.tag===ui.TEXT){const t=clampExtended(progress.get()*(words.length+3)-index);ui.setNumber(h,'opacity',t);ui.setNumber(h,'translateY',(1-t)*6);index++;}
      else for(const child of node.children)pending.push(child);
    }
  };
  const node=<View ref={root} role="status" aria-label={p.text} className={`flex-row flex-wrap gap-x-1 gap-y-1 ${p.className ?? ''}`}>
    {words.map((word:string)=><Text aria-hidden="true" className={textClass()}>{word}</Text>)}
  </View>;
  // The Value owns these style writes and removes all listeners when this component unmounts.
  componentEffect(()=>{progress.addListener((value:number)=>latest.current());latest.current();return undefined;},[]);
  return node;
}

export interface SpotlightCardProps { title: string; description?: string; active?: boolean; beam?: boolean; onClick?: () => void; children?: () => i32; className?: string }
export function SpotlightCard(p: SpotlightCardProps): i32 {
  const [position, setPosition] = componentSignal<number[]>([-1, -1]);
  return <Button aria-label={p.title} onClick={() => { if (p.onClick !== undefined) p.onClick(); }} className={`${surface('relative overflow-hidden flex-col items-start p-5 gap-2')} ${focus()} ${p.className ?? ''}`} onPointerMove={(e: ui.PointerEvent) => { if (p.active === true && !ui.prefersReducedMotion()) setPosition([e.x, e.y]); }} onPointerLeave={(e: ui.PointerEvent) => setPosition([-1, -1])}>
    <Canvas className="absolute inset-0 pointer-events-none" style={{ lazy: 1 }} onDraw={(x: i32, y: i32, w: i32, h: i32) => { const point = position(); if (p.active !== true || ui.prefersReducedMotion() || point[0] < 0) return; const radius = p.beam === true ? 80 : 45; for (let ring = 12; ring > 0; ring--) { const r = radius * ring / 12; rrect(x + point[0] - r, y + point[1] - r, r * 2, r * 2, r, themeColor('accent'), 2); } }}/>
    <Text className={`text-[17px] font-medium text-${theme().foreground}`}>{p.title}</Text><Text className={`text-[13px] text-${theme().mutedForeground}`}>{p.description ?? ''}</Text>{renderSlot(p.children)}
  </Button>;
}
export interface LoaderProps { active: () => boolean; style?: string; size?: number; label?: string; className?: string }
export function Loader(p: LoaderProps): i32 {
  const phase = useMotion(() => p.style ?? 'dots', () => p.active() && p.style !== 'orbit', () => 1000, true), style = (): string => p.style ?? 'dots';
  return <View role="status" aria-label={p.active() ? p.label ?? 'Loading' : 'Idle'} className={p.className ?? ''}>
    <Show when={style() === 'orbit'} fallback={<Canvas style={{ width: p.size ?? 36, height: p.size ?? 36, lazy: 1 }} onDraw={(x: i32, y: i32, w: i32, h: i32) => {
      const t = p.active() && !ui.prefersReducedMotion() ? phase.get() : 1;
      if (style() === 'pulse') { const size = w * (0.45 + 0.4 * (1 - Math.abs(t * 2 - 1))); rrect(x + (w - size) / 2, y + (h - size) / 2, size, size, size / 2, themeColor('foreground'), 200); return; }
      const count = style() === 'grid' ? 9 : 3;
      for (let i = 0; i < count; i++) { const wave = 0.3 + 0.7 * (1 + Math.sin(t * Math.PI * 2 - i * 0.9)) / 2, side = w / 5, left = x + (style() === 'grid' ? i % 3 : i) * w / 3, top = style() === 'grid' ? y + Math.floor(i / 3) * h / 3 : y + h / 2 - side / 2; const bh = style() === 'bars' ? h * wave : side; rrect(left, style() === 'bars' ? y + (h - bh) / 2 : top, side, bh, style() === 'dots' ? side / 2 : 2, themeColor('foreground'), p.active() && !ui.prefersReducedMotion() ? 80 + wave * 175 : 180); }
    }}/>}><Show when={p.active()} fallback={<ProgressRing value={()=>75} size={p.size ?? 24} showValue={false}/>}><Spinner active={p.active} size={p.size ?? 24} label={p.label ?? 'Loading'}/></Show></Show>
  </View>;
}
export interface WaveformProps { peaks: number[]; position: () => number; onSeek?: (position: number) => void; height?: number; label?: string; disabled?: boolean; className?: string }
export function Waveform(p: WaveformProps): i32 {
  const width = componentRef(1), [hover, setHover] = componentSignal(-1);
  const seek = (value: number): void => { if (p.disabled !== true && p.onSeek !== undefined) p.onSeek(clampExtended(value)); };
  return <Button role={p.onSeek === undefined ? 'img' : 'slider'} aria-label={p.label ?? 'Audio position'} aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(clampExtended(p.position()) * 100)} aria-valuetext={Math.round(clampExtended(p.position()) * 100) + '%'} disabled={p.disabled === true} className={`relative w-full overflow-hidden rounded ${focus()} ${p.className ?? ''}`} style={{ height: p.height ?? 54 }} dragThreshold={1}
    onPointerDown={(e: ui.PointerEvent) => { if (e.button === 0) seek(e.x / width.current); }} onDrag={(e: ui.PointerEvent) => { if (e.phase < 3) seek(e.x / width.current); }}
    onPointerMove={(e: ui.PointerEvent) => setHover(clampExtended(e.x / width.current))} onPointerLeave={(e: ui.PointerEvent) => setHover(-1)}
    onKeyDown={(e: ui.KeyEvent) => { if (['Home', 'End', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'].indexOf(e.key) >= 0 && p.onSeek !== undefined) { seek(seekKey(e.key, p.position(), e.shift ? 0.1 : 0.01)); e.preventDefault(); } }}>
    <Canvas className="absolute inset-0 pointer-events-none" style={{ lazy: 1 }} onDraw={(x: i32, y: i32, w: i32, h: i32) => {
      width.current = w; const peaks = waveformPeaks(p.peaks, Math.floor(w / 4)), position = clampExtended(p.position());
      for (let i = 0; i < peaks.length; i++) { const height = Math.max(2, peaks[i] * (h - 4)); rrect(x + i * 4, y + (h - height) / 2, 2, height, 1, themeColor(i / peaks.length <= position ? 'foreground' : 'border'), 255); }
      if (hover() >= 0 && p.onSeek !== undefined) rect(x + hover() * w, y, 1, h, themeColor('accent'));
    }}/>
  </Button>;
}
export interface NowPlayingProps {
  title: string; artist?: string; artwork?: i32; peaks?: number[]; playing: () => boolean; position: () => number; duration: number;
  onPlay: (playing: boolean) => void; onSeek: (seconds: number) => void; onPrevious?: () => void; onNext?: () => void; compact?: boolean; countdown?: boolean; className?: string;
}
export function NowPlaying(p: NowPlayingProps): i32 {
  useImages(()=>[p.artwork??-1]);
  return <View className={`${surface('flex-col gap-3 p-4')} ${p.className ?? ''}`}><View className="flex-row items-center gap-3 min-w-0"><Avatar name={p.title} image={p.artwork} size={p.compact === true ? 36 : 52}/><View className="flex-col grow shrink min-w-0 gap-1"><Text className={`text-[15px] font-medium text-${theme().foreground}`}>{p.title}</Text><Text className={`text-[12px] text-${theme().mutedForeground}`}>{p.artist ?? ''}</Text></View></View>
    <Waveform peaks={p.peaks ?? []} position={() => p.duration > 0 ? p.position() / p.duration : 0} onSeek={(position: number) => p.onSeek(position * Math.max(0, p.duration))} disabled={p.duration <= 0} height={p.compact === true ? 28 : 48} label={'Position in ' + p.title}/>
    <View className="flex-row flex-wrap items-center justify-between gap-2"><Text className={`text-[12px] tabular-nums text-${theme().mutedForeground}`}>{mediaTime(p.position())} / {p.countdown === true ? '-' + mediaTime(p.duration - p.position()) : mediaTime(p.duration)}</Text><View className="flex-row gap-1"><Show when={p.onPrevious !== undefined}><Action label="Previous" variant="ghost" size="sm" onClick={() => { if (p.onPrevious !== undefined) p.onPrevious(); }}/></Show><Action label={p.playing() ? 'Pause' : 'Play'} size="sm" onClick={() => p.onPlay(!p.playing())}/><Show when={p.onNext !== undefined}><Action label="Next" variant="ghost" size="sm" onClick={() => { if (p.onNext !== undefined) p.onNext(); }}/></Show></View></View>
  </View>;
}
