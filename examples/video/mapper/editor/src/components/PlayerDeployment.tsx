import { Button } from 'zinc:ui/kit';
import { language } from '../i18n';
import { send } from '../services/link';

export interface Deployment { phase: i32; done: number; total: number; problem: string; path: string; activePath?: string }
function label(fr: string, en: string): string { return language() === 'fr' ? fr : en; }

export function PlayerDeployment(props: { id: string; online: () => boolean; live: () => boolean; revision: () => Deployment | undefined }): i32 {
  const busy = (): boolean => props.revision()?.phase === 1 || props.revision()?.phase === 4 || props.revision()?.phase === 5;
  const ready = (): boolean => props.revision()?.phase === 2;
  const status = (): string => {
    const r = props.revision();
    if (r === undefined) return label('Aucun statut confirmé', 'No confirmed status');
    if (r.phase === 0) return r.activePath !== undefined && r.activePath !== '' ? label('Projet actif · aucun transfert en attente', 'Project active · no pending transfer') : label('Aucun projet préparé', 'No prepared project');
    if (r.problem !== '') return r.problem;
    if (r.phase === 1) return `${label('Transfert', 'Transfer')} ${r.total > 0 ? Math.round(r.done * 100 / r.total) : 0}%`;
    if (r.phase === 5) return label('Vérification avant activation', 'Verifying before activation');
    if (r.phase === 4) return label('Annulation en cours', 'Cancelling');
    if (r.phase === 2 && r.activePath === r.path) return label('Projet activé sur ce player', 'Project active on this player');
    if (r.phase === 2) return label('Projet vérifié, prêt à activer', 'Verified project, ready to activate');
    return label('Le transfert a échoué', 'Transfer failed');
  };
  return <View className="gap-2 py-2">
    <Text className="text-xs text-zinc-300">{status()}</Text>
    <View className="flex-row flex-wrap gap-2">
      <Button size="sm" variant="secondary" disabled={!props.online() || busy()} label={label('Préparer le projet', 'Prepare project')} onClick={() => { send('/fleet/prepare', [], [props.id]); }} />
      <Button size="sm" disabled={!props.online() || !ready() || props.revision()?.path === props.revision()?.activePath} label={label('Activer sur ce player', 'Activate on this player')} onClick={() => { send('/fleet/activate', [], [props.id]); }} />
      <Button size="sm" variant="ghost" disabled={!props.online() || !busy()} label={label('Annuler le transfert', 'Cancel transfer')} onClick={() => { send('/fleet/cancel', [], [props.id]); }} />
      <Button size="sm" variant="ghost" disabled={!props.online()} label={props.live() ? label('Arrêter le suivi direct', 'Stop live follow') : label('Suivre en direct', 'Follow live')} onClick={() => { send('/fleet/live', [props.live() ? 0 : 1], [props.id]); }} />
    </View>
    <Text className="text-xs text-zinc-400">{label('Préparer copie le projet et ses médias sans changer la projection. Activer remplace la projection. Le suivi direct transmet ensuite chaque modification.', 'Prepare copies the project and media without changing projection. Activate replaces projection. Live follow then sends every edit.')}</Text>
  </View>;
}
