/** @jsxHelpers ./host */
// zinc:ui/kit — Separator: a one-pixel hairline, horizontal (full width) or vertical (full height of its row).
//
//   <Separator />   <Separator vertical />
import { theme } from './theme';

export interface SeparatorProps {
  vertical?: boolean;
  className?: string;
}

export function Separator(props?: SeparatorProps): i32 {
  const shape = (props?.vertical ?? false) ? 'w-px h-full' : 'h-px w-full';
  return <View className={`${shape} bg-${theme().border} ${props?.className ?? ''}`} role="separator" aria-orientation={(props?.vertical ?? false) ? 'vertical' : 'horizontal'} />;
}
