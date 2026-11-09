import { Button } from 'zinc:ui/kit';
import { language } from '../i18n';
import { ActiveProjectPhase, activeProjectDetail, activeProjectPath, activeProjectPhase, playerProject } from './ActiveProject';

function local(fr: string, en: string): string { return language() === 'fr' ? fr : en; }

export function ActiveProjectPanel(): i32 {
  const busy = (): boolean => activeProjectPhase() === ActiveProjectPhase.Working;
  playerProject('refresh');
  return <View className="gap-3">
    <Text className="text-sm text-zinc-100">{local('Projet du lecteur connecté', 'Connected player’s project')}</Text>
    <Text className="text-xs text-zinc-300">{activeProjectPath()}</Text>
    <View className="flex-row gap-2">
      <Button label={local('Enregistrer maintenant', 'Save now')} disabled={busy()} onClick={() => { playerProject('save'); }} />
      <Button label={local('Actualiser', 'Refresh')} variant="secondary" disabled={busy()} onClick={() => { playerProject('refresh'); }} />
    </View>
    {busy() && <Text className="text-xs text-zinc-400">{local('En cours…', 'Working…')}</Text>}
    {activeProjectPhase() === ActiveProjectPhase.Failed && <Text className="text-xs text-zinc-300">{activeProjectDetail()}</Text>}
    {activeProjectDetail() === 'save' && <Text className="text-xs text-zinc-300">{local('Projet enregistré sur le lecteur.', 'Project saved on the player.')}</Text>}
    {activeProjectDetail() === 'open' && <Text className="text-xs text-zinc-300">{local('Projet ouvert sur le lecteur.', 'Project opened on the player.')}</Text>}
  </View>;
}
