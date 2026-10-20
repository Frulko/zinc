// Device information (ZN-761): zinc:device-info's record, Platform.isPad, isTV and constants, on the desktop and under ZINC_PLATFORM=ios|android.
import * as Device from 'zinc:device-info';
import { Platform } from 'zinc:react-native';
import { device } from 'zinc:sys';

async function main(): Promise<void> {
  const t = await Device.getDeviceTypeAsync();
  const kind = t === Device.DeviceType.PHONE ? 'PHONE' : t === Device.DeviceType.TABLET ? 'TABLET' : t === Device.DeviceType.DESKTOP ? 'DESKTOP' : t === Device.DeviceType.TV ? 'TV' : 'UNKNOWN';
  console.log(device('device'));
  console.log(`type=${kind} brand=${Device.brand} manufacturer=${Device.manufacturer} modelName=${Device.modelName} modelId=${Device.modelId} osName=${Device.osName} osVersion=${Device.osVersion} isDevice=${Device.isDevice} memory=${Device.totalMemory > 0} cpus=${Device.supportedCpuArchitectures.join(',')}`);
  const c = Platform.constants;
  console.log(`isPad=${Platform.isPad} isTV=${Platform.isTV} idiom=${c.interfaceIdiom} uiMode=${c.uiMode} systemName=${c.systemName} Model=${c.Model} Brand=${c.Brand}`);
}
main();
