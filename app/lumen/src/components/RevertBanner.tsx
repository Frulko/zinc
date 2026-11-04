import { TEXT_SMALL, palette } from '../theme';
import { keepMode, revertLeft, revertModeNow } from '../state';
import { GlassButton } from './GlassButton';

export function RevertBanner(): i32 {
  return <View className={`flex-row items-center justify-between gap-2 p-2 rounded-[8px] ${palette().well}`}>
    <Text className={`shrink ${TEXT_SMALL} ${palette().label}`}>{`Keep this resolution? Going back in ${revertLeft()} s`}</Text>
    <View className="flex-row gap-1">
      <GlassButton label="Go Back" onPress={() => revertModeNow()} />
      <GlassButton label="Keep" onPress={() => keepMode()} />
    </View>
  </View>;
}
