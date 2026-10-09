// Kit: every zinc:ui/kit component, reusing the sections of examples/ui/kit-gallery (which also feed its ticker, see main.tsx).
import { heading, mutedText, overline } from 'zinc:ui/kit';
import { ButtonsCard } from '../../../ui/kit-gallery/src/sections/buttons';
import { SettingsCard } from '../../../ui/kit-gallery/src/sections/settings';
import { StatsRow, BadgesCard, AlertsColumn, TeamList } from '../../../ui/kit-gallery/src/sections/display';
import { OverlaysCard } from '../../../ui/kit-gallery/src/sections/overlays';

function Section(props: { title: string; children: () => i32 }): i32 {
  return <View class="flex-col gap-3">
    <Text class={overline()}>{props.title}</Text>
    {props.children()}
  </View>;
}

export function Kit(): i32 {
  return <ScrollView class="grow">
    <View class="flex-col gap-6 p-4 lg:p-8">
      <View class="flex-col gap-1">
        <Text class={heading(2)}>UI kit</Text>
        <Text class={mutedText()}>shadcn-style components, compiled to native code. Try them.</Text>
      </View>
      <Section title="METRICS"><StatsRow /></Section>
      <Section title="CONTROLS">
        <View class="flex-row flex-wrap gap-6 items-start"><ButtonsCard /><SettingsCard /></View>
      </Section>
      <Section title="OVERLAYS"><OverlaysCard /></Section>
      <Section title="FEEDBACK AND DATA">
        <View class="flex-row flex-wrap gap-6 items-start">
          <AlertsColumn />
          <View class="flex-col gap-6"><BadgesCard /><TeamList /></View>
        </View>
      </Section>
    </View>
  </ScrollView>;
}
