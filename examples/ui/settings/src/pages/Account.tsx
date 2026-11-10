import { createSignal } from 'zinc:ui/solid';
import { Button, Separator, theme } from 'zinc:ui/kit';
export function Account(): i32 {
  const [otherSessions, setOtherSessions] = createSignal(true);
  return <View className="flex-col gap-6">
    <View className="flex-col gap-2">
      <Text className={`text-[15px] font-medium text-${theme().foreground}`}>Demo account</Text>
      <Text className={`text-[13px] text-${theme().foreground}`}>Fieldwork Studio · Personal workspace</Text>
      <Text className={`text-[12px] text-${theme().mutedForeground}`}>Fictional data. There is no signed-in account, password or connection to an identity service.</Text>
    </View>
    <Separator />
    <Text className={`text-[15px] font-medium text-${theme().foreground}`}>Sample sessions</Text>
    <View className="flex-col gap-2">
      <Text className={`text-[13px] text-${theme().foreground}`}>This window · current demo</Text>
      <Show when={otherSessions()}><Text className={`text-[13px] text-${theme().mutedForeground}`}>Studio desktop · 2 hours ago</Text><Text className={`text-[13px] text-${theme().mutedForeground}`}>Travel laptop · yesterday</Text></Show>
    </View>
    <Button label={otherSessions() ? 'End other demo sessions' : 'Restore sample sessions'} variant="outline" onClick={() => setOtherSessions(!otherSessions())} />
    <Text role="status" aria-live="polite" className={`text-[12px] text-${theme().mutedForeground}`}>{otherSessions() ? 'Simulation only: this changes the sample list in this window.' : 'Other sample sessions ended locally. No real device was signed out.'}</Text>
  </View>;
}
