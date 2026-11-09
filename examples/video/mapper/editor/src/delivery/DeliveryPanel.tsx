// Native delivery controls: all paths are selected on the computer running the editor.
import { Button } from 'zinc:ui/kit';
import { createSignal } from 'zinc:ui/solid';
import { platform } from 'zinc:sys';
import { language } from '../i18n';
import { NumberField, Row } from '../components/Field';
import { DeliveryPhase, DeliveryKind, deliver, deliveryDetail, deliveryPhase, canCancelBake, cancelBake } from './Delivery';
import { localProjectPath } from '../projects/LocalProject';
import { ProjectPanel } from '../projects/ProjectPanel';

function local(fr: string, en: string): string { return language() === 'fr' ? fr : en; }

export function DeliveryPanel(): i32 {
  const [width, setWidth] = createSignal<number>(1280);
  const [height, setHeight] = createSignal<number>(720);
  const [fps, setFps] = createSignal<number>(30);
  const [duration, setDuration] = createSignal<number>(4);
  const [column, setColumn] = createSignal<number>(0);
  const busy = (): boolean => deliveryPhase() === DeliveryPhase.Choosing || deliveryPhase() === DeliveryPhase.Running || deliveryPhase() === DeliveryPhase.Cancelling;
  return <View className="p-3 gap-3">
    <ProjectPanel />
    <Text className="text-sm text-zinc-100">{local('Livrer', 'Delivery')}</Text>
    {platform() === 'web' && <Text className="text-xs text-zinc-400">{local('Ouvrez l’éditeur natif sur l’ordinateur qui contient le projet pour assembler ou exporter.', 'Open the native editor on the computer holding the project to assemble or bake it.')}</Text>}
    {platform() !== 'web' && <View className="gap-3">
      <Text className="text-xs text-zinc-400">{local('Choisissez un projet local enregistré. Arrêtez son lecteur avant l’assemblage pour obtenir une copie cohérente. Les fichiers d’un lecteur distant ne sont pas copiés automatiquement.', 'Choose a saved local project. Stop its mapper before assembling, so the copied mapping and show agree. A remote player’s files are not copied automatically.')}</Text>
      <Text className="text-xs text-zinc-100">{localProjectPath() !== '' ? localProjectPath() : local('Aucun dossier sélectionné : il sera demandé au lancement.', 'No folder selected: you will choose one when starting.')}</Text>
      <Button label={local('Assembler le projet et ses médias', 'Assemble project and media')} disabled={busy()} onClick={() => { deliver(DeliveryKind.Assemble, 0, 0, 0, 0); }} />
      <Text className="text-xs text-zinc-400">{local('Export statique : une image mappée répétée en MP4 silencieux. Les sources vidéo ne sont pas prises en charge par ce mode ; indiquez la taille exacte de sortie.', 'Static bake: one mapped frame repeated as a silent MP4. Video sources are not supported in this mode; use the exact output size.')}</Text>
      <Row label={local('Largeur', 'Width')}><NumberField label={local('Largeur en pixels', 'Width in pixels')} value={width} onChange={setWidth} /></Row>
      <Row label={local('Hauteur', 'Height')}><NumberField label={local('Hauteur en pixels', 'Height in pixels')} value={height} onChange={setHeight} /></Row>
      <Row label={local('Colonne', 'Column')}><NumberField label={local('Colonne (0 = mapping enregistré)', 'Column (0 = saved mapping)')} value={column} onChange={setColumn} /></Row>
      <Text className="text-xs text-zinc-400">{local('0 : mapping enregistré. 1 et plus : colonne du show, numérotée comme dans la composition.', '0: saved mapping. 1 and up: show column, numbered as in the composition.')}</Text>
      <Row label="FPS"><NumberField label={local('Images par seconde', 'Frames per second')} value={fps} onChange={setFps} /></Row>
      <Row label={local('Secondes', 'Seconds')}><NumberField label={local('Durée en secondes', 'Duration in seconds')} value={duration} onChange={setDuration} /></Row>
      <Button label={local('Exporter le projet Cavalry avec médias', 'Export Cavalry project with media')} disabled={busy()} onClick={() => { deliver(DeliveryKind.Cavalry, width(), height(), fps(), duration()); }} />
      <Text className="text-xs text-zinc-400">{local('Cavalry : une composition à plat par zone, médias du mapping enregistré et bibliothèque copiée. La colonne ne s’applique pas. Contours non rendus ; sans cues, audio, sources générées ni warp. Réglez le cadrage des médias dans Cavalry.', 'Cavalry: one flat composition per zone, saved mapping media and copied library. Column selection does not apply. Non-rendering outlines; no cues, audio, generated sources or warp. Adjust media fit in Cavalry.')}</Text>
      <Button label={local('Exporter le MP4 statique', 'Bake static MP4')} disabled={busy()} onClick={() => { deliver(DeliveryKind.Bake, width(), height(), fps(), duration(), false, column()); }} />
      <Text className="text-xs text-zinc-400">{local('L’export animé prend jusqu’à quatre vidéos depuis leur début, sans son ni transitions : une colonne, 120 images maximum à 1920 × 1080.', 'Animated export takes up to four videos from their start, without sound or transitions: one column, up to 120 frames at 1920 × 1080.')}</Text>
      <Button label={local('Exporter le MP4 animé', 'Bake animated MP4')} disabled={busy()} onClick={() => { deliver(DeliveryKind.Bake, width(), height(), fps(), duration(), true, column()); }} />
      {canCancelBake() && <Button variant="secondary" label={local('Annuler l’export vidéo', 'Cancel video export')} onClick={cancelBake} />}
      <Text className="text-xs text-zinc-400">{local('L’export vidéo peut être annulé. L’assemblage termine sa copie avant une nouvelle opération.', 'Video export can be cancelled. Assembly finishes its copy before another operation.')}</Text>
    </View>}
    {deliveryDetail() !== '' && <Text className="text-xs text-zinc-300">{deliveryDetail()}</Text>}
  </View>;
}
