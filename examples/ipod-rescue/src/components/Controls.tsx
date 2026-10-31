import { Icon } from 'zinc:icons';
import { BORDER, INK, MUTED } from '../constants';

export function Action(props: { label: string; onPress: () => void; disabled?: boolean; primary?: boolean; icon?: string }): i32 {
  const off = props.disabled === true;
  return <Button disabled={off} onClick={props.onPress}
    className={`flex-row items-center justify-center gap-2 h-[34] px-3.5 rounded-[7] border ${off ? 'bg-[#eceee7] border-[#e0e3db]' : props.primary === true ? 'bg-[#255c48] border-[#255c48] hover:bg-[#194533] focus:bg-[#194533]' : `bg-[#fffef9] ${BORDER} hover:bg-[#e7ece3] focus:bg-[#e7ece3]`}`}>
    {props.icon !== undefined ? <Icon name={props.icon ?? ''} size={14} color={() => off ? 0x96a198 : props.primary === true ? 0xffffff : 0x255c48} /> : <View />}
    <Text className={`text-[12px] font-semibold ${off ? 'text-[#96a198]' : props.primary === true ? 'text-white' : INK}`}>{props.label}</Text>
  </Button>;
}
export function Choice(props: { label: string; active: boolean; onPress: () => void; disabled?: boolean }): i32 {
  return <Button disabled={props.disabled === true} onClick={props.onPress}
    className={`h-[30] px-3 justify-center rounded-[6] border ${props.active ? 'bg-[#e0eddf] border-[#91b197]' : `bg-transparent ${BORDER} hover:bg-[#e8ebe1] focus:bg-[#e8ebe1]`}`}>
    <Text className={`text-[11px] ${props.active ? 'text-[#255c48] font-semibold' : MUTED}`}>{props.label}</Text>
  </Button>;
}
export function Fact(props: { label: string; value: string }): i32 {
  return <View className={`flex-row gap-3 py-2 border-b ${BORDER}`}>
    <Text className={`w-[118] text-[11px] ${MUTED}`}>{props.label}</Text>
    <Text className={`grow basis-0 text-[12px] ${INK} select-text`} numberOfLines={2}>{props.value}</Text>
  </View>;
}
