// Camera: ask for the permission, list the cameras, open one, show its live preview, switch between front and back, take photos (a flash and a
// strip of thumbnails). camera.ts gives zinc:camera's API, over a simulated camera until the plugin is in the tree; the screen does not change.
import { useState, useRef, useEffect } from 'zinc:ui/react';
import { View, Text, Pressable, StyleSheet } from 'zinc:react-native';
import * as Animated from 'zinc:ui/animated';
import { useAnimated } from 'zinc:react-native';
import { Icon } from 'zinc:icons';
import { theme, SP, R_CARD } from '../theme';
import { tr } from '../i18n';
import { Screen, Section, ActionButton, Badge, EmptyState, s as k } from '../parts';
import { Segmented } from '../controls';
import { devices, requestPermission, Camera, CameraDevice } from '../camera';
import { drawPreview } from '../camera-view';
import { onLeave, trace } from '../nav';
import { picture } from '../art';

class Shot { frame: number; back: boolean; constructor(frame: number, back: boolean) { this.frame = frame; this.back = back; } }
const flash = new Animated.Value(0);

export function CameraScreen() {
  const c = theme();
  const [state, setState] = useState('asking');   // asking, denied, none, opening, live, failed
  const [list, setList] = useState<CameraDevice[]>([]);
  const [which, setWhich] = useState(0);
  const [shots, setShots] = useState<Shot[]>([]);
  const [why, setWhy] = useState('');
  const cam = useRef<Camera | null>(null);
  const started = useRef<boolean>(false);
  const f = useAnimated(flash);
  const open = (all: CameraDevice[], i: number): void => {
    const old = cam.current;
    if (old !== null) (old as Camera).close();
    cam.current = null;
    setState('opening');
    Camera.open(all[i].id, { width: 640, height: 480, fps: 30 }).then((cm: Camera): void => { trace(`camera live: ${all[i].name}`); cam.current = cm; setState('live'); })
      .catch((e: Error): void => { setWhy(e.message); setState('failed'); });
  };
  useEffect((): void => {
    if (started.current) return;
    started.current = true;
    onLeave((): void => { const cm = cam.current; if (cm !== null) (cm as Camera).close(); cam.current = null; });
    requestPermission().then((p: string): void => {
      if (p !== 'granted') { setState('denied'); return; }
      devices().then((all: CameraDevice[]): void => { setList(all); if (all.length === 0) setState('none'); else open(all, 0); })
        .catch((e: Error): void => { setWhy(e.message); setState('failed'); });
    });
  }, []);
  const snap = (): void => {
    const cm = cam.current;
    if (cm === null) return;
    (cm as Camera).snapshot();
    flash.setValue(1); Animated.timing(flash, { toValue: 0, duration: 350 }).start();
    trace(`photo at frame ${(cm as Camera).frameIndex}`);
    setShots([new Shot((cm as Camera).frameIndex, which === 1)].concat(shots.slice(0, 5)));
  };
  if (state === 'denied') return <Screen><EmptyState icon="camera" tone="warn" title="Camera access is off" body="Allow the camera in the system settings, then come back." /></Screen>;
  if (state === 'none') return <Screen><EmptyState icon="camera" title="No camera here" body="This device has no camera. The rest of the app works the same." /></Screen>;
  if (state === 'failed') return <Screen><EmptyState icon="circle-alert" tone="danger" title={tr('Something went wrong')} body={why} /></Screen>;
  const cm = cam.current;
  return <Screen>
    <View style={[st.preview, { backgroundColor: c.ink }]}>
      {state === 'live' && cm !== null ? <Canvas style={{ flex: 1 }} onDraw={(x: i32, y: i32, w: i32, h: i32) => drawPreview(cm as Camera, x, y, w, h, which === 1)} />
        : <View style={st.center}><Text style={[k.small, { color: 0xFFFFFF }]}>{state === 'asking' ? 'Asking for the camera…' : 'Opening…'}</Text></View>}
      <View style={[st.flash, { opacity: f }]} />
      <View style={st.badge}><Badge text={state === 'live' ? 'LIVE' : '…'} tone={state === 'live' ? 'danger' : 'neutral'} dot={true} /></View>
    </View>
    {list.length > 1 && <Segmented options={list.map((d: CameraDevice) => d.position === 'back' ? 'Back' : d.position === 'front' ? 'Front' : d.name)} value={which}
      onChange={(i: number) => { setWhich(i); open(list, i); }} />}
    <View style={[k.rowFlat, { justifyContent: 'center' }]}>
      <Pressable style={[st.shutter, { borderColor: c.line }]} onPress={snap} disabled={state !== 'live'} accessibilityLabel={tr('Take photo')}>
        <View style={[st.shutterIn, { backgroundColor: state === 'live' ? c.accent : c.raised }]}><Icon name="camera" size={26} color={() => theme().accentInk} /></View>
      </Pressable>
    </View>
    <Section title="Photos" note={list.length > 0 ? `${list[which].name} · ${cm !== null ? `${(cm as Camera).width}×${(cm as Camera).height} at ${(cm as Camera).fps} fps` : ''}` : ''}>
      {shots.length === 0 ? <Text style={[k.small, { color: c.muted, padding: SP * 4 }]}>Photos you take appear here.</Text>
        : <View style={[k.wrap, { padding: SP * 3 }]}>{shots.map((s: Shot) => <View style={st.thumb}>
          <Canvas style={{ flex: 1, lazy: 1 }} onDraw={(x: i32, y: i32, w: i32, h: i32) => picture(x, y, w, h, Math.floor(s.frame / 7) + (s.back ? 3 : 0), 8)} />
          <Text style={st.thumbText}>{`#${s.frame}`}</Text>
        </View>)}</View>}
    </Section>
  </Screen>;
}

const st = StyleSheet.create({
  preview: { height: 300, borderRadius: R_CARD, overflow: 'hidden' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  flash: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: '#ffffff' },
  badge: { position: 'absolute', left: SP * 3, top: SP * 3 },
  shutter: { width: 76, height: 76, borderRadius: 38, borderWidth: 4, alignItems: 'center', justifyContent: 'center' },
  shutterIn: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  thumb: { width: 64, height: 64, borderRadius: 10, overflow: 'hidden' },
  thumbText: { position: 'absolute', right: 4, bottom: 2, fontSize: 10, color: '#ffffff' },
});
