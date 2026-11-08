// ZN-1006: a Latin text draws the same pixels with the shaping tier on (the default) as with "text": "simple" (tests/t0/text_fallback.sh).
import { render } from 'zinc:ui/solid';
function App(): i32 {
  return <View className="p-2 gap-1 bg-white">
    <Text className="text-[16px] font-bold text-black">Café déjà vu, naïve façade</Text>
    <Text className="text-[13px] text-slate-700">“Quotes” – dashes — and l’apostrophe… 3 × 4 ≠ 11</Text>
    <Text className="text-xs font-mono text-slate-800">const x = a ?? b; // ok</Text>
  </View>;
}
render(App, 0xffffff, null);
