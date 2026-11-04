// Calibration: the size each media should be, and the templates to compose over in Premiere or Cavalry.
import { Button } from 'zinc:ui/kit';
import { Point, footprint, mediaSize } from '../model/geometry';
import { layerSvg, outputSvg } from '../model/templates';
import { saveText } from '../services/files';
import { placementOf, revision, store, surfaceOf, templateOf, word } from '../state';
import { Heading } from './Field';

function recommended(layer: any): Point {
  const surface = surfaceOf(layer);
  return mediaSize(footprint(placementOf(layer), store.aspect, store.pixels), surface[0], surface[1]);
}

function plainFileName(name: string): string { return name.replace(/[^A-Za-z0-9_-]+/g, '-'); }

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

function LayerLine(props: { layer: any }): i32 {
  const size = recommended(props.layer);
  const name = word(props.layer, 'name');
  return <View className="flex-row items-center gap-2 h-[30]">
    <Text className="text-xs text-zinc-100 grow">{`${name}: ${size[0]} x ${size[1]}`}</Text>
    <Button size="sm" variant="secondary" label="Template SVG" onClick={() => { saveText(`${plainFileName(name)}-template.svg`, layerSvg(templateOf(props.layer), size)); }} />
  </View>;
}

function LayerLines(): i32 {
  return <View>{store.layers.map((layer: any) => <LayerLine layer={layer} />)}</View>;
}

export function CalibrationPanel(): i32 {
  return <View className="p-3">
    <Heading text="Make media that fit" />
    <Text className="text-xs text-zinc-400 mb-2">Each size is the pixels the layer covers on the output: a media of that size is shown 1:1. Compose over its template; the mapper warps the result.</Text>
    {revision() >= 0 && <LayerLines />}
    <View className="flex-row gap-1 mt-2">
      <Button size="sm" variant="secondary" label="Stage SVG" onClick={() => { saveText('stage-template.svg', allTemplates()); }} />
      <Button size="sm" variant="secondary" label="calibration.json" onClick={() => { saveText('calibration.json', calibrationJson()); }} />
    </View>
  </View>;
}
