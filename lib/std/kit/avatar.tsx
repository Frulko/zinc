/** @jsxHelpers ./host */
// zinc:ui/kit — Avatar: a round badge with a person's (or a device's) initials.
//
//   <Avatar name="Ada Lovelace" />   ->  "AL"
import { theme } from './theme';

export interface AvatarProps {
  name: string;
  size?: string;    // 'sm' | 'default' | 'lg'
}

/** First letter of the first two words, upper-cased: "Ada Lovelace" -> "AL", "sensor" -> "S". */
export function initials(name: string): string {
  const words = name.trim().split(' ').filter((w: string) => w.length > 0);
  let out = '';
  for (let i = 0; i < words.length && i < 2; i++) out += words[i].slice(0, 1).toUpperCase();
  return out;
}

function sizeClass(size: string): string {
  if (size === 'sm') return 'w-8 h-8';
  if (size === 'lg') return 'w-12 h-12';
  return 'w-10 h-10';
}

export function Avatar(props: AvatarProps): i32 {
  const size = props.size ?? 'default';
  return <View class={`items-center justify-center rounded-full ${sizeClass(size)} bg-${theme().muted}`}>
    <Text class={`${size === 'lg' ? 'text-base' : 'text-sm'} font-medium text-${theme().mutedForeground}`}>{initials(props.name)}</Text>
  </View>;
}
