import { render } from 'zinc:ui/solid';
import * as system from 'zinc:system';
import * as fs from 'zinc:fs';

render(() => <View className="w-full h-full">
  <View className="absolute left-[20px] top-[20px] w-[100px] h-[60px] bg-[#ffcc00]" />
  <View className="absolute left-[160px] top-[20px] w-[100px] h-[60px] bg-white/50" />
</View>, 0x000000, null);
setTimeout(() => {
  const d = system.call('window.dump', {}) as { text: string };
  const line = d.text.split('\n').filter((l: string) => l.startsWith('windowNumber'))[0];
  fs.writeText('window-number.txt', line.slice(13));
}, 500);
setTimeout(() => system.quit(0), 1500);
