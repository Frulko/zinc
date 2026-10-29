import { createSignal } from 'zinc:ui/solid';
import { Session } from 'zinc:carplay';

export type VehicleState = { speedKph: number; rpm: number; gear: string; fuelPct: number; climateOn: boolean; targetCelsius: number };
export const [vehicle, setVehicle] = createSignal<VehicleState>({ speedKph: 0, rpm: 0, gear: 'P', fuelPct: 68, climateOn: true, targetCelsius: 21 });
export function applyVehicle(session: Session | null, state: VehicleState): void {
  setVehicle(state);
  if (session !== null) {
    session.setUltraGauge(2562, state.rpm);
    session.setUltraGauge(1538, state.fuelPct);
    session.setUltraClimate(state.climateOn, state.targetCelsius);
  }
}
