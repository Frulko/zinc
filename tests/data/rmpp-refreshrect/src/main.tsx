// rmpp_sim fixture (ZN-930): the app names the waveform of three regions, one after the other: quality, fast, then a full refresh.
import { render } from 'zinc:ui/solid';
import { refreshRect } from 'zinc:gfx';
function App(): i32 { return <View className="flex-col h-full bg-white"><Text className="text-[40px] text-black">Refresh rect</Text></View>; }
render(App, 0xffffff, null);
setTimeout(() => { console.log('quality', refreshRect(100, 200, 300, 120, 'quality')); }, 1500);
setTimeout(() => { console.log('fast', refreshRect(400, 600, 200, 80, 'fast')); }, 3500);
setTimeout(() => { console.log('full', refreshRect(0, 0, 1620, 2160, 'full')); }, 5500);
setTimeout(() => { console.log('bad', refreshRect(0, 0, 10, 10, 'slow')); }, 6500);
