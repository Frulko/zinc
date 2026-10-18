// zinc:device-info: what the machine is, as expo-device names it (docs/react-native.md "Device", docs/guide/03-ui-apps.md). One record from
// zinc:sys device('device') (src/host/sys_host.cpp deviceRecord): iOS from the model identifier and UIDevice's idiom, Android from Build and
// the screen's smallest width (600 dp: a tablet) and UI mode (a TV), macOS from hw.model, Linux from the device tree or the DMI tables. What a
// platform cannot know is '' (0 for totalMemory), never a guess. ZINC_PLATFORM=ios|android on a desktop answers a simulated phone
// (isDevice false; ZINC_DEVICE_MODEL=iPad6,7 or ZINC_DEVICE_TYPE=tablet pick another one).
import { device } from 'zinc:sys';

export enum DeviceType { UNKNOWN = 0, PHONE = 1, TABLET = 2, DESKTOP = 3, TV = 4 }

function record(): any {
  const s = device('device');
  if (s === '') return null;
  try { return JSON.parse(s); } catch (e) { return null; }
}
const r: any = record();
function text(k: string): string { return r !== null && r[k] !== undefined && r[k] !== null ? r[k] as string : ''; }
function kind(t: string): DeviceType {
  if (t === 'phone') return DeviceType.PHONE;
  if (t === 'tablet') return DeviceType.TABLET;
  if (t === 'desktop') return DeviceType.DESKTOP;
  if (t === 'tv') return DeviceType.TV;
  return DeviceType.UNKNOWN;
}
function archs(): string[] {
  const out: string[] = [];
  if (r === null || r.cpuArchitectures === undefined) return out;
  const a = r.cpuArchitectures as any[];
  for (let i = 0; i < a.length; i++) out.push(a[i] as string);
  return out;
}

/** PHONE, TABLET, DESKTOP, TV or UNKNOWN. */
export const deviceType: DeviceType = kind(text('type'));
/** The consumer brand: 'Apple', 'google', 'samsung'... */
export const brand: string = text('brand');
/** The maker: 'Apple', 'Google', 'samsung'... */
export const manufacturer: string = text('manufacturer');
/** The name it is sold under: 'iPad Pro (12.9-inch) (1st generation)', 'Pixel 8', 'MacBook Pro', 'Raspberry Pi 3 Model B Plus Rev 1.3'. */
export const modelName: string = text('modelName');
/** The maker's identifier: 'iPad6,7', 'MacBookPro16,1', 'raspberrypi,3-model-b-plus'; '' on Android (expo-device's null). */
export const modelId: string = text('modelId');
/** Android's device name (Build.DEVICE: 'shiba'); '' elsewhere. */
export const designName: string = text('designName');
/** 'iOS', 'iPadOS', 'Android', 'macOS', a Linux distribution's NAME. */
export const osName: string = text('osName');
/** '16.7', '14', '15.6', a Linux distribution's VERSION_ID. */
export const osVersion: string = text('osVersion');
/** The system's build: '20H240' (iOS, macOS), Build.ID on Android, the kernel's release on Linux. */
export const osBuildId: string = text('osBuildId');
/** Bytes of memory, 0 when unknown (a simulator). */
export const totalMemory: number = r !== null && r.totalMemory !== undefined ? r.totalMemory as number : 0;
/** 'arm64', 'x86_64', Android's ABIs ('arm64-v8a', 'armeabi-v7a'). */
export const supportedCpuArchitectures: string[] = archs();
/** false in a simulator, an emulator or a phone simulated on the desktop (ZINC_PLATFORM). */
export const isDevice: boolean = r !== null && r.isDevice === true;

/** The kind of device, as expo-device's getDeviceTypeAsync (the value is known at start: the promise is already settled). */
export async function getDeviceTypeAsync(): Promise<DeviceType> { return deviceType; }
