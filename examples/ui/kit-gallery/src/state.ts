// Gallery state: a handful of signals the demo controls read and write.
import { createSignal } from 'zinc:ui/solid';
import { setTheme, LIGHT, DARK } from 'zinc:ui/kit';

export const [darkMode, setDarkModeSignal] = createSignal<boolean>(false);
export const [tab, setTab] = createSignal<i32>(0);
export const [volume, setVolume] = createSignal<number>(60);
export const [notifications, setNotifications] = createSignal<boolean>(true);
export const [autoUpdate, setAutoUpdate] = createSignal<boolean>(false);
export const [clicks, setClicks] = createSignal<i32>(0);
export const [upload, setUpload] = createSignal<number>(64);
export const [confirming, setConfirming] = createSignal<boolean>(false);

/** Switches the whole kit between the light and the dark theme. */
export function setDarkMode(on: boolean): void {
  setDarkModeSignal(on);
  setTheme(on ? DARK : LIGHT);
}

/** Embedded galleries can advance the sample upload from their own frame callback. */
export function advanceUpload(dt: number): void {
  const next = upload() + dt * 12;
  setUpload(next > 100 ? 0 : next);
}
