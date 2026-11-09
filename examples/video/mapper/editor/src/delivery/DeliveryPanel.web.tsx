// Browsers cannot access local projects or run the native delivery tools.
import { language } from '../i18n';
import { ProjectPanel } from '../projects/ProjectPanel';

export function DeliveryPanel(): i32 {
  return <View className="p-3 gap-3"><ProjectPanel />
    <Text className="text-sm text-zinc-100">{language() === 'fr' ? 'Livrer' : 'Delivery'}</Text>
    <Text className="text-xs text-zinc-400">{language() === 'fr' ? 'Ouvrez l’éditeur natif sur l’ordinateur qui contient le projet pour assembler ou exporter.' : 'Open the native editor on the computer holding the project to assemble or bake it.'}</Text>
  </View>;
}
