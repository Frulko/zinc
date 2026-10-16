// Kit: every zinc:ui/kit component, reusing the sections of examples/ui/kit-gallery (which also feed its ticker, see main.tsx).
import { heading, mutedText, overline } from 'zinc:ui/kit';
import { ButtonsCard } from '../../../ui/kit-gallery/src/sections/buttons';
import { SettingsCard } from '../../../ui/kit-gallery/src/sections/settings';
import { StatsRow, BadgesCard, AlertsColumn, TeamList } from '../../../ui/kit-gallery/src/sections/display';
import { OverlaysCard } from '../../../ui/kit-gallery/src/sections/overlays';

function Section(props: { title: string; children: () => i32 }): i32 {
  return <View className="flex-col gap-3">
    <Text className={overline()}>{props.title}</Text>
    {props.children()}
  </View>;
}

export function Kit(): i32 {
  return <ScrollView className="grow">
    <View className="flex-col gap-6 p-4 lg:p-8">
      <View className="flex-col gap-1">
        <Text className={heading(2)}>UI kit</Text>
        <Text className={mutedText()}>shadcn-style components, compiled to native code. Try them.</Text>
      </View>
      <Section title="METRICS"><StatsRow /></Section>
      <Section title="CONTROLS">
        <View className="flex-row flex-wrap gap-6 items-start"><ButtonsCard /><SettingsCard /></View>
      </Section>
      <Section title="OVERLAYS"><OverlaysCard /></Section>
      <Section title="FEEDBACK AND DATA">
        <View className="flex-row flex-wrap gap-6 items-start">
          <AlertsColumn />
          <View className="flex-col gap-6"><BadgesCard /><TeamList /></View>
        </View>
      </Section>
    </View>
  </ScrollView>;
}
