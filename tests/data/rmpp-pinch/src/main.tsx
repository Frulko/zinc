// rmpp_sim fixture: a view that takes the pinch through zinc:ui (onPinch), as a ZoomView does: zinc:ui declares the frames' intent itself
// (interactive while the fingers are down, settle when they lift), so the driver never guesses from the finger count.
import { render } from 'zinc:ui/solid';
import { PointerEvent } from 'zinc:ui';
function App(): i32 {
  return <View className="flex-col h-full bg-white" onPinch={(e: PointerEvent) => { console.log(`pinch phase ${e.phase}`); }}>
    <Text className="text-[40px] text-black">Pinch</Text>
  </View>;
}
render(App, 0xffffff, null);
