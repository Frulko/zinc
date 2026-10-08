import { theme, hex, Card, Button } from 'zinc:ui/nuxt';
import { userName, notes, go } from '../state';

export function Home(): i32 {
  return <View class="flex-col gap-6">
    <View class="flex-col gap-1">
      <Text class={`text-2xl font-semibold text-${hex(theme().textHighlighted)}`}>{userName() === '' ? 'Welcome' : `Welcome, ${userName()}`}</Text>
      <Text class={`text-sm text-${hex(theme().textMuted)}`}>A starting point: replace these pages with yours.</Text>
    </View>
    <View class="flex-row gap-4">
      <Card class="grow basis-0" title="Notes" description={`${notes().length} note(s) saved on this machine.`}>
        <Button label="Open notes" icon="notebook-pen" color="primary" variant="soft" onClick={() => go('Notes')} />
      </Card>
      <Card class="grow basis-0" title="Settings" description="Your name, dark mode, what this platform offers.">
        <Button label="Open settings" icon="settings" color="neutral" variant="outline" onClick={() => go('Settings')} />
      </Card>
    </View>
  </View>;
}
