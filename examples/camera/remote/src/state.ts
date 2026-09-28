// App state: the connected camera, its editable settings and the live view status, as Solid signals.
import { createSignal } from 'zinc:ui/solid';
import * as camera from 'zinc:gphoto2';

/** Settings shown in the panel: the first writable widget found per group (Canon, Nikon, Sony names), then its title. */
export const SETTING_GROUPS: string[][] = [
  ['iso', 'ISO'],
  ['aperture', 'f-number', 'Aperture'],
  ['shutterspeed', 'shutterspeed2', 'Shutter'],
  ['whitebalance', 'WB'],
  ['focusmode', 'Focus'],
  ['exposurecompensation', 'EV'],
  ['imageformat', 'imagequality', 'Format'],
];

/** One camera setting in the panel. Its value is a signal, so the row updates when the camera accepts a change. */
export class Setting {
  widget: camera.Widget;
  title: string;
  value: () => string;
  setValue: (v: string) => void;

  constructor(widget: camera.Widget, title: string) {
    this.widget = widget;
    this.title = title;
    const [value, setValue] = createSignal<string>(widget.value);
    this.value = value;
    this.setValue = setValue;
  }
}

export const [cameras, setCameras] = createSignal<camera.CameraInfo[]>([]);
export const [cameraIndex, setCameraIndex] = createSignal<i32>(0);
export const [model, setModel] = createSignal<string>('');           // '' while no camera is open
export const [status, setStatus] = createSignal<string>('Looking for cameras…');
export const [settings, setSettings] = createSignal<Setting[]>([]);
export const [openMenu, setOpenMenu] = createSignal<i32>(-1);       // index of the setting whose choices are shown
export const [live, setLive] = createSignal<boolean>(false);
export const [stats, setStats] = createSignal<string>('');
export const [busy, setBusy] = createSignal<boolean>(false);          // a capture is running
export const [lastFile, setLastFile] = createSignal<string>('');
