// The QR scanner of the home screen: the back camera's live picture, read by zinc:camera's scanQr (quirc) a few times a second, until a
// zinc:// link shows up. ZINC_FAKE_CAMERA_IMAGE=<qr.png> holds a code up to the fake camera on a desktop (tests/t1/zinc_go_home.sh).
import { useState, useRef, useEffect } from 'zinc:ui/react';
import { View, Text, Pressable, StyleSheet, Platform, SafeAreaView } from 'zinc:react-native';
import { drawImage, rect } from 'zinc:gfx';
import { devices, requestPermission, Camera, CameraDevice } from 'zinc:camera';
import { Icon } from 'zinc:icons';

export function Scanner(p: { onCode: (url: string) => void; onClose: () => void }) {
  const [state, setState] = useState('asking');   // asking, live, denied, failed
  const [why, setWhy] = useState('');
  const cam = useRef<Camera | null>(null);
  const cancelled = useRef<boolean>(false);
  const started = useRef<boolean>(false);
  const close = (): void => { const c = cam.current; if (c !== null) (c as Camera).close(); cam.current = null; };
  useEffect((): void => {
    if (started.current) return;
    started.current = true;
    cancelled.current = false;
    requestPermission().then((perm: string): void => {
      if (cancelled.current) return;
      if (perm !== 'granted') { setState('denied'); return; }
      devices().then((all: CameraDevice[]): void => {
        if (cancelled.current) return;
        if (all.length === 0) { setWhy('This device has no camera: type the link instead.'); setState('failed'); return; }
        let pick = all[0];
        for (const d of all) if (d.position === 'back') pick = d;
        Camera.open(pick.id, { width: Platform.OS === 'ios' ? 480 : 640, height: Platform.OS === 'ios' ? 640 : 480, fps: 30 }).then((c: Camera): void => {
          if (cancelled.current) { c.close(); return; }
          cam.current = c;
          setState('live');
          c.onFrame((index: number): void => {
            if (index % 5 !== 0) return;
            const text = c.scanQr();
            if (!text.startsWith('zinc://')) return;
            console.log(`zinc go: scanned ${text}`);
            close();
            p.onCode(text);
          });
        }).catch((e: Error): void => { setWhy(e.message); setState('failed'); });
      }).catch((e: Error): void => { setWhy(e.message); setState('failed'); });
    });
    return (): void => { cancelled.current = true; close(); };
  }, []);
  const c = cam.current;
  return <View style={s.page}>
    {state === 'live' && c !== null
      ? <Canvas style={{ flex: 1 }} onDraw={(x: i32, y: i32, w: i32, h: i32) => {
          const cm = c as Camera;
          rect(x, y, w, h, 0x000000);
          if (cm.image < 0) return;
          const k = Math.max(w / cm.width, h / cm.height), dw = cm.width * k, dh = cm.height * k;
          drawImage(cm.image as i32, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh, 255, 0);
        }} />
      : <View style={s.center}><Text style={s.text}>{state === 'asking' ? 'Asking for the camera...' : state === 'denied' ? 'The camera is off for Zinc Go: allow it in the settings, or type the link.' : why}</Text></View>}
    <SafeAreaView style={s.overlay}><View style={s.controls}>
    <View style={s.frame} />
    <Text style={s.hint}>Point at the QR code zinc dev --lan prints</Text>
    <Pressable style={s.close} onPress={() => { close(); p.onClose(); }} accessibilityLabel="Close the scanner">
      <Icon name="x" size={22} color={() => 0xFFFFFF} />
    </Pressable>
    </View></SafeAreaView>
  </View>;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: 0x000000 },
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  controls: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  text: { fontSize: 15, color: 0xFFFFFF, textAlign: 'center' },
  frame: { position: 'absolute', left: '15%', right: '15%', top: '30%', height: 240, borderWidth: 3, borderColor: 0xFFFFFF, borderRadius: 24, opacity: 0.8 },
  hint: { position: 'absolute', left: 24, right: 24, bottom: 24, fontSize: 15, color: 0xFFFFFF, textAlign: 'center' },
  close: { position: 'absolute', right: 20, top: 12, width: 44, height: 44, borderRadius: 22, backgroundColor: 0x000000, opacity: 0.6, alignItems: 'center', justifyContent: 'center' },
});
