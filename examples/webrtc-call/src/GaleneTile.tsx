import { drawImage } from 'zinc:gfx';
import { Button, theme } from 'zinc:ui/kit';
import { RemoteVideo } from 'zinc:webrtc';
import { Galene, GaleneStream } from './galene';

export default function GaleneTile(p: { client: Galene; stream: GaleneStream; showStats: boolean }) {
  const s = p.stream, hidden = s.requested === 'hidden', t = theme();
  return <View className={`grow min-w-[240px] basis-[40%] gap-2 p-3 rounded-[18px] border border-${t.border} bg-${t.card}`}>
    {!hidden && <Canvas className="h-[180px] w-full" onDraw={(x: i32, y: i32, w: i32, h: i32) => {
      const track = s.video;
      if (track === null) return;
      const video = track.camera as RemoteVideo;
      if (video.image < 0 || video.width <= 0 || video.height <= 0) return;
      const scale = Math.min(w / video.width, h / video.height);
      drawImage(video.image, x + (w - video.width * scale) / 2, y + (h - video.height * scale) / 2, video.width * scale, video.height * scale, 255, 0);
    }} />}
    <Text className={`text-[13px] text-${t.foreground}`}>{s.username + (s.label === 'screenshare' ? ' · Screen' : '')}</Text>
    {p.showStats && <Text className={`text-[12px] tabular-nums text-${t.mutedForeground}`}>{`Video ${(s.videoBytes / 1024).toFixed(1)} KiB · Audio ${(s.audioBytes / 1024).toFixed(1)} KiB · ${s.requested === 'hidden' ? 'audio only' : s.requested === 'video' ? 'speaker' : 'thumbnail'}`}</Text>}
    <View className="flex-row flex-wrap gap-2">
      <Button label={hidden ? 'Show video' : 'Hide video'} size="sm" variant="outline" onClick={() => p.client.requestVideo(s.id, hidden ? 'video-low' : 'hidden')} />
      <Button label="Speaker video" size="sm" variant="outline" pressed={s.requested === 'video'} disabled={hidden} onClick={() => p.client.selectSpeaker(s.id)} />
    </View>
  </View>;
}
