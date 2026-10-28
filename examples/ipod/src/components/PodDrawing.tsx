// An iPod drawn with Views: the body in the model's colour, the screen showing the iPod's own main menu under its name, and the
// click wheel with MENU and the transport marks. `width` sets the size; the rest follows the proportions of an iPod Classic.
import { Icon } from 'zinc:icons';
import { podColors } from '../constants';

const MENU: string[] = ['Music', 'Videos', 'Photos', 'Podcasts', 'Extras', 'Settings', 'Shuffle Songs'];

function px(n: number): i32 { return Math.round(n); }

export function PodDrawing(props: { model: string; name: string; width: i32 }): i32 {
  const w = props.width, h = px(w * 1.66), c = podColors(props.model);
  const pad = px(w * 0.075), screenW = w - 2 * pad, screenH = px(screenW * 0.76);
  const wheel = px(w * 0.64), button = px(wheel * 0.38), mark = c.dark ? 0xd1d1d6 : 0x8e8e93;
  const rowH = px(screenH / 9.4), fontPx = Math.max(7, px(rowH * 0.62));
  const detailed = w >= 120;   // a small one (the sidebar's) is the shapes only
  return <View className={`flex-col items-center rounded-[${px(w * 0.11)}] border border-[#00000022] ${detailed ? 'shadow-lg' : ''}`} bg={c.body}
    style={{ width: w, height: h }}>
    {/* the screen, in a black bezel */}
    <View className={`rounded-[${detailed ? 6 : 2}] bg-[#0b0b0c] p-[${detailed ? 3 : 1}]`} style={{ marginTop: pad, width: screenW, height: screenH }}>
      {detailed ? <View className="grow flex-col rounded-[3] bg-[#f4f6f8] overflow-hidden">
        <View className="flex-row items-center justify-center bg-linear-to-b from-[#fdfdfd] to-[#c9ced6] border-b border-[#9aa0a8]" style={{ height: rowH }}>
          <Text className={`text-[${fontPx}px] font-semibold text-[#1d1d1f]`} numberOfLines={1}>{props.name !== '' ? props.name : 'iPod'}</Text>
        </View>
        {MENU.map((item: string, i: i32) => <View className={`flex-row items-center px-[5] ${i === 0 ? 'bg-linear-to-b from-[#6aa9f0] to-[#2a6fd6]' : ''}`} style={{ height: rowH }}>
          <Text className={`grow text-[${fontPx}px] ${i === 0 ? 'text-white font-semibold' : 'text-[#1d1d1f]'}`}>{item}</Text>
          <Text className={`text-[${fontPx}px] ${i === 0 ? 'text-white' : 'text-[#8e8e93]'}`}>{i < 5 ? '›' : ''}</Text>
        </View>)}
      </View> : <View className="grow rounded-[2] bg-[#9fb4cc]" />}
    </View>
    {/* the click wheel */}
    <View className="grow items-center justify-center">
      {detailed ? <View className="flex-col items-center justify-between rounded-full border border-[#00000014]" bg={c.wheel}
        style={{ width: wheel, height: wheel, paddingTop: px(wheel * 0.07), paddingBottom: px(wheel * 0.07) }}>
        <Text className={`text-[${px(wheel * 0.075)}px] font-bold`} style={{ color: mark }}>MENU</Text>
        <View className="flex-row items-center justify-between w-full" style={{ paddingLeft: px(wheel * 0.07), paddingRight: px(wheel * 0.07) }}>
          <Icon name="skip-back" size={px(wheel * 0.1)} color={() => mark} strokeWidth={2.5} />
          <View className="rounded-full border border-[#00000018]" bg={c.button} style={{ width: button, height: button }} />
          <Icon name="skip-forward" size={px(wheel * 0.1)} color={() => mark} strokeWidth={2.5} />
        </View>
        <Icon name="play" size={px(wheel * 0.1)} color={() => mark} strokeWidth={2.5} />
      </View> : <View className="items-center justify-center rounded-full" bg={c.wheel} style={{ width: wheel, height: wheel }}>
        <View className="rounded-full" bg={c.button} style={{ width: button, height: button }} />
      </View>}
    </View>
  </View>;
}
