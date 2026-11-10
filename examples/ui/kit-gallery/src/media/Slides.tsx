import { createSignal } from 'zinc:ui/solid';
import { Carousel, theme } from 'zinc:ui/kit';
export function MediaSlides(p:{pictures:i32[]}):i32 {
 const [index,setIndex]=createSignal<i32>(0);
 const titles=['Studio reference','Colour study','Ready for print'];
 return <Carousel label="Workshop collection" count={()=>3} index={index} onChange={setIndex} loop={true} height={260} autoAdvance={6} renderSlide={(slide:i32)=><View className={`h-full w-full flex-col bg-${theme().card}`}><View className="relative flex-1 min-h-0 overflow-hidden"><Image image={p.pictures[slide%2]} className="absolute inset-0 w-full h-full" resizeMode="cover"/></View><View className="p-3 flex-col gap-1"><Text className={`text-[15px] text-${theme().foreground}`}>{titles[slide]}</Text><Text className={`text-[12px] text-${theme().mutedForeground}`}>Paper circuits · Collection {slide+1}</Text></View></View>}/>;
}
