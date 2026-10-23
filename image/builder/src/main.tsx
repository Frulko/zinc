// Zinc Pi Image: the settings on the left, the build on the right. Mounts the pages; the work is in state.ts.
import { render } from 'zinc:ui/solid';
import { theme, hex, setColorMode } from 'zinc:ui/nuxt';
import { SettingsPage } from './pages/settings';
import { BuildPage } from './pages/build';

function App(): i32 {
  return <View className={`w-full h-full flex-row bg-${hex(theme().bg)}`}>
    <SettingsPage />
    <View className={`w-[1px] h-full bg-${hex(theme().border)}`} />
    <BuildPage />
  </View>;
}

setColorMode('dark');
render(App, 0x000000, null);
