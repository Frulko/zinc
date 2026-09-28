// Buttons: every variant and size, plus a click counter to show they are live.
import { Button, Card, CardHeader, CardContent, CardFooter, Kbd, mutedText } from 'zinc:ui/kit';
import { clicks, setClicks } from '../state';

export function ButtonsCard(): i32 {
  return <Card class="w-[500px]">
    <CardHeader title="Buttons" description="Five variants, four sizes. Arrow keys move the focus." />
    <CardContent>
      <View class="flex-row flex-wrap gap-2">
        <Button label="Default" onClick={() => setClicks(clicks() + 1)} />
        <Button label="Secondary" variant="secondary" />
        <Button label="Outline" variant="outline" />
        <Button label="Ghost" variant="ghost" />
        <Button label="Delete" variant="destructive" />
      </View>
      <View class="flex-row items-center gap-2">
        <Button label="Small" size="sm" variant="outline" />
        <Button label="Large" size="lg" />
        <Button size="icon" variant="outline"><Text class={mutedText()}>+</Text></Button>
        <Button label="Search" variant="secondary"><Kbd label="⌘K" /></Button>
      </View>
    </CardContent>
    <CardFooter>
      <Text class={mutedText()}>Default button clicked {clicks()} times</Text>
    </CardFooter>
  </Card>;
}
