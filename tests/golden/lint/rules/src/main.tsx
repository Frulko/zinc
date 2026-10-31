// tests/t0/lint.sh: one finding of each target rule on esp32 (tests/golden/lint/rules.expect).
import { render } from 'zinc:ui/solid';
import { Keyboard } from 'zinc:ui/kit';
import { open } from 'zinc:sqlite';
import { play } from 'zinc:audio';
import { gone } from './missing';
function App(): i32 {
  return <View className="w-[480px] p-2">
    <View className="bg-conic from-red-500 to-blue-500 h-8" />
    <View className="bg-linear-to-r from-red-500 via-green-500 to-blue-500 h-8" />
    <View className="bg-linear-to-r from-red-500 to-blue-500 h-8 md:w-[900px]" />
    <Keyboard />
  </View>;
}
const usedPlugins = [typeof open, typeof play];   // used, so the plugins are loaded as code, not only as types
render(App, 0xffffff, null);
