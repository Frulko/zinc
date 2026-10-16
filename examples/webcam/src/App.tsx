// The screen, in the React model: the permission screens, then the live preview with the shutter and the photo strip, the side panel
// (camera, adjustments, format) and the photo viewer. The state lives in session.ts; this file only draws it and forwards the presses.
import { useState, useEffect } from 'zinc:ui/react';
import { currentScheme } from 'zinc:ui';
import { drawImage, drawImageRect, rect, rrect, drawText, font, textWidth, frame, imageWidth, imageHeight } from 'zinc:gfx';
import { CameraDevice } from 'zinc:camera';
import { Icon } from 'zinc:icons';
import { session, Photo, SIZES, RATES } from './session';

const ink = (): i32 => currentScheme() === 'dark' ? 0xE4E4E7 : 0x27272A;
const white = (): i32 => 0xFFFFFF;
const HUD = font('sans', 13);
function renderKids(c: (() => i32) | undefined): i32 { return c !== undefined ? c() : <View />; }

// ---------------------------------------------------------------- the preview canvas (drawn every frame, no re-render)
function drawPreview(x: i32, y: i32, w: i32, h: i32): void {
  const cam = session.cam;
  rect(x, y, w, h, 0x09090B);
  if (cam === null || cam.image < 0) return;
  const iw = cam.width, ih = cam.height;
  if (session.cover) {   // fills the box, the overflow cropped evenly
    const s = Math.max(w / iw, h / ih), sw = w / s, sh = h / s;
    drawImageRect(cam.image as i32, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h, 255, 0);
  } else {               // fits in the box, bars around
    const s = Math.min(w / iw, h / ih), dw = iw * s, dh = ih * s;
    drawImage(cam.image as i32, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh, 255, 0);
  }
  const d = session.device;
  const hud = `${iw}×${ih}  ·  ${session.fps} fps  ·  #${cam.frameIndex}  ·  ${d !== null ? d.name : ''}`;
  rrect(x + 12, y + 12, textWidth(HUD, hud, 0) + 24, 28, 14, 0x000000, 150);
  drawText(HUD, x + 24, y + 19, hud, 0xFFFFFF, 235, 0);
  const since = frame() - session.shotFrame;   // the shutter's flash: white, fading out over 15 frames
  if (since >= 0 && since < 15) rrect(x, y, w, h, 0, 0xFFFFFF, Math.round(230 * (1 - since / 15)));
}
function drawPhoto(p: Photo, x: i32, y: i32, w: i32, h: i32, cover: boolean): void {
  if (p.image < 0) return;
  const iw = imageWidth(p.image), ih = imageHeight(p.image);
  const s = cover ? Math.max(w / iw, h / ih) : Math.min(w / iw, h / ih);
  if (cover) { const sw = w / s, sh = h / s; drawImageRect(p.image, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h, 255, 0); }
  else { const dw = iw * s, dh = ih * s; drawImage(p.image, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh, 255, 0); }
}

// ---------------------------------------------------------------- small parts
/** A button with a visible pressed state (active:), light and dark. */
function Btn(p: { label: string; icon: string; onPress: () => void; primary?: boolean }) {
  const primary = p.primary ?? false;
  return <View className={primary
      ? 'flex-row items-center gap-2 px-4 py-2 rounded-xl bg-orange-600 active:bg-orange-800'
      : 'flex-row items-center gap-2 px-4 py-2 rounded-xl bg-zinc-200 active:bg-zinc-400 dark:bg-zinc-800 dark:active:bg-zinc-600'}
    onPress={p.onPress} aria-label={p.label}>
    <Icon name={p.icon} size={18} color={primary ? white : ink} />
    <Text className={primary ? 'text-sm font-semibold text-white' : 'text-sm font-semibold text-zinc-800 dark:text-zinc-100'}>{p.label}</Text>
  </View>;
}
function Seg(p: { options: string[]; value: number; onChange: (i: number) => void }) {
  return <View className="flex-row p-1 gap-1 rounded-xl bg-zinc-200 dark:bg-zinc-800">
    {p.options.map((o: string, i: number) => <View className={i === p.value
        ? 'flex-1 items-center py-1.5 rounded-lg bg-white dark:bg-zinc-600 active:bg-zinc-300'
        : 'flex-1 items-center py-1.5 rounded-lg active:bg-zinc-300 dark:active:bg-zinc-700'} onPress={() => p.onChange(i)} aria-label={o}>
      <Text className={i === p.value ? 'text-xs font-semibold text-zinc-900 dark:text-white' : 'text-xs text-zinc-500 dark:text-zinc-400'}>{o}</Text>
    </View>)}
  </View>;
}
/** − value + with a bar under it showing where the value sits between min and max. */
function Step(p: { label: string; icon: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  const at = (p.value - p.min) / (p.max - p.min);
  return <View className="gap-1.5">
    <View className="flex-row items-center gap-2">
      <Icon name={p.icon} size={16} color={ink} />
      <Text className="flex-1 text-sm text-zinc-700 dark:text-zinc-200">{p.label}</Text>
      <View className="w-8 h-8 items-center justify-center rounded-lg bg-zinc-200 active:bg-zinc-400 dark:bg-zinc-800 dark:active:bg-zinc-600"
        onPress={() => p.onChange(p.value - 0.1)} aria-label={`${p.label} down`}><Text className="text-base font-semibold text-zinc-800 dark:text-zinc-100">−</Text></View>
      <Text className="w-10 text-center text-sm font-semibold text-zinc-900 dark:text-white">{p.value.toFixed(1)}</Text>
      <View className="w-8 h-8 items-center justify-center rounded-lg bg-zinc-200 active:bg-zinc-400 dark:bg-zinc-800 dark:active:bg-zinc-600"
        onPress={() => p.onChange(p.value + 0.1)} aria-label={`${p.label} up`}><Text className="text-base font-semibold text-zinc-800 dark:text-zinc-100">+</Text></View>
    </View>
    <View className="h-1 rounded-full bg-zinc-200 dark:bg-zinc-800"><View className="h-1 rounded-full bg-orange-500" style={{ width: `${Math.round(at * 100)}%` }} /></View>
  </View>;
}
function Section(p: { title: string; children?: () => i32 }) {
  return <View className="gap-2.5">
    <Text className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{p.title}</Text>
    <View className="gap-2.5">{renderKids(p.children)}</View>
  </View>;
}

// ---------------------------------------------------------------- screens
/** A centred card: the permission and error screens. */
function Notice(p: { icon: string; title: string; body: string; children?: () => i32 }) {
  return <View className="flex-1 items-center justify-center p-8 bg-zinc-100 dark:bg-zinc-950">
    <View className="w-[440px] max-w-full items-center gap-4 p-8 rounded-3xl bg-white dark:bg-zinc-900 shadow-lg">
      <View className="w-16 h-16 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-950"><Icon name={p.icon} size={30} color={() => 0xEA580C} /></View>
      <Text className="text-xl font-bold text-center text-zinc-900 dark:text-white">{p.title}</Text>
      <Text className="text-sm text-center text-zinc-600 dark:text-zinc-300">{p.body}</Text>
      {renderKids(p.children)}
    </View>
  </View>;
}

function Live() {
  const s = session, cam = s.cam, d = s.device;
  return <View className="flex-1 flex-row bg-zinc-100 dark:bg-zinc-950">
    <View className="flex-1 flex-col">
      <View className="flex-1 relative bg-zinc-950">
        <Canvas className="absolute inset-0" onDraw={drawPreview} />
        {s.stage === 'opening' && <View className="absolute inset-0 items-center justify-center"><Text className="text-sm text-zinc-300">Starting the camera…</Text></View>}
        {s.simulated && <View className="absolute left-3 bottom-3 flex-row items-center gap-2 px-3 py-1.5 rounded-full bg-black/60">
          <Icon name="info" size={14} color={white} />
          <Text className="text-xs text-white">Zinc Fake Camera: this is a simulated camera</Text>
        </View>}
      </View>
      <View className="h-24 flex-row items-center gap-4 px-4 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800">
        <View className="flex-1 flex-row items-center gap-2 overflow-hidden">
          {s.photos.length === 0 ? <Text className="text-xs text-zinc-500 dark:text-zinc-400">Photos you take appear here</Text>
            : <View className="flex-row gap-2">{s.photos.slice(0, 6).map((p: Photo, i: number) => <View className="w-[72px] h-[54px] rounded-lg overflow-hidden border-2 border-transparent active:border-orange-500"
              onPress={() => s.view(i)} aria-label={`Open ${p.name}`}>
              <Canvas className="flex-1" style={{ lazy: 1 }} onDraw={(x: i32, y: i32, w: i32, h: i32) => drawPhoto(p, x, y, w, h, true)} />
            </View>)}</View>}
        </View>
        <View className="w-16 h-16 items-center justify-center rounded-full border-4 border-zinc-300 dark:border-zinc-600 active:border-orange-400"
          onPress={shoot} aria-label="Take photo">
          <View className={s.stage === 'live' ? 'w-12 h-12 items-center justify-center rounded-full bg-orange-600 active:bg-orange-800' : 'w-12 h-12 rounded-full bg-zinc-300'}>
            <Icon name="camera" size={22} color={white} />
          </View>
        </View>
        <View className="flex-1 flex-row justify-end gap-2">
          <Btn label={s.cover ? 'Fill' : 'Fit'} icon={s.cover ? 'shrink' : 'expand'} onPress={() => s.toggleFit()} />
        </View>
      </View>
    </View>
    <View className="w-72 gap-6 p-5 bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800">
      <View className="flex-row items-center gap-2">
        <Icon name="aperture" size={20} color={() => 0xEA580C} />
        <Text className="text-lg font-bold text-zinc-900 dark:text-white">Webcam</Text>
      </View>
      <Section title="Camera">
        {s.list.length > 1
          ? <View className="gap-1">{s.list.map((c: CameraDevice, i: number) => <View className={i === s.which
              ? 'flex-row items-center gap-2 px-3 py-2 rounded-lg bg-orange-50 dark:bg-orange-950 active:bg-orange-100'
              : 'flex-row items-center gap-2 px-3 py-2 rounded-lg active:bg-zinc-200 dark:active:bg-zinc-800'} onPress={() => s.open(i)} aria-label={c.name}>
            <Icon name="video" size={16} color={ink} />
            <Text className="flex-1 text-sm text-zinc-800 dark:text-zinc-100">{c.name}</Text>
            <Text className="text-xs text-zinc-500">{c.position === 'unknown' ? '' : c.position}</Text>
          </View>)}</View>
          : <Text className="text-sm text-zinc-800 dark:text-zinc-100">{d !== null ? d.name : '…'}</Text>}
        <Text className="text-xs text-zinc-500 dark:text-zinc-400">{cam !== null ? `${cam.width}×${cam.height} at ${cam.fps} fps` : ''}</Text>
      </Section>
      <Section title="Adjust">
        <View className="flex-row items-center gap-2">
          <Icon name="arrow-left-right" size={16} color={ink} />
          <Text className="flex-1 text-sm text-zinc-700 dark:text-zinc-200">Mirror</Text>
          <View className={s.mirror ? 'w-11 h-6 p-0.5 rounded-full bg-orange-600 items-end active:bg-orange-800' : 'w-11 h-6 p-0.5 rounded-full bg-zinc-300 dark:bg-zinc-700 items-start active:bg-zinc-400'}
            onPress={() => s.toggleMirror()} aria-label="Mirror"><View className="w-5 h-5 rounded-full bg-white" /></View>
        </View>
        <Step label="Brightness" icon="sun" value={s.brightness} min={-1} max={1} onChange={(v: number) => s.setBrightness(v)} />
        <Step label="Contrast" icon="contrast" value={s.contrast} min={0} max={2} onChange={(v: number) => s.setContrast(v)} />
        <View className="flex-row"><View className="px-2 py-1 rounded-md active:bg-zinc-200 dark:active:bg-zinc-800" onPress={() => s.resetAdjust()} aria-label="Reset">
          <Text className="text-xs font-semibold text-orange-600 dark:text-orange-400">Reset</Text></View></View>
      </Section>
      <Section title="Format">
        <Seg options={SIZES.map((z: number[]) => `${z[0]}×${z[1]}`)} value={s.size} onChange={(i: number) => s.setSize(i)} />
        <Seg options={RATES.map((r: number) => `${r} fps`)} value={s.rate} onChange={(i: number) => s.setRate(i)} />
      </Section>
      <View className="flex-1" />
      <Text className="text-xs text-zinc-500 dark:text-zinc-400">Space photo · M mirror · C camera · F fit · Esc close</Text>
    </View>
    {s.viewing >= 0 && s.viewing < s.photos.length && <Viewer />}
  </View>;
}
function Viewer() {
  const s = session, i = s.viewing, p = s.photos[i];
  return <View className="absolute inset-0 flex-col bg-black/90">
    <View className="h-14 flex-row items-center gap-3 px-4">
      <Text className="flex-1 text-sm font-semibold text-white">{`${p.name}.png  ·  ${i + 1} of ${s.photos.length}`}</Text>
      <Btn label="Delete" icon="trash" onPress={() => s.deletePhoto(i)} />
      <Btn label="Close" icon="x" onPress={() => s.view(-1)} />
    </View>
    <View className="flex-1 flex-row items-center">
      <View className="w-12 h-12 mx-2 items-center justify-center rounded-full active:bg-white/20" onPress={() => s.browse(-1)} aria-label="Previous"><Icon name="chevron-left" size={28} color={white} /></View>
      <Canvas className="flex-1 self-stretch" onDraw={(x: i32, y: i32, w: i32, h: i32) => drawPhoto(p, x, y, w, h, false)} />
      <View className="w-12 h-12 mx-2 items-center justify-center rounded-full active:bg-white/20" onPress={() => s.browse(1)} aria-label="Next"><Icon name="chevron-right" size={28} color={white} /></View>
    </View>
    <View className="h-6" />
  </View>;
}

/** The shutter (button and Space). */
export function shoot(): void { session.takePhoto(); }

export default function App() {
  const [, setVersion] = useState<number>(0);
  useEffect((): void => {
    let v = 0;
    session.onChange((): void => { v++; setVersion(v); });
    session.start();
  }, []);
  const s = session;
  if (s.stage === 'undetermined' || s.stage === 'asking') return <Notice icon="camera" title="Allow the camera"
    body={s.stage === 'asking' ? 'Waiting for your answer in the system dialog…'
      : 'Webcam shows your camera live and saves the photos you take on this computer. Your system will ask once whether this app may use the camera.'}>
    {s.stage === 'undetermined' ? <Btn label="Allow camera" icon="camera" primary={true} onPress={() => s.allow()} /> : <View />}
  </Notice>;
  if (s.stage === 'denied') return <Notice icon="camera-off" title="Camera access is off"
    body="Webcam may not use the camera. Turn it on for the app that started Webcam (Terminal, iTerm or your editor when you use zinc run):">
    <View className="px-4 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-800">
      <Text className="text-sm font-semibold text-zinc-900 dark:text-white">System Settings › Privacy & Security › Camera</Text>
    </View>
    <Text className="text-xs text-center text-zinc-500 dark:text-zinc-400">macOS may ask you to quit and reopen that app. Then press Retry.</Text>
    <Btn label="Retry" icon="rotate-ccw" primary={true} onPress={() => s.retry()} />
  </Notice>;
  if (s.stage === 'none') return <Notice icon="camera-off" title="No camera found"
    body="Plug in a webcam and press Retry, or run with ZINC_FAKE_CAMERA=1 for the simulated camera.">
    <Btn label="Retry" icon="rotate-ccw" primary={true} onPress={() => s.listCameras()} />
  </Notice>;
  if (s.stage === 'failed') return <Notice icon="shield-alert" title="The camera did not start" body={s.why}>
    <Btn label="Retry" icon="rotate-ccw" primary={true} onPress={() => s.listCameras()} />
  </Notice>;
  return <Live />;
}
