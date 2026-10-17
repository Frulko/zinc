// The fixture of tests/t1/web_video.sh: zinc:video on the web target. One Player over a VP9 WebM and an AV1 WebM (formats every Chrome plays, proprietary codecs aside), drawn by a Canvas
// node whose draw is only `player.draw`, so the page holds the browser's own <video>; buttons call the API (play, pause, seek, volume, rate, controls, next). A second Player holds a
// file no browser plays (an .avi), which shows its message and a download link instead.
import { createSignal, render } from 'zinc:ui/solid';
import { Button } from 'zinc:ui/kit';
import { Player } from 'zinc:video';

const p = new Player(320, 180);
const a = p.add('clip-vp9.webm');
const b = p.add('clip-av1.webm');
p.repeat = 1;
const bad = new Player(320, 180);
const c = bad.add('clip-legacy.avi');
const [note, setNote] = createSignal<string>('loaded ' + a + b + c);

function App(): i32 {
  return <View className="flex-col gap-3 p-4 w-full h-full bg-white">
    <Text as="h1" className="text-lg font-semibold text-slate-900">Video fixture</Text>
    <View className="flex-row gap-3">
      <View className="w-[320px] h-[180px]"><Canvas className="grow" onDraw={(x: i32, y: i32, w: i32, h: i32) => p.draw(x, y, w, h)} /></View>
      <View className="w-[320px] h-[180px]"><Canvas className="grow" onDraw={(x: i32, y: i32, w: i32, h: i32) => bad.draw(x, y, w, h)} /></View>
    </View>
    <View className="flex-row flex-wrap gap-2">
      <Button label="Play" onClick={() => { p.play(); setNote('play'); }} />
      <Button label="Pause" onClick={() => { p.pause(true); setNote('pause'); }} />
      <Button label="Seek" onClick={() => { p.seek(1); setNote('seek'); }} />
      <Button label="Half volume" onClick={() => { p.volume = 0.5; p.muted = false; setNote('volume'); }} />
      <Button label="Rate 2" onClick={() => { p.rate = 2; setNote('rate'); }} />
      <Button label="Controls" onClick={() => { p.controls = true; setNote('controls'); }} />
      <Button label="Next" onClick={() => { p.next(); setNote('next'); }} />
      <Button label="Loop one" onClick={() => { p.repeat = 2; setNote('one shot'); }} />
    </View>
    <Text className="text-sm text-slate-600">{note()}</Text>
  </View>;
}

render(App, 0xffffff, null);
