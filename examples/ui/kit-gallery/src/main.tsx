// kit-gallery: every zinc:ui/kit component on one scrolling page, in the Solid model.
// The switch in the header flips the whole page between the light and the dark theme.
import { render } from 'zinc:ui/solid';
import { Switch, heading, leadText, overline, theme } from 'zinc:ui/kit';
import { darkMode, setDarkMode, advanceUpload } from './state';
import { ButtonsCard } from './sections/buttons';
import { SettingsCard } from './sections/settings';
import { StatsRow, BadgesCard, AlertsColumn, TeamList } from './sections/display';
import { OverlaysCard } from './sections/overlays';

function Header(): i32 {
  return <View class="flex-row items-start justify-between gap-4">
    <View class="flex-col gap-2">
      <Text class={heading(1)}>Zinc UI kit</Text>
      <Text class={leadText()}>shadcn-style components, compiled to native code.</Text>
    </View>
    <Switch checked={darkMode} onChange={setDarkMode} label="Dark" />
  </View>;
}

/** A labelled group of components. */
function Section(props: { title: string; children: () => i32 }): i32 {
  return <View class="flex-col gap-3">
    <Text class={overline()}>{props.title}</Text>
    {props.children()}
  </View>;
}

function App(): i32 {
  return <ScrollView class={`h-full bg-${theme().background}`}>
    <View class="flex-col gap-8 p-8">
      <Header />
      <Section title="METRICS"><StatsRow /></Section>
      <Section title="CONTROLS">
        <View class="flex-row flex-wrap gap-6 items-start">
          <ButtonsCard />
          <SettingsCard />
        </View>
      </Section>
      <Section title="OVERLAYS"><OverlaysCard /></Section>
      <Section title="FEEDBACK AND DATA">
        <View class="flex-row flex-wrap gap-6 items-start">
          <AlertsColumn />
          <View class="flex-col gap-6">
            <BadgesCard />
            <TeamList />
          </View>
        </View>
      </Section>
    </View>
  </ScrollView>;
}

render(App, 0xfafafa, advanceUpload);
