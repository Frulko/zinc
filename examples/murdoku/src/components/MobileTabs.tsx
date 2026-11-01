import { For } from 'zinc:ui/solid';
import { INK, ink } from '../skin';
import { mobileTab, setMobileTab } from '../layout';
const tabs = ['plan','temoins','aide'];
const labels = ['Plan','Témoins','Aide'];
export function MobileTabs(): i32 {
 return <View className={"h-[44] mx-3 p-[2] flex-row gap-1 rounded-[9] bg-[#e9e9ee] shrink-0"+ink("border-[2] border-black")}>
  <For each={tabs}>{(tab: string, i: number) => <Button onClick={() => setMobileTab(tab)} aria-label={labels[i]} className={'grow h-[40] rounded-[7] items-center justify-center '+(mobileTab() === tab ? (INK ? 'bg-black' : 'bg-[#ffffff] shadow-sm') : 'bg-transparent')}><Text className={'text-[13px] '+(mobileTab() === tab ? (INK ? 'font-semibold text-white' : 'font-semibold text-[#1d1d1f]') : 'text-[#6e6e73]')}>{labels[i]}</Text></Button>}</For>
 </View>;
}
