// The words of the editor: Carnet's own labels (@nbe/dom's i18n, which touches no DOM), in CARNET_LANG (en, fr, es, it, de).
import * as sys from 'zinc:sys';
import { labelsFor } from '@nbe/dom/src/i18n/index';

export const labels = labelsFor(sys.env('CARNET_LANG') !== '' ? sys.env('CARNET_LANG') : 'en');
