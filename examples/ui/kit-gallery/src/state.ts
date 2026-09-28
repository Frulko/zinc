// Gallery state: a handful of signals the demo controls read and write.
import { createSignal } from 'zinc:ui/solid';
import { setTheme, LIGHT, DARK } from 'zinc:ui/kit';

export const [darkMode, setDarkModeSignal] = createSignal<boolean>(false);
export const [tab, setTab] = createSignal<i32>(0);
export const [volume, setVolume] = createSignal<number>(60);
export const [notifications, setNotifications] = createSignal<boolean>(true);
export const [autoUpdate, setAutoUpdate] = createSignal<boolean>(false);
export const [clicks, setClicks] = createSignal<i32>(0);
export const [upload, setUpload] = createSignal<number>(0);

/** Switches the whole kit between the light and the dark theme. */
export function setDarkMode(on: boolean): void {
  setDarkModeSignal(on);
  setTheme(on ? DARK : LIGHT);
}

/** Called every frame: a fake upload that loops from 0 to 100 %. */
export function advanceUpload(dt: number): void {
  const next = upload() + dt * 12;
  setUpload(next > 100 ? 0 : next);
}
