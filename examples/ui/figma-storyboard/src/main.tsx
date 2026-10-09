import * as ui from 'zinc:ui';
import { createSignal } from 'zinc:ui/solid';
import { ThermostatApp } from './design';
const [temperature, setTemperature] = createSignal<number>(21);
ui.mount(ThermostatApp({ temperature, targetChanged: (value: number) => {
  setTemperature(value);
  console.log('targetChanged', value);
} }), 0xffffff, null);
