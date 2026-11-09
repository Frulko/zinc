import { Button, theme } from 'zinc:ui/kit';
import { tr } from '../i18n';
export enum Workspace { Composition, Mapping, Zones, Players, Project, Settings }
const KEYS: string[] = ['composition', 'mapping', 'zones', 'players', 'project'];
export function WorkspaceNavigation(props: { selected: () => Workspace; onSelect: (workspace: Workspace) => void }): i32 {
  return <View className={`flex-row flex-wrap items-center gap-1 px-3 py-2 bg-${theme().card} border-b border-${theme().border}`}>
    <Text className={`text-sm text-${theme().foreground} mr-3`}>{tr('mapper.app.title')}</Text>
    {KEYS.map((key: string, index: i32) => <Button size="sm" variant={props.selected() === index ? 'default' : 'ghost'} label={tr(`mapper.workspace.${key}`)} onClick={() => props.onSelect(index as Workspace)} />)}
    <View className="grow" />
    <Button size="sm" variant={props.selected() === Workspace.Settings ? 'default' : 'ghost'} label={tr('mapper.workspace.settings')} onClick={() => props.onSelect(Workspace.Settings)} />
  </View>;
}
