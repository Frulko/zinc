// The same camera through the Web's API: navigator.mediaDevices.getUserMedia({ video: true }), the facade zinc:web keeps over zinc:camera
// (docs/plugins/camera.md, "navigator.mediaDevices"). A browser page would put the stream in a <video>; here the track's image is drawn.
//   cd next && build/zinc run ../examples/webcam/src/web.tsx
// getUserMedia does not ask for the camera (a browser would): when access was never given, it fails with NotAllowedError; the main app's
// "Allow camera" button asks once, and this page works from then on.
import 'zinc:camera';
import { render, useState, useEffect } from 'zinc:ui/react';
import { drawImage, rect } from 'zinc:gfx';

let track: MediaStreamTrack | null = null;

function draw(x: i32, y: i32, w: i32, h: i32): void {
  rect(x, y, w, h, 0x09090B);
  const t = track;
  if (t === null || t.image < 0) return;
  const g = t.getSettings(), s = Math.min(w / g.width, h / g.height), dw = g.width * s, dh = g.height * s;
  drawImage(t.image as i32, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh, 255, 0);
}

function Page() {
  const [line, setLine] = useState<string>('Opening the camera…');
  useEffect((): void => {
    navigator.mediaDevices.getUserMedia({ video: true }).then((stream: MediaStream): void => {
      const t = stream.getVideoTracks()[0], g = t.getSettings();
      track = t;
      setLine(`${t.label} · ${g.width}×${g.height} at ${g.frameRate} fps · getUserMedia`);
      console.log(`getUserMedia: ${t.kind} ${t.label} ${g.width}x${g.height} ${t.readyState}`);
    }).catch((e: Error): void => { setLine(`${e.name}: ${e.message}`); console.log(`getUserMedia failed: ${e.name}`); });
  }, []);
  return <View className="flex-1 flex-col bg-zinc-950">
    <Canvas className="flex-1" onDraw={draw} />
    <View className="px-4 py-3 bg-zinc-900"><Text className="text-sm text-zinc-100">{line}</Text></View>
  </View>;
}

render(Page, 0x09090B, null);
