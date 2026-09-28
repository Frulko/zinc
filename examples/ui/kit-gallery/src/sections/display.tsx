// Display components: metric tiles, badges, avatars, alerts and a list.
import { Stat, Badge, Avatar, Alert, List, ListItem, Card, CardHeader, CardContent, captionText } from 'zinc:ui/kit';
import { upload } from '../state';

export function StatsRow(): i32 {
  return <View class="flex-row flex-wrap gap-4">
    <Stat class="grow w-[200px]" label="Revenue" value={() => '$45,231'} hint="+20.1% from last month" />
    <Stat class="grow w-[200px]" label="Uptime" value={() => '99.98'} unit="%" hint="last 30 days">
      <Badge label="Live" variant="success" />
    </Stat>
    <Stat class="grow w-[200px]" label="Upload" value={() => `${Math.floor(upload())}`} unit="%" hint="updates every frame" />
  </View>;
}

export function BadgesCard(): i32 {
  return <Card class="w-[360px]">
    <CardHeader title="Badges and avatars" />
    <CardContent>
      <View class="flex-row flex-wrap gap-2">
        <Badge label="Default" />
        <Badge label="Secondary" variant="secondary" />
        <Badge label="Outline" variant="outline" />
        <Badge label="Success" variant="success" />
        <Badge label="Warning" variant="warning" />
        <Badge label="Error" variant="destructive" />
        <Badge label="Accent" variant="accent" />
      </View>
      <View class="flex-row items-center gap-2">
        <Avatar name="Ada Lovelace" size="sm" />
        <Avatar name="Grace Hopper" />
        <Avatar name="Alan Turing" size="lg" />
        <Text class={captionText()}>initials from a name</Text>
      </View>
    </CardContent>
  </Card>;
}

export function AlertsColumn(): i32 {
  return <View class="flex-col gap-3 w-[420px]">
    <Alert title="Heads up!" description="Components are plain functions: the same code runs under Solid and React." />
    <Alert title="Sensor offline" description="No reading from the probe for 30 s." variant="destructive" />
    <Alert title="Firmware up to date" variant="success" />
  </View>;
}

export function TeamList(): i32 {
  return <List class="w-[360px]">
    <ListItem title="Ada Lovelace" description="ada@example.com" leading={() => <Avatar name="Ada Lovelace" size="sm" />}>
      <Badge label="Owner" variant="secondary" />
    </ListItem>
    <ListItem title="Grace Hopper" description="grace@example.com" leading={() => <Avatar name="Grace Hopper" size="sm" />}
      trailing="Member" onClick={() => {}} />
    <ListItem title="Alan Turing" description="alan@example.com" leading={() => <Avatar name="Alan Turing" size="sm" />}
      trailing="Viewer" onClick={() => {}} />
  </List>;
}
