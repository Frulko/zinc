// A small phone control for aligning one corner while watching the projector.
import { Button } from 'zinc:ui/kit';
import { For, createSignal } from 'zinc:ui/solid';
import { language, tr } from '../i18n';
import { connected, currentLayer, pointRevision, selectLayer, showCalibrationCard, status, store, touch, touchPoint, word } from '../state';
import { MODE_CORNERS, outputEditor, outputPoints, selectedPointText, setOutputMode } from './OutputCanvas';
import { Rebuilt } from './Rebuilt';
import { RemotePad } from './RemotePad';

function local(fr: string, en: string): string { return language() === 'fr' ? fr : en; }

function ZoneButtons(): i32 {
  return <View className="flex-row flex-wrap gap-2">
    {store.layers.map((layer: any, index: i32) => <Button label={word(layer, 'name')} variant={store.selected === index ? 'default' : 'secondary'} onClick={() => {
      selectLayer(index);
      outputEditor.pick(0, false);
      touchPoint();
    }} />)}
  </View>;
}

function PointButtons(): i32 {
  return <View className="flex-row gap-2">
    {[0, 1, 2, 3].map((index: i32) => <Button label={`P${index + 1}`} variant={outputEditor.isSelected(index) ? 'default' : 'secondary'} onClick={() => {
      outputEditor.pick(index, false);
      touchPoint();
      touch();
    }} />)}
  </View>;
}

function Readout(): i32 {
  return <For each={[pointRevision()]}>{(version: i32) => <Text className="text-sm text-zinc-300">{selectedPointText()}</Text>}</For>;
}

export function RemoteScreen(): i32 {
  const [step, setStep] = createSignal(1);
  const [locked, setLocked] = createSignal(true);
  setOutputMode(MODE_CORNERS);
  outputEditor.pick(0, false);
  const move = (dx: number, dy: number): void => {
    if (locked() || !connected() || currentLayer() === null || store.pixels[0] <= 0 || store.pixels[1] <= 0) return;
    outputEditor.move(outputPoints(), dx / store.pixels[0], dy / store.pixels[1]);
    touchPoint();
  };
  return <ScrollView className="grow bg-zinc-950">
    <View className="p-4 gap-4">
      <Text className="text-lg text-zinc-100">Mapper · {local('Réglage', 'Alignment')}</Text>
      <Text className="text-xs text-zinc-400">{local('Choisissez une zone et un point, puis regardez la projection en utilisant les flèches.', 'Choose a zone and a point, then watch the projection while using the arrows.')}</Text>
      <Text className="text-sm text-zinc-300">{local('Zone', 'Zone')}</Text>
      <Rebuilt make={ZoneButtons} />
      <Text className="text-sm text-zinc-300">{local('Point', 'Point')}</Text>
      <Rebuilt make={PointButtons} />
      <Readout />
      <Button variant={locked() ? 'default' : 'secondary'} label={locked() ? local('Déverrouiller le réglage', 'Unlock alignment') : local('Verrouiller le réglage', 'Lock alignment')} onClick={() => setLocked(!locked())} />
      <View className="flex-row gap-2 items-center">
        <Text className="text-sm text-zinc-300">{local('Pas', 'Step')}</Text>
        {[1, 5, 10].map((n: i32) => <Button label={`${n} px`} variant={step() === n ? 'default' : 'secondary'} onClick={() => setStep(n)} />)}
      </View>
      <View className="items-center gap-2">
        <Button disabled={locked()} label={`↑  ${tr('mapper.slider.top')}`} onClick={() => move(0, -step())} />
        <View className="flex-row gap-3">
          <Button disabled={locked()} label={`←  ${tr('mapper.slider.left')}`} onClick={() => move(-step(), 0)} />
          <Button disabled={locked()} label={`${tr('mapper.slider.right')}  →`} onClick={() => move(step(), 0)} />
        </View>
        <Button disabled={locked()} label={`↓  ${tr('mapper.slider.bottom')}`} onClick={() => move(0, step())} />
      </View>
      <RemotePad locked={locked} target={() => `${store.selected}:${outputEditor.selection.join(',')}`} move={move} />
      <View className="flex-row gap-2">
        <Button variant="secondary" label={tr('mapper.calibration.card.grid')} onClick={() => showCalibrationCard('grid', store.selected)} />
        <Button variant="secondary" label={tr('mapper.calibration.card.off')} onClick={() => showCalibrationCard('off', -1)} />
      </View>
      <Text className="text-xs text-zinc-400">{status()}</Text>
    </View>
  </ScrollView>;
}
