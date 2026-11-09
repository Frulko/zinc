import { render } from 'zinc:ui/solid';
import { windowCtl, width, height } from 'zinc:gfx';
let frame = 0;
render(() => <View className="h-full"><Text>Resize repro</Text></View>, 0xffffff, (dt: number) => {
  frame++;
  if (frame === 2) windowCtl(0, 1, '', 360, 800);
  if (frame === 10) {
    const w = windowCtl(0, 6, '', 0, 0), h = windowCtl(0, 7, '', 0, 0);
    if (width() !== 360 || height() !== 800 || w !== 360 || h !== 800) throw new Error('portrait resize: surface ' + width() + 'x' + height() + ', window ' + w + 'x' + h);
    windowCtl(0, 1, '', 800, 500);
  }
  if (frame === 18) {
    const w = windowCtl(0, 6, '', 0, 0), h = windowCtl(0, 7, '', 0, 0);
    if (width() !== 800 || height() !== 500 || w !== 800 || h !== 500) throw new Error('landscape resize');
    console.log('native resize ok');
  }
});
