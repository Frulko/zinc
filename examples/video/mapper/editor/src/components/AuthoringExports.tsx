// Authoring exports use the connected mapping geometry; media are authored flat.
import { Button } from 'zinc:ui/kit';
import { Point, footprint, mediaSize } from '../model/geometry';
import { afterEffectsScript } from '../model/afterEffects';
import { cavalryScene, CavalryZone } from '../model/cavalryScene';
import { AuthoringZone, layerSvg, outputSvg } from '../model/templates';
import { saveText } from '../services/files';
import { placementOf, setStatus, store, surfaceOf, templateOf, word } from '../state';
import { Heading } from './Field';
import { Rebuilt } from './Rebuilt';
import { language, tr } from '../i18n';

function recommended(layer: any): Point {
  const surface = surfaceOf(layer);
  return mediaSize(footprint(placementOf(layer), store.aspect, store.pixels), surface[0], surface[1]);
}

function plainFileName(name: string): string { return name.replace(/[^A-Za-z0-9_-]+/g, '-'); }

async function exportText(name: string, text: string): Promise<void> {
  try {
    const saved = await saveText(name, text);
    setStatus(saved ? `${language() === 'fr' ? 'Export enregistré' : 'Export saved'}: ${name}` : (language() === 'fr' ? 'Export annulé.' : 'Export cancelled.'));
  } catch (error) { setStatus(`${error}`); }
}

function calibrationJson(): string {
  const layers: string[] = [];
  for (const layer of store.layers) {
    const entry = {
      name: word(layer, 'name'),
      recommendedMediaSize: recommended(layer),
      coveredPixels: footprint(placementOf(layer), store.aspect, store.pixels),
      surfaceMetres: surfaceOf(layer),
      corners: layer.corners, position: layer.position, scale: layer.scale, rotation: layer.rotation,
      mesh: layer.mesh, crop: layer.crop, edge: layer.edge, fit: layer.fit,
      masks: templateOf(layer).masks,
    };
    layers.push(JSON.stringify(entry));
  }
  return `{"output":{"pixels":${JSON.stringify(store.pixels)},"aspect":${store.aspect}},"lens":${JSON.stringify(store.lens)},"layers":[${layers.join(',')}]}`;
}

function allTemplates(): string { return outputSvg(store.layers.map((layer: any) => templateOf(layer)), store.aspect, store.pixels); }

function authoringZones(): AuthoringZone[] {
  return store.layers.map((layer: any): AuthoringZone => {
    const size = recommended(layer);
    return { name: word(layer, 'name'), width: size[0], height: size[1], masks: templateOf(layer).masks };
  });
}

async function exportCavalry(): Promise<void> {
  try {
    const zones = authoringZones().map((zone: AuthoringZone): CavalryZone => ({ name: zone.name, width: zone.width, height: zone.height, masks: zone.masks, media: '' }));
    await exportText('Mapper.cv', cavalryScene(zones, []));
  } catch (error) { setStatus(`${error}`); }
}

function LayerLine(props: { layer: any }): i32 {
  const size = recommended(props.layer);
  const name = word(props.layer, 'name');
  return <View className="flex-row items-center gap-2 h-[30]">
    <Text className="text-xs text-zinc-100 grow">{`${name}: ${size[0]} x ${size[1]}`}</Text>
    <Button size="sm" variant="secondary" label={tr('mapper.calibration.templateSvg')} onClick={() => { exportText(`${plainFileName(name)}-template.svg`, layerSvg(templateOf(props.layer), size)); }} />
  </View>;
}

function LayerLines(): i32 {
  return <View>{store.layers.map((layer: any) => <LayerLine layer={layer} />)}</View>;
}

export function AuthoringExports(): i32 {
  return <View className="p-3 gap-2">
    <Text className="text-sm text-zinc-100">{language() === 'fr' ? 'Guides du lecteur connecté' : 'Connected player’s guides'}</Text>
    <Heading text={tr('mapper.calibration.fitHeading')} />
    <Text className="text-xs text-zinc-400 mb-2">{tr('mapper.calibration.fitHint')}</Text>
    <Rebuilt make={LayerLines} />
    <View className="flex-row flex-wrap gap-1 mt-2">
      <Button size="sm" variant="secondary" label={tr('mapper.calibration.stageSvg')} onClick={() => { exportText('stage-template.svg', allTemplates()); }} />
      <Button size="sm" variant="secondary" disabled={store.layers.length === 0} label="After Effects · guides (.jsx)" onClick={() => { exportText('mapper-guides.jsx', afterEffectsScript(authoringZones())); }} />
      <Button size="sm" variant="secondary" disabled={store.layers.length === 0} label="Cavalry · scène (.cv)" onClick={() => { exportCavalry(); }} />
      <Button size="sm" variant="secondary" label="calibration.json" onClick={() => { exportText('calibration.json', calibrationJson()); }} />
    </View>
    <Text className="text-xs text-zinc-400">{language() === 'fr' ? 'Guides éditables à plat, sans médias, animation, courbes ni déformation. Cavalry : scène native sans médias, avec contours non rendus. Le projet avec médias est disponible dans l’éditeur natif. Le mapping sera appliqué par le lecteur.' : 'Editable flat guides, without media, animation, curves or warp. Cavalry: native scene without media, with non-rendering outlines. Export the project with media from the native editor. Mapping is applied by the player.'}</Text>
  </View>;
}
