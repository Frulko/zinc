import { createSignal } from 'zinc:ui/solid';

export type VehicleState = { speedKph: number; rpm: number; gear: string; fuelPct: number };
export const [vehicle, setVehicle] = createSignal<VehicleState>({ speedKph: 0, rpm: 0, gear: 'P', fuelPct: 68 });
