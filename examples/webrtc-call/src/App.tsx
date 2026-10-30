// The screen, in the React model: the call's stage (the other side's video with your preview in a corner, the stats overlay and the level
// meters, all drawn on a canvas every frame), the controls (microphone, camera, camera picker, speaker, stats, call and hang up) and a side
// panel (wide windows) or a strip under the stage (phone portrait). The state lives in call.ts; this file only draws it and forwards presses.
import { useState, useEffect } from 'zinc:ui/react';
import { currentScheme, setScheme } from 'zinc:ui';
import { drawImage, drawImageRect, rect, rrect, drawText, font, textWidth } from 'zinc:gfx';
import { CameraDevice } from 'zinc:camera';
import { Icon } from 'zinc:icons';
import { CallStats, Switch } from 'zinc:ui/kit';
import { call, Mode } from './call';

const ink = (): i32 => currentScheme() === 'dark' ? 0xE4E4E7 : 0x27272A;
const white = (): i32 => 0xFFFFFF;
const HUD = font('sans', 13), BIG = font('sans', 15);

// ---------------------------------------------------------------- the stage (drawn every frame, no re-render)
// An image fills the box, cropped evenly.
function cover(img: i32, iw: number, ih: number, x: i32, y: i32, w: i32, h: i32, radius: number): void {
  if (radius > 0) { const s = Math.min(w / iw, h / ih); drawImage(img, x + (w - iw * s) / 2, y + (h - ih * s) / 2, iw * s, ih * s, 255, radius); return; }
  const s = Math.max(w / iw, h / ih), sw = w / s, sh = h / s;
  drawImageRect(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h, 255, 0);
}
function meter(x: number, y: number, w: number, level: number, muted: boolean): void {
  rrect(x, y, w, 6, 3, 0x000000, 120);
  if (muted) return;
  const v = Math.min(1, level * 2.2);
  if (v > 0.01) rrect(x, y, w * v, 6, 3, v > 0.8 ? 0xEF4444 : v > 0.5 ? 0xF59E0B : 0x10B981, 255);
}
function drawStage(x: i32, y: i32, w: i32, h: i32): void {
  const c = call;
  rect(x, y, w, h, 0x09090B);
  const img = c.peerImage(), n = c.numbers;
  if (img >= 0 && c.peerWidth() > 0) cover(img as i32, c.peerWidth(), c.peerHeight(), x, y, w, h, 0);
  else if (c.stage === 'live' || c.stage === 'connecting') {
    const t = c.stage === 'live' ? 'Waiting for the first picture…' : 'Connecting…';
    drawText(BIG, x + (w - textWidth(BIG, t, 0)) / 2, y + h / 2 - 8, t, 0xA1A1AA, 255, 0);
  }
  // your preview, bottom right, with your microphone's meter
  const lv = c.localVideo, cam = c.sharing ? null : c.camera;   // the camera, or the shared screen's track
  if (lv !== null && c.stage !== 'idle') {
    const st = lv.getSettings(), img = cam !== null ? cam.image : lv.image;
    const pw = Math.round(Math.min(220, w * 0.3)), ph = Math.round(pw * 3 / 4), px = x + w - pw - 16, py = y + h - ph - 16;
    rrect(px - 2, py - 2, pw + 4, ph + 4, 12, 0xFFFFFF, 60);
    if (c.camOn && img >= 0) cover(img as i32, cam !== null ? cam.width : st.width, cam !== null ? cam.height : st.height, px, py, pw, ph, 10);
    else { rrect(px, py, pw, ph, 10, 0x27272A, 255); drawText(HUD, px + 12, py + 12, 'Camera off', 0xD4D4D8, 255, 0); }
    meter(px + 10, py + ph - 14, pw - 20, c.micLevel(), !c.micOn);
    if (!c.micOn) { rrect(px + 8, py + 8, 64, 22, 11, 0xDC2626, 230); drawText(HUD, px + 16, py + 11, 'Muted', 0xFFFFFF, 255, 0); }
  }
  // the overlay: the numbers of the call
  if (c.showStats && c.stage === 'live') {
    const lines = [
      `${n.codec === '' ? 'video' : n.codec} ${n.width}×${n.height} · ${n.fps} fps`,
      `out ${Math.round(n.sendKbps)} kbit/s · in ${Math.round(n.recvKbps)} kbit/s`,
      `RTT ${n.rttMs < 0 ? '--' : n.rttMs.toFixed(1) + ' ms'} · loss ${n.lossPct.toFixed(1)}%`,
      `audio ${n.audio === '' ? '--' : n.audio} · peer level`,
    ];
    let bw = 0;
    for (const l of lines) bw = Math.max(bw, textWidth(HUD, l, 0));
    rrect(x + 12, y + 12, bw + 24, lines.length * 20 + 24, 12, 0x000000, 160);
    for (let i = 0; i < lines.length; i++) drawText(HUD, x + 24, y + 22 + i * 20, lines[i], 0xFFFFFF, 235, 0);
    meter(x + 24, y + 22 + lines.length * 20, bw, c.peerLevel(), false);
  }
}

// ---------------------------------------------------------------- parts
/** A round control: a visible pressed state (active:), on or off, light and dark. */
function Round(p: { icon: string; label: string; on: boolean; onPress: () => void; danger?: boolean; go?: boolean }) {
  const cls = p.danger ?? false ? 'bg-red-600 active:bg-red-800' : p.go ?? false ? 'bg-emerald-600 active:bg-emerald-800'
    : p.on ? 'bg-zinc-200 active:bg-zinc-400 dark:bg-zinc-800 dark:active:bg-zinc-600' : 'bg-zinc-800 active:bg-zinc-950 dark:bg-zinc-200 dark:active:bg-zinc-400';
  const tint = (p.danger ?? false) || (p.go ?? false) ? white : p.on ? ink : (): i32 => currentScheme() === 'dark' ? 0x18181B : 0xFAFAFA;
  return <View className="w-14 items-center gap-1">
    <View className={`w-12 h-12 items-center justify-center rounded-full ${cls}`} onPress={p.onPress} aria-label={p.label}>
      <Icon name={p.icon} size={20} color={tint} />
    </View>
    <Text className="text-xs text-center text-zinc-600 dark:text-zinc-400">{p.label}</Text>
  </View>;
}
function Tab(p: { id: Mode; label: string }) {
  const on = call.mode === p.id;
  return <View className={on ? 'px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-700 active:bg-zinc-300' : 'px-3 py-1.5 rounded-lg active:bg-zinc-300 dark:active:bg-zinc-700'}
    onPress={() => call.setMode(p.id)} aria-label={p.label}>
    <Text className={on ? 'text-sm font-semibold text-zinc-900 dark:text-white' : 'text-sm text-zinc-500 dark:text-zinc-400'}>{p.label}</Text>
  </View>;
}
function Field(p: { label: string; value: string; onInput: (v: string) => void }) {
  return <View className="gap-1">
    <Text className="text-xs text-zinc-500 dark:text-zinc-400">{p.label}</Text>
    <Input className="py-1.5 h-9 px-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-white"
      value={p.value} onInput={p.onInput} />
  </View>;
}
function Cameras() {
  const c = call;
  if (c.cameras.length === 0) return <Text className="text-xs text-zinc-500 dark:text-zinc-400">The cameras appear when the call starts.</Text>;
  return <View className="gap-1">{c.cameras.map((d: CameraDevice, i: number) => <View className={i === c.which
      ? 'flex-row items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-950 active:bg-emerald-100'
      : 'flex-row items-center gap-2 px-3 py-2 rounded-lg active:bg-zinc-200 dark:active:bg-zinc-800'} onPress={() => { c.pickCamera(i); }} aria-label={d.name}>
    <Icon name="video" size={16} color={ink} />
    <Text className="flex-1 text-sm text-zinc-800 dark:text-zinc-100">{d.name}</Text>
  </View>)}</View>;
}
function status(): string {
  const c = call;
  if (c.why !== '') return c.why;
  if (c.stage === 'idle') return c.mode === 'local' ? 'Press Call: your camera and microphone go to an echo peer in this window and come back.' : `Press Call to join room "${c.room}".`;
  if (c.stage === 'asking') return 'Asking for the camera and the microphone…';
  if (c.stage === 'connecting') return 'Connecting…';
  if (c.stage === 'live') return c.mode === 'local' ? 'In a call with the echo peer (this window).' : `In a call in room "${c.room}".`;
  if (c.stage === 'ended') return 'Call ended.';
  return '';
}

export default function App() {
  const [, setVersion] = useState<number>(0);
  useEffect((): void => {
    let v = 0;
    call.onChange((): void => { v++; setVersion(v); });
  }, []);
  const c = call, inCall = c.stage === 'live' || c.stage === 'connecting' || c.stage === 'asking';
  const dark = currentScheme() === 'dark';
  return <View className="flex-1 flex-col bg-zinc-100 dark:bg-zinc-950">
    <View className="flex-row items-center gap-3 px-4 py-3 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
      <Icon name="video" size={20} color={() => 0x059669} />
      <Text className="text-lg font-bold text-zinc-900 dark:text-white">Call</Text>
      <View className="flex-row p-1 gap-1 rounded-xl bg-zinc-200 dark:bg-zinc-800">
        <Tab id="local" label="This window" />
        <Tab id="room" label="Room" />
      </View>
      <View className="flex-1" />
      <View className="w-9 h-9 items-center justify-center rounded-lg active:bg-zinc-200 dark:active:bg-zinc-800" onPress={() => { setScheme(dark ? 'light' : 'dark'); c.changed(); }}
        aria-label={dark ? 'Light' : 'Dark'}><Icon name={dark ? 'sun' : 'moon'} size={18} color={ink} /></View>
    </View>
    <View className="flex-1 flex-col md:flex-row">
      <View className="flex-1 flex-col">
        <View className="flex-1 relative bg-zinc-950">
          <Canvas className="absolute inset-0" onDraw={drawStage} />
          {(c.stage === 'idle' || c.stage === 'ended' || c.stage === 'denied' || c.stage === 'failed') && <View className="absolute inset-0 items-center justify-center p-6">
            <View className="max-w-[420px] items-center gap-3 p-6 rounded-2xl bg-zinc-900/80">
              <Icon name={c.stage === 'denied' || c.stage === 'failed' ? 'shield-alert' : 'phone'} size={28} color={white} />
              <Text className="text-sm text-center text-zinc-100">{status()}</Text>
            </View>
          </View>}
        </View>
        <View className="flex-row flex-wrap items-start justify-center gap-1 md:gap-4 px-2 md:px-4 py-3 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800">
          <Round icon={c.micOn ? 'mic' : 'mic-off'} label={c.micOn ? 'Mute' : 'Unmute'} on={c.micOn} onPress={() => c.toggleMic()} />
          <Round icon={c.camOn ? 'video' : 'video-off'} label={c.camOn ? 'Stop video' : 'Start video'} on={c.camOn} onPress={() => c.toggleCamera()} />
          <Round icon="switch-camera" label="Camera" on={true} onPress={() => { if (c.cameras.length > 0) c.pickCamera((c.which + 1) % c.cameras.length); }} />
          <Round icon={c.sharing ? 'screen-share-off' : 'screen-share'} label={c.sharing ? 'Stop sharing' : 'Share screen'} on={!c.sharing} onPress={() => { c.toggleShare(); }} />
          <Round icon={c.speakerOn ? 'volume-2' : 'volume-x'} label={c.speakerOn ? 'Speaker' : 'Speaker off'} on={c.speakerOn} onPress={() => c.toggleSpeaker()} />
          <Round icon="activity" label="Stats" on={c.showStats} onPress={() => c.toggleStats()} />
          {inCall ? <Round icon="phone-off" label="Hang up" on={true} danger={true} onPress={() => c.hangUp()} />
            : <Round icon="phone" label="Call" on={true} go={true} onPress={() => { c.start(); }} />}
        </View>
      </View>
      <View className="md:w-72 gap-5 p-4 bg-white dark:bg-zinc-900 border-t md:border-t-0 md:border-l border-zinc-200 dark:border-zinc-800">
        <Text className="text-sm text-zinc-700 dark:text-zinc-300">{status()}</Text>
        {c.stage === 'live' && c.showStats && <CallStats sample={() => c.quality.last} history={() => c.quality.history}>
          <View className="gap-2 pt-1">
            <Text className="text-xs text-zinc-500 dark:text-zinc-400">{`${c.numbers.codec === '' ? 'video' : c.numbers.codec} · ${c.numbers.audio === '' ? 'audio' : c.numbers.audio} ${Math.round(c.numbers.audioKbps)} kbit/s`}</Text>
            <Switch checked={() => c.lowData} onChange={(_on: boolean) => { c.toggleLowData(); }} label="Ultra low data" />
            <Switch checked={() => c.autoLowData} onChange={(on: boolean) => { c.autoLowData = on; c.changed(); }} label="Switch on when poor" />
          </View>
        </CallStats>}
        {c.mode === 'room' && <View className="gap-2">
          <Field label="Signalling server" value={c.server} onInput={(v: string) => { c.server = v; }} />
          <Field label="Room" value={c.room} onInput={(v: string) => { c.room = v; }} />
        </View>}
        <View className="gap-2">
          <Text className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Camera</Text>
          <Cameras />
        </View>
        <Text className="text-xs text-zinc-500 dark:text-zinc-400">{c.speakerOn ? 'Use a headset: there is no echo cancellation.' : 'The speaker is off: in this window your own voice would come back.'}</Text>
      </View>
    </View>
  </View>;
}
