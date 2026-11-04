// How this editor behaves. These stay with the browser or the client; the status card belongs to the mapper.
import { Switch } from 'zinc:ui/kit';
import { send } from '../services/link';
import { setOptions, showSelection, store, touch } from '../state';
import { Heading, NumberField, Row } from './Field';
import { Rebuilt } from './Rebuilt';

function Choices(): i32 {
  return <View className="gap-2">
    <Switch label="Frame around the selected layer, on the projector" checked={() => store.options.selectionFrame} onChange={(on: boolean) => {
      setOptions((options) => { options.selectionFrame = on; });
      showSelection();
      touch();
    }} />
    <Switch label="Focus ring on the canvases (the keyboard's yellow outline)" checked={() => store.options.focusRing} onChange={(on: boolean) => {
      setOptions((options) => { options.focusRing = on; });
      touch();
    }} />
    <Switch label="Status card and address on the projector" checked={() => store.hudShown} onChange={(on: boolean) => {
      store.hudShown = on;
      send('/hud', [on ? 1 : 0]);
      touch();
    }} />
    <Row label="arrow step"><NumberField label="pixels an arrow moves a point" value={() => store.options.fineStep} onChange={(v: number) => {
      if (v > 0) setOptions((options) => { options.fineStep = v; });
    }} /></Row>
    <Row label="Shift step"><NumberField label="pixels an arrow moves a point with Shift" value={() => store.options.coarseStep} onChange={(v: number) => {
      if (v > 0) setOptions((options) => { options.coarseStep = v; });
    }} /></Row>
  </View>;
}

export function OptionsPanel(): i32 {
  return <View className="p-3 gap-2">
    <Heading text="Options" />
    <Rebuilt make={Choices} />
  </View>;
}
