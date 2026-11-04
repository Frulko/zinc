// An SF Symbol in the palette's icon colour. Nothing at all where symbols do not exist (a deterministic run): the row keeps its place.
import { symbol } from 'zinc:sf-symbols';
import { palette } from '../theme';

export function Symbol(props: { name: string; side: number; pointSize: number; weight?: number }): i32 {
  const image = symbol(props.name, props.side, props.pointSize, props.weight ?? 0);
  return <View className={`w-[${props.side}px] h-[${props.side}px] shrink-0`}>
    <Show when={image >= 0}><Image image={image} className={`w-[${props.side}px] h-[${props.side}px] ${palette().iconTint}`} /></Show>
  </View>;
}
