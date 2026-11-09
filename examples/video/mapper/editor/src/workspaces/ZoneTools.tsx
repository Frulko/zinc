import { Button, Switch } from 'zinc:ui/kit';
import { MASK_SLOTS, currentLayer, maskValues, setLayer, store, touch } from '../state';
import { send } from '../services/link';
import { tr } from '../i18n';
import { IconButton, Row, ValueSlider } from '../components/Field';
import { curveChosenPoints, currentMask, selectMask } from '../components/SurfaceCanvas';
const NEW_MASK: number[] = [0, 0, 0.3, 0.3, 0.7, 0.3, 0.7, 0.7, 0.3, 0.7];
const MAX_FEATHER = 0.3;

function addMask(): void {
  const layer = currentLayer();
  if (layer === null) return;
  for (const slot of MASK_SLOTS) {
    if (maskValues(layer, slot).length >= 8) continue;
    selectMask(slot);
    setLayer(`mask/${slot}`, NEW_MASK.slice());
    touch();
    return;
  }
}

export function ZoneTools(): i32 {
  const layer = currentLayer();
  if (layer === null) return <View />;
  const mask = maskValues(layer, currentMask());
  const existing = MASK_SLOTS.filter((slot: i32) => maskValues(layer, slot).length >= 8);
  return <View className="flex-row flex-wrap gap-2 items-center">
    <Button size="sm" variant="secondary" label={tr('mapper.mask.add')} onClick={addMask} />
    {existing.map((slot: i32) => <Button size="sm" variant={slot === currentMask() ? 'default' : 'ghost'} label={tr('mapper.mask.name', ['slot', `${slot}`])} onClick={() => { selectMask(slot); touch(); }} />)}
    {mask.length >= 8 && <Switch label={tr('mapper.mask.hideInside')} checked={() => mask[1] > 0} onChange={(on: boolean) => {
      mask[1] = on ? 1 : 0;
      setLayer(`mask/${currentMask()}`, mask);
      touch();
    }} />}
    {mask.length >= 8 && <IconButton icon="spline" variant="secondary" label={tr('mapper.mask.curve')} onClick={() => { curveChosenPoints(true); touch(); }} />}
    {mask.length >= 8 && <IconButton icon="square" variant="secondary" label={tr('mapper.mask.corner')} onClick={() => { curveChosenPoints(false); touch(); }} />}
    {mask.length >= 8 && <IconButton icon="trash" label={tr('mapper.mask.delete')} onClick={() => {
      layer[`mask/${currentMask()}`] = [];
      layer[`maskcurve/${currentMask()}`] = [];
      send(`/layer/${store.selected}/mask/${currentMask()}`, []);
      touch();
    }} />}
    {mask.length >= 8 && <View className="w-[260]"><Row label={tr('mapper.mask.feather')}><ValueSlider min={0} max={MAX_FEATHER} read={() => mask[0]} write={(v: number) => {
      mask[0] = v;
      setLayer(`mask/${currentMask()}`, mask);
    }} /></Row></View>}
  </View>;
}
