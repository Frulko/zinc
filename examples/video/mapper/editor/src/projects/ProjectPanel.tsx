import { ActiveProjectPanel } from './ActiveProjectPanel';
import { ActiveProjectPhase, activeProjectPhase, playerProject } from './ActiveProject';
import { isLocalPlayer } from '../services/link';
// Local project files are created or inspected independently of the live player.
import { Button } from 'zinc:ui/kit';
import { createSignal } from 'zinc:ui/solid';
import { language } from '../i18n';
import { ProjectPhase, chooseLocalProject, localProjectDetail, localProjectPath, localProjectPhase } from './LocalProject';

function local(fr: string, en: string): string { return language() === 'fr' ? fr : en; }

export function ProjectPanel(): i32 {
  const [name, setName] = createSignal<string>('projet');
  const busy = (): boolean => localProjectPhase() === ProjectPhase.Choosing;
  return <View className="p-3 gap-3">
    <ActiveProjectPanel />
    <Text className="text-sm text-zinc-100">{local('Projets locaux', 'Local projects')}</Text>
    <Text className="text-xs text-zinc-400">{local('Un dossier contient le mapping, le show, les scènes et les médias. Créer ou examiner prépare le dossier ; ouvrir le charge sur le lecteur local.', 'A folder contains mapping, show, scenes and media. Create or inspect prepares the folder; open loads it on the local player.')}</Text>
    <Text className="text-xs text-zinc-400">{local('Nom du nouveau projet · lettres sans accents, chiffres, - et _', 'New project name · unaccented letters, numbers, - and _')}</Text>
    <Input className="w-[240] h-[32] px-2 rounded bg-zinc-800 text-zinc-100 text-sm" aria-label={local('Nom du projet', 'Project name')} value={name()} onChange={(value: string) => setName(value)} />
    <View className="flex-row flex-wrap gap-2">
      <Button label={local('Créer un projet local', 'Create local project')} disabled={busy()} onClick={() => { chooseLocalProject(true, name()); }} />
      <Button label={local('Examiner un projet local', 'Inspect local project')} variant="secondary" disabled={busy()} onClick={() => { chooseLocalProject(false, ''); }} />
    </View>
    {localProjectDetail() !== '' && <Text className="text-xs text-zinc-300">{localProjectDetail()}</Text>}
    {localProjectPath() !== '' && <View className="gap-2">
      <Text className="text-xs text-zinc-100">{localProjectPath()}</Text>
      {isLocalPlayer() && <Button label={local('Ouvrir sur le lecteur local', 'Open on local player')} disabled={busy() || activeProjectPhase() === ActiveProjectPhase.Working} onClick={() => { playerProject('open', localProjectPath()); }} />}
      {!isLocalPlayer() && <Text className="text-xs text-zinc-400">{local('Pour utiliser ce dossier, démarrez Mapper avec --project suivi de son chemin, puis connectez cet éditeur à ce lecteur. Le lecteur courant conserve ses propres fichiers.', 'To use this folder, start Mapper with --project followed by its path, then connect this editor to that player. The current player keeps its own files.')}</Text>}
    </View>}
  </View>;
}
