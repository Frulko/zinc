// Trieur photos: sort a photo library from one or more folders into album folders, in place or into another folder, moved or copied, with
// a trash. The deck is zinc:trieur (trieur's own code), the thumbnails and EXIF zinc:imageio, the folders and the trash zinc:system.
import { render, createSignal, createEffect, Show } from 'zinc:ui/solid';
import { Icon } from 'zinc:icons';
import { THEME, setScheme, isDark, language, setLanguage, type Language } from 'zinc:trieur';
import { t } from './i18n';
import { settings, screen, setScreen, setFiled } from './state';
import { scan, type Photo } from './library';
import { Setup } from './pages/Setup';
import { Sort } from './pages/Sort';
import { Done } from './pages/Done';

function App(): any {
  const [photos, setPhotos] = createSignal<Photo[]>([]);
  const [scanning, setScanning] = createSignal(false);
  // the pictures of the sources, found again whenever the settings change or the settings screen comes back (files moved meanwhile); on the
  // next frame, so the screen answers first
  createEffect(() => {
    const s = settings();
    if (screen() !== 'setup') return;
    setScanning(true);
    setTimeout(() => { setPhotos(scan(s)); setScanning(false); }, 0);
  });
  const start = () => { setFiled({}); setScreen('sort'); };
  return <View className="w-full h-full flex-col bg-linear-to-br from-[#f4f5fc] via-[#eceefa] to-[#f3ecf8] dark:from-[#0b0e22] dark:via-[#11163a] dark:to-[#1a0f30]">
    <View className="h-[48] shrink-0 flex-row items-center gap-3 px-5" style={{ borderBottomWidth: 1, borderColor: THEME.cardLine }}>
      <View className="w-[28] h-[28] rounded-[8] items-center justify-center" style={{ backgroundColor: THEME.accent }}><Icon name="images" size={16} color={() => 0xffffff} /></View>
      <Text className="text-[15px] font-bold" style={{ color: THEME.ink }}>{t.title}</Text>
      <View className="grow" />
      <View className="h-[32] p-[3] rounded-[10] flex-row gap-1" style={{ backgroundColor: THEME.chip, borderWidth: 1, borderColor: THEME.cardLine }}>
        {(['fr', 'en'] as Language[]).map((l) => <Button onClick={() => setLanguage(l)} className="w-[38] h-full rounded-[7] items-center justify-center"
          style={{ backgroundColor: language() === l ? THEME.accent : THEME.chip }}>
          <Text className="text-[12px] font-semibold" style={{ color: language() === l ? 0xffffff : THEME.ink }}>{l.toUpperCase()}</Text>
        </Button>)}
      </View>
      <Button onClick={() => setScheme(isDark() ? 'light' : 'dark')} className="w-[32] h-[32] rounded-[10] items-center justify-center" style={{ backgroundColor: THEME.chip, borderWidth: 1, borderColor: THEME.cardLine }}>
        <Icon name="sun-moon" size={16} color={() => THEME.ink} />
      </Button>
    </View>
    <Show when={screen() === 'setup'}><Setup count={() => photos().length} scanning={scanning} onStart={start} /></Show>
    <Show when={screen() === 'sort'}><Sort photos={photos()} /></Show>
    <Show when={screen() === 'done'}><Done /></Show>
  </View>;
}
render(App, 0x0b0e22, null);
