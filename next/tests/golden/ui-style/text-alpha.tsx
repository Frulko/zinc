// text-white/60 and border-white/30 (ZN-259): alpha on text and border colours, over a dark card.
import { render } from 'zinc:ui/react';
import { quit } from 'zinc:gfx';
let n = 0;
function Screen(): i32 {
  return <View class="flex-col gap-2 p-4 bg-slate-900 w-full">
    <Text class="text-white text-lg">opaque</Text>
    <Text class="text-white/60 text-lg">white at 60%</Text>
    <Text class="text-[rgba(255,136,0,0.5)] text-lg">orange at 50%</Text>
    <View class="h-8 border-4 border-white/30 bg-[hsl(200,60%,40%)]" />
  </View>;
}
render(Screen, 0xffffff, (dt: number) => { n++; if (n >= 3) quit(); });
