import { createSignal } from 'zinc:ui/solid';
import { Card, CardHeader, CardContent, CardFooter, Button, Metric, List, ListItem, Table, DataRow, Accordion, PathBar, PathSegment, theme } from 'zinc:ui/kit';
const [chosen, setChosen] = createSignal(false), [expanded, setExpanded] = createSignal<string[]>(['storage']);
const [location, setLocation] = createSignal('/Studio/Field recordings');
const members: DataRow[] = [{ id: 'ada', cells: ['Ada Lovelace', 'Owner', '18'] }, { id: 'grace', cells: ['Grace Hopper', 'Editor', '12'] }, { id: 'alan', cells: ['Alan Turing', 'Viewer', '7'] }];
function segments(): PathSegment[] {
  return [{ label: 'Studio', path: '/Studio', children: [{ label: 'Field recordings', path: '/Studio/Field recordings' }, { label: 'Sketches', path: '/Studio/Sketches' }] }, { label: location().split('/').slice(-1)[0], path: location() }];
}
export function DataOverview(): i32 {
  return <View className="flex-col gap-6">
    <View className="flex-row flex-wrap gap-4 items-start">
      <Card className="w-[300px] max-w-full" selected={chosen} onClick={() => setChosen(!chosen())}><CardHeader title="Field recordings" description="8 recordings · updated today" /><CardContent><Text className={`text-[13px] text-${theme().mutedForeground}`}>Select this project by pointer or keyboard.</Text></CardContent><CardFooter><Text className={`text-[12px] text-${theme().mutedForeground}`}>{chosen() ? 'Selected' : 'Press Enter to select'}</Text></CardFooter></Card>
      <Metric className="w-[220px]" label="Local storage" value={() => '18.4'} unit="GB" delta={() => -2.1} deltaLabel="GB since last week" lowerIsBetter={true} history={() => [23, 22, 24, 21, 20, 18.4]} hint="Of 64 GB available" />
      <List className="w-[280px] max-w-full"><ListItem title="Audio originals" trailing="18 files" onClick={() => {}} /><ListItem title="Shared exports" description="Available to the team" selected={() => true} onClick={() => {}} /><ListItem title="Archived files" description="Managed by the owner" disabled={true} onClick={() => {}} /></List>
    </View>
    <PathBar path={location} segments={segments} onNavigate={setLocation} />
    <Table label="Project members" rows={() => members} columns={[{ id: 'name', label: 'Name', width: 260 }, { id: 'role', label: 'Access', width: 180 }, { id: 'files', label: 'Files', width: 100, align: 'right' }]} compact={true} striped={true} height={110} />
    <Accordion expanded={expanded} onChange={setExpanded} multiple={true} items={[{ id: 'storage', title: 'Where are recordings stored?', content: () => <Text className={`text-[13px] text-${theme().mutedForeground}`}>Originals stay on this device. Export a copy when you share.</Text> }, { id: 'privacy', title: 'Who can open this project?', content: () => <Text className={`text-[13px] text-${theme().mutedForeground}`}>Only the three people listed above have access.</Text> }, { id: 'unavailable', title: 'Managed storage policy', disabled: true, content: () => <View /> }]} />
  </View>;
}
