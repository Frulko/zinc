import { Icon } from 'zinc:icons';
import { compact } from '../layout';
export function ToolButton(props: { icon: string; label: string; onClick: () => void; active?: boolean; primary?: boolean }): i32 {
 return <Button onClick={props.onClick} aria-label={props.label} className={(compact() ? 'grow h-[48] ' : 'w-[64] h-[64] ')+ 'border-[2] rounded-[10] gap-[3] items-center justify-center '+(props.primary ? 'bg-[#191922] border-[#191922]' : props.active ? 'bg-[#f3e7c4] border-[#191922]' : 'bg-[#ffffff] border-[#191922]')}>
  <Icon name={props.icon} size={22} strokeWidth={2} color={() => props.primary ? 0xffffff : 0x303139}/>
  <Text className={'text-[10px] '+(props.primary ? 'text-[#ffffff]' : 'text-[#50515a]')}>{props.label}</Text>
 </Button>;
}
