import { ActiveProjectPanel } from './ActiveProjectPanel';
// The browser cannot open or create native project directories.
import { language } from '../i18n';

export function ProjectPanel(): i32 {
  return <View className="p-3 gap-3">
    <ActiveProjectPanel />
    <Text className="text-sm text-zinc-100">{language() === 'fr' ? 'Projets locaux' : 'Local projects'}</Text>
    <Text className="text-xs text-zinc-400">{language() === 'fr' ? 'Ouvrez l’éditeur natif sur l’ordinateur où vous voulez créer ou examiner un projet. Le lecteur connecté conserve son propre projet.' : 'Open the native editor on the computer where you want to create or inspect a project. The connected player retains its own project.'}</Text>
  </View>;
}
