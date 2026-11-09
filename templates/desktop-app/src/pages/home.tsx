import { Card, CardHeader, CardFooter, Button, heading, mutedText } from 'zinc:ui/kit';
import { userName, notes, go } from '../state';

export function Home(): i32 {
  return <View className="flex-col gap-6">
    <View className="flex-col gap-1">
      <Text className={heading(3)}>{userName() === '' ? 'Welcome' : `Welcome, ${userName()}`}</Text>
      <Text className={mutedText()}>A starting point: replace these pages with yours.</Text>
    </View>
    <View className="flex-row gap-4">
      <Card className="grow basis-0">
        <CardHeader title="Notes" description={`${notes().length} note(s) saved on this machine.`} />
        <CardFooter><Button label="Open notes" onClick={() => go('Notes')} /></CardFooter>
      </Card>
      <Card className="grow basis-0">
        <CardHeader title="Settings" description="Your name, dark mode, what this platform offers." />
        <CardFooter><Button label="Open settings" variant="outline" onClick={() => go('Settings')} /></CardFooter>
      </Card>
    </View>
  </View>;
}
