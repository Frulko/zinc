// The room: the real size of each surface and the projector's lens give a 3D scene, shown in three.js and exported as a GLB for any web 3D view.
import { Button } from 'zinc:ui/kit';
import { RoomSurface, SceneSurface, SolvedSurface, sceneGlb, solveRoom, surfaceGrid } from '../model/room';
import { saveBytes } from '../services/files';
import { currentLayer, numbers, placementOf, saveShow, store, surfaceOf, touchRoom, word } from '../state';
import { Heading, NumberField, Row } from './Field';
import { RoomView } from './RoomView';
import { Rebuilt } from './Rebuilt';
import { tr } from '../i18n';

function solvedRoom(): (SolvedSurface | null)[] {
  const surfaces: RoomSurface[] = store.layers.map((layer: any): RoomSurface => ({ name: word(layer, 'name'), placement: placementOf(layer), typed: surfaceOf(layer) }));
  return solveRoom(surfaces, store.links, store.aspect, store.lens);
}

/** The size in metres of a layer: typed, or what its corners, the lens and its links give. */
function sizeOf(layer: any): number[] {
  const solved = solvedRoom()[store.layers.indexOf(layer)];
  return solved === null ? [1, 1] : (solved as SolvedSurface).size;
}

function sceneSurfaces(): SceneSurface[] {
  const room = solvedRoom();
  const surfaces: SceneSurface[] = [];
  store.layers.forEach((layer: any, index: i32) => {
    const solved = room[index];
    if (solved === null || numbers(layer, 'visible')[0] <= 0) return;
    const placed = solved as SolvedSurface;
    surfaces.push({ name: word(layer, 'name').replace(/[^ -~]/g, '?'), colour: numbers(layer, 'color'), grid: surfaceGrid(numbers(layer, 'mesh'), placed.corners) });
  });
  return surfaces;
}

function setSelectedSize(axis: i32, value: number): void {
  const layer = currentLayer();
  if (layer === null || value <= 0) return;
  const size = sizeOf(layer);
  size[axis] = value;
  store.surfaces[word(layer, 'name')] = [size[0], size[1]];
  saveShow();
  touchRoom();
}

function SizeFields(): i32 {
  const layer = currentLayer();
  if (layer === null) return <View />;
  const size = sizeOf(layer);
  return <View>
    <Row label={tr('mapper.room.width')}><NumberField label={tr('mapper.room.widthLabel')} value={() => Math.round(size[0] * 100) / 100} onChange={(v: number) => setSelectedSize(0, v)} /></Row>
    <Row label={tr('mapper.room.height')}><NumberField label={tr('mapper.room.heightLabel')} value={() => Math.round(size[1] * 100) / 100} onChange={(v: number) => setSelectedSize(1, v)} /></Row>
  </View>;
}

export function RoomPanel(): i32 {
  return <View className="p-3">
    <Heading text={tr('mapper.room.heading')} />
    <Rebuilt make={SizeFields} />
    <Row label={tr('mapper.room.throw')}><NumberField label={tr('mapper.room.throwLabel')} value={() => store.lens.throwRatio} onChange={(v: number) => { if (v > 0) { store.lens.throwRatio = v; saveShow(); touchRoom(); } }} /></Row>
    <Row label={tr('mapper.room.shift')}><NumberField label={tr('mapper.room.shiftLabel')} value={() => store.lens.shiftY} onChange={(v: number) => { store.lens.shiftY = v; saveShow(); touchRoom(); }} /></Row>
    <RoomView className="w-full h-[420] mt-2" surfaces={sceneSurfaces} lens={() => store.lens} aspect={() => store.aspect} />
    <View className="mt-2"><Button size="sm" variant="secondary" label={tr('mapper.room.glb')} onClick={() => { saveBytes('mapper-scene.glb', sceneGlb(sceneSurfaces())); }} /></View>
    <Text className="text-[11px] text-zinc-500 mt-1">{tr('mapper.room.hint')}</Text>
  </View>;
}
