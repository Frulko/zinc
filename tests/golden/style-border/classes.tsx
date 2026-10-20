// The border model through classes (ZN-363 reference): dashed, dotted, two corners, side colours, a corner and a side; objects.tsx must give the same pixels.
import { render } from 'zinc:ui/solid';
function App(): i32 {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, padding: 16, backgroundColor: '#f4f1ec' }}>
    <View className="w-24 h-16 bg-white border-2 border-dashed border-blue-500" />
    <View className="w-24 h-16 bg-white border-2 border-dotted border-blue-500" />
    <View className="w-24 h-16 bg-blue-500 rounded-tl-xl rounded-br-3xl" />
    <View className="w-24 h-16 bg-white border-4 border-blue-500 border-t-red-500 border-l-red-500" />
    <View className="w-24 h-16 bg-white border-2 border-blue-500 rounded-tr-2xl border-b-red-500" />
  </View>;
}
render(App, 0xf4f1ec, null);
