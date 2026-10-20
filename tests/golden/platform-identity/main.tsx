// Platform identity (docs/reports/mobile-native-feel.md item 1): what a program sees under ZINC_PLATFORM=android|ios and on the desktop.
import { Platform } from 'zinc:react-native';
import { TARGET } from 'zinc:platform';
import { platform } from 'zinc:sys';
import * as ui from 'zinc:ui';
import { which } from './which';

const branch = Platform.select({ ios: 'ios', android: 'android', native: 'native' }, 'none');
const def = Platform.select({ default: 'default' }, 'none');
console.log(`platform=${platform()} OS=${Platform.OS} Version=${Platform.Version} TARGET=${TARGET} select=${branch} default=${def} style=${ui.platformStyle()} coarse=${ui.pointerIsCoarse()} file=${which()}`);
