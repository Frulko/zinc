// ZN-1006: characters the UI font lacks come from the system's fallback fonts instead of '?' (tests/t0/text_fallback.sh).
import { render } from 'zinc:ui/solid';
function App(): i32 {
  return <View className="p-2 gap-1 bg-white">
    <Text className="text-[16px] text-black">日本語: 木 き 漢字</Text>
    <Text className="text-[16px] text-black">فارسی: سلام دنیا</Text>
    <Text className="text-[16px] text-black">▸ ▾ ↑ ↓ 👍 👋🏽</Text>
    <Text className="text-xs font-mono text-slate-800">▸ open ▾ {'{1}'} ↑ sent ↓ got</Text>
  </View>;
}
render(App, 0xffffff, null);
