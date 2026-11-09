// Calibration: the size each media should be, and the templates to compose over in Premiere or Cavalry.
import { Button, Tabs } from 'zinc:ui/kit';
import { createSignal } from 'zinc:ui/solid';
import { store, showCalibrationCard } from '../state';
import { Heading } from './Field';
import { Rebuilt } from './Rebuilt';
import { tr } from '../i18n';
import { AuthoringExports } from './AuthoringExports';

const CARDS: string[] = ['grid', 'focus', 'colours', 'white', 'sync'];
function cardTargets(): string[] { return [tr('mapper.calibration.target.output'), tr('mapper.calibration.target.layers'), tr('mapper.calibration.target.selected')]; }
const [cardTarget, setCardTarget] = createSignal(0 as i32);

function targetOfCard(): i32 {
  if (cardTarget() === 0) return -1;
  return cardTarget() === 1 ? -2 : store.selected;
}

function CardButtons(): i32 {
  return <View className="flex-row flex-wrap gap-1 mt-1">
    {CARDS.map((kind: string) => <Button size="sm" variant={store.card === kind ? 'default' : 'secondary'} label={tr(`mapper.calibration.card.${kind}`)} onClick={() => showCalibrationCard(kind, targetOfCard())} />)}
    <Button size="sm" variant="ghost" label={tr('mapper.calibration.card.off')} onClick={() => showCalibrationCard('off', -1)} />
  </View>;
}

function CardChooser(): i32 {
  return <View className="mb-2">
    <Tabs items={cardTargets()} selected={cardTarget} onSelect={setCardTarget} />
    <Rebuilt make={CardButtons} />
  </View>;
}

export function CalibrationPanel(): i32 {
  return <View className="p-3">
    <Heading text={tr('mapper.calibration.cardsHeading')} />
    <Text className="text-xs text-zinc-400 mb-2">{tr('mapper.calibration.cardsHint')}</Text>
    <CardChooser />
    <AuthoringExports />
  </View>;
}
