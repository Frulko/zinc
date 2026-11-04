// How this editor behaves. These stay with the browser or the client; the status card belongs to the mapper.
import { Button, Switch } from 'zinc:ui/kit';
import { LANGUAGES, language, languageName, setLanguage, tr } from '../i18n';
import { send } from '../services/link';
import { setOptions, showSelection, store, touch } from '../state';
import { Heading, NumberField, Row } from './Field';
import { Rebuilt } from './Rebuilt';

function Choices(): i32 {
  return <View className="gap-2">
    <Switch label={tr('mapper.options.frame')} checked={() => store.options.selectionFrame} onChange={(on: boolean) => {
      setOptions((options) => { options.selectionFrame = on; });
      showSelection();
      touch();
    }} />
    <Switch label={tr('mapper.options.focusRing')} checked={() => store.options.focusRing} onChange={(on: boolean) => {
      setOptions((options) => { options.focusRing = on; });
      touch();
    }} />
    <Switch label={tr('mapper.options.hud')} checked={() => store.hudShown} onChange={(on: boolean) => {
      store.hudShown = on;
      send('/hud', [on ? 1 : 0]);
      touch();
    }} />
    <Row label={tr('mapper.options.language')}><View className="flex-row gap-1">
      {LANGUAGES.map((lang: string) => <Button size="sm" variant={language() === lang ? 'default' : 'ghost'} label={languageName(lang)} onClick={() => setLanguage(lang)} />)}
    </View></Row>
    <Row label={tr('mapper.options.arrowStep')}><NumberField label={tr('mapper.options.arrowStepLabel')} value={() => store.options.fineStep} onChange={(v: number) => {
      if (v > 0) setOptions((options) => { options.fineStep = v; });
    }} /></Row>
    <Row label={tr('mapper.options.shiftStep')}><NumberField label={tr('mapper.options.shiftStepLabel')} value={() => store.options.coarseStep} onChange={(v: number) => {
      if (v > 0) setOptions((options) => { options.coarseStep = v; });
    }} /></Row>
  </View>;
}

export function OptionsPanel(): i32 {
  return <View className="p-3 gap-2">
    <Heading text={tr('mapper.options.heading')} />
    <Rebuilt make={Choices} />
  </View>;
}
