// kit-gallery: every zinc:ui/kit component on one scrolling page, in the Solid model.
// The switch in the header flips the whole page between the light and the dark theme.
import { env } from 'zinc:sys';
import { ActionsSection } from './sections/actions';
import { ChromeSection } from './sections/chrome';
import { SelectionSection } from './sections/selection';
import { InputsSection } from './sections/inputs';
import { render } from 'zinc:ui/solid';
import { Switch, heading, leadText, theme, useQuietTheme } from 'zinc:ui/kit';
import { darkMode, setDarkMode } from './state';
import { ButtonsCard } from './sections/buttons';
import { SettingsCard } from './sections/settings';
import { StatsRow, BadgesCard, AlertsColumn, TeamList } from './sections/display';
import { OverlaysCard } from './sections/overlays';

useQuietTheme();
if (env('GALLERY_DARK') === '1') setDarkMode(true);

function Header(): i32 {
  return <View className="flex-row items-start justify-between gap-4">
    <View className="flex-col gap-2">
      <Text className={heading(1)}>Zinc UI kit</Text>
      <Text className={leadText()}>Quiet components, compiled to native code.</Text>
    </View>
    <Switch checked={darkMode} onChange={setDarkMode} label="Dark" />
  </View>;
}

/** A labelled group of components. */
function Section(props: { title: string; children: () => i32 }): i32 {
  return <View className="flex-col gap-3">
    <Text className={heading(3)}>{props.title}</Text>
    {props.children()}
  </View>;
}

function App(): i32 {
  return <ScrollView className={`h-full bg-${theme().background}`}>
    <View className="flex-col gap-8 p-8">
      <Header />
      <Show when={env('GALLERY') === '' || env('GALLERY') === 'actions' || env('GALLERY') === 'palette'}><ActionsSection /></Show>
      <Show when={env('GALLERY') === '' || env('GALLERY') === 'chrome'}><ChromeSection /></Show>
      <Show when={env('GALLERY') === '' || env('GALLERY') === 'selection'}><SelectionSection /></Show>
      <Show when={env('GALLERY') === 'overlays'}><Section title="Overlays"><OverlaysCard /></Section></Show>
      <Show when={env('GALLERY') === '' || env('GALLERY') === 'inputs'}><InputsSection /></Show>
      <Show when={env('GALLERY') === ''}>
      <Section title="Metrics"><StatsRow /></Section>
      <Section title="Controls">
        <View className="flex-row flex-wrap gap-6 items-start">
          <ButtonsCard />
          <SettingsCard />
        </View>
      </Section>
      <Section title="Overlays"><OverlaysCard /></Section>
      <Section title="Feedback and data">
        <View className="flex-row flex-wrap gap-6 items-start">
          <AlertsColumn />
          <View className="flex-col gap-6">
            <BadgesCard />
            <TeamList />
          </View>
        </View>
      </Section>
      </Show>
    </View>
  </ScrollView>;
}

render(App, 0xfafafa, null);
