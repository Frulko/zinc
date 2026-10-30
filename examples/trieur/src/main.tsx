import { Icon } from 'zinc:icons';
import { render, createSignal, Show } from 'zinc:ui/solid';
import { THEME, setScheme, isDark, language, setLanguage, type Language } from 'zinc:trieur';
import { t } from './i18n';
import { LinksPage } from './pages/links/LinksPage';
import { LayoutsPage } from './pages/layouts/LayoutsPage';
import { MailPage } from './pages/mail/MailPage';
import { StudyPage } from './pages/study/StudyPage';

const DEMOS = [
  { id: 'links', label: () => t.links, hint: () => t.linksHint, icon: 'link' },
  { id: 'layouts', label: () => t.layouts, hint: () => t.layoutsHint, icon: 'layout-grid' },
  { id: 'mail', label: () => t.mail, hint: () => t.mailHint, icon: 'inbox' },
  { id: 'study', label: () => t.study, hint: () => t.studyHint, icon: 'graduation-cap' },
];

function App(): any {
  const [page, setPage] = createSignal('links');
  return <View className="w-full h-full flex-row bg-linear-to-br from-[#f4f5fc] via-[#eceefa] to-[#f3ecf8] dark:from-[#0b0e22] dark:via-[#11163a] dark:to-[#1a0f30]">
    <View className="w-[220] shrink-0 flex-col gap-1 px-3 py-5" style={{ backgroundColor: THEME.side, borderRightWidth: 1, borderColor: THEME.cardLine }}>
      <View className="flex-row items-center gap-2 px-2 pb-4">
        <View className="w-[30] h-[30] rounded-[9] items-center justify-center" style={{ backgroundColor: THEME.accent }}><Icon name="layers" size={17} color={() => 0xffffff} /></View>
        <Text className="text-[17px] font-bold" style={{ color: THEME.ink }}>trieur</Text>
      </View>
      {DEMOS.map((d) => <Button onClick={() => setPage(d.id)} className="h-[52] px-3 rounded-[12] flex-row items-center gap-3"
        style={{ backgroundColor: page() === d.id ? THEME.accentSoft : THEME.side }}>
        <Icon name={d.icon} size={18} color={() => (page() === d.id ? THEME.accent : THEME.dim)} />
        <View>
          <Text className="text-[14px] font-semibold" style={{ color: THEME.ink }}>{d.label()}</Text>
          <Text className="text-[11px]" style={{ color: THEME.dim }}>{d.hint()}</Text>
        </View>
      </Button>)}
      <View className="grow" />
      <View className="h-[40] p-1 rounded-[12] flex-row gap-1" style={{ backgroundColor: THEME.chip }}>
        {(['fr', 'en'] as Language[]).map((l) => <Button onClick={() => setLanguage(l)} className="grow h-full rounded-[9] items-center justify-center"
          style={{ backgroundColor: language() === l ? THEME.accent : THEME.chip }}>
          <Text className="text-[13px] font-semibold" style={{ color: language() === l ? 0xffffff : THEME.ink }}>{l.toUpperCase()}</Text>
        </Button>)}
      </View>
      <Button onClick={() => setScheme(isDark() ? 'light' : 'dark')} className="h-[40] px-3 rounded-[12] flex-row items-center gap-3" style={{ backgroundColor: THEME.chip }}>
        <Icon name="sun-moon" size={17} color={() => THEME.ink} />
        <Text className="text-[13px] font-medium" style={{ color: THEME.ink }}>{isDark() ? t.light : t.dark}</Text>
      </Button>
    </View>
    <View className="grow flex-col">
      <Show when={page() === 'links'}><LinksPage /></Show>
      <Show when={page() === 'layouts'}><LayoutsPage /></Show>
      <Show when={page() === 'mail'}><MailPage /></Show>
      <Show when={page() === 'study'}><StudyPage /></Show>
    </View>
  </View>;
}
render(App, 0x0b0e22, null);
